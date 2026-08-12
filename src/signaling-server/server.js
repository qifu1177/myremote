/**
 * Einfacher Signaling-Server für myremote.
 *
 * Aufgabe: Er überträgt selbst KEINE Bildschirm- oder Eingabedaten, sondern
 * vermittelt lediglich den Handshake zwischen einem "Host" (gibt seinen
 * Bildschirm frei) und einem "Controller" (möchte den Host fernsteuern):
 *  - Der Host registriert sich mit einer ID + Passwort.
 *  - Der Controller "joint" mit derselben ID + Passwort.
 *  - Bei falschem Passwort wird die Verbindung abgelehnt.
 *  - Nach erfolgreichem Join leitet der Server WebRTC-Signalisierungsdaten
 *    (SDP Offer/Answer, ICE-Kandidaten) zwischen den beiden Peers weiter,
 *    danach läuft die eigentliche Verbindung (Video + DataChannel) direkt
 *    per WebRTC (P2P) zwischen Host und Controller.
 *
 * Start: `npm run signaling` (siehe README.md für Details, z.B. Port per
 * Umgebungsvariable PORT konfigurieren, Server im LAN erreichbar machen).
 *
 * Programmatische Nutzung (z.B. automatisierte Tests):
 *
 *   const { startSignalingServer } = require("./server");
 *   const server = await startSignalingServer({ port: 0, quiet: true });
 *   server.port;      // vom Betriebssystem vergebener freier Port
 *   server.url;       // "ws://127.0.0.1:<port>"
 *   await server.close();
 *
 * Das CLI-Verhalten bleibt davon unberührt: Wird die Datei direkt gestartet
 * (`node src/signaling-server/server.js`), startet der Server wie bisher
 * automatisch auf PORT bzw. 8787.
 */
const { WebSocketServer } = require("ws");
const http = require("http");
const os = require("os");
const { handleRequest, isMobileClientAvailable } = require("./static-http");
const metrics = require("./metrics");

const DEFAULT_PORT = 8787;

/** Port aus der Umgebung (CLI-Standardverhalten), sonst 8787. */
function configuredPort() {
  return process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORT;
}

/**
 * Erzeugt eine eigenständige Signaling-Server-Instanz (HTTP + WebSocket),
 * OHNE sie zu starten. Jede Instanz besitzt ihre eigene Host-Registry, damit
 * mehrere Instanzen (Tests) sich nicht gegenseitig beeinflussen.
 *
 * @param {{ log?: (...args: unknown[]) => void, quiet?: boolean }} [options]
 */
function createSignalingServer(options = {}) {
  const log = options.quiet ? () => {} : options.log || console.log;

  /** hostId -> { ws, password, controllers: Map<sessionId, ws> } */
  const hosts = new Map();

  let sessionCounter = 0;
  function nextSessionId() {
    sessionCounter += 1;
    return `s${Date.now().toString(36)}${sessionCounter}`;
  }

  /**
   * Der Server bedient zwei Protokolle auf demselben Port:
   *  - HTTP: liefert den Mobile-Client (dist/mobile) aus, damit iPad/iPhone/
   *    Android-Phone die App im Browser öffnen können (siehe static-http.js).
   *  - WebSocket: das eigentliche Signaling (Upgrade auf derselben Adresse).
   * Dadurch genügt auf dem Mobilgerät eine einzige URL.
   */
  const httpServer = http.createServer(handleRequest);
  const wss = new WebSocketServer({ server: httpServer });

  /** Zählerstände in die Metriken spiegeln (für /health und Tests). */
  function refreshSessionCounts() {
    let controllerSessions = 0;
    for (const host of hosts.values()) controllerSessions += host.controllers.size;
    metrics.setSessionCounts(hosts.size, controllerSessions);
  }

  wss.on("connection", (ws) => {
    /** Diese Verbindung gehört entweder zu einem Host oder zu einer Controller-Session. */
    const state = { role: null, hostId: null, sessionId: null };

    metrics.onConnectionOpened();
    ws.once("close", () => metrics.onConnectionClosed());

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: "error", message: "invalid-json" });
        return;
      }

      switch (msg.type) {
        case "register-host": {
          const hostId = normalizeId(msg.id);
          if (!hostId || !msg.password) {
            send(ws, { type: "register-failed", reason: "missing-id-or-password" });
            return;
          }
          if (hosts.has(hostId)) {
            send(ws, { type: "register-failed", reason: "id-already-registered" });
            return;
          }
          hosts.set(hostId, {
            ws,
            password: String(msg.password),
            controllers: new Map(),
          });
          state.role = "host";
          state.hostId = hostId;
          send(ws, { type: "registered", hostId, sessionId: "host" });
          refreshSessionCounts();
          log(`[signaling] host registered: ${hostId}`);
          break;
        }

        case "join": {
          const hostId = normalizeId(msg.hostId);
          const host = hosts.get(hostId);
          if (!host) {
            send(ws, { type: "join-rejected", reason: "host-not-found" });
            return;
          }
          if (host.password !== String(msg.password)) {
            send(ws, { type: "join-rejected", reason: "wrong-password" });
            log(`[signaling] rejected join for ${hostId}: wrong password`);
            return;
          }

          // Wiederholtes `join` auf DERSELBEN WebSocket-Verbindung (z.B. durch
          // einen React-StrictMode-Doppelmount des Mobile-Clients oder einen
          // Reconnect-Versuch) ist idempotent: Es entsteht KEINE zweite Session
          // und der Join wird nicht doppelt gezählt. Andernfalls würde die alte
          // Session in `host.controllers` verwaisen (cleanup() kennt nur die
          // zuletzt vergebene sessionId) und `totalJoins` mehrfach hochzählen.
          if (state.role === "controller" && state.sessionId && state.hostId === hostId) {
            host.controllers.set(state.sessionId, ws);
            send(ws, { type: "join-accepted", hostId, sessionId: state.sessionId });
            refreshSessionCounts();
            log(`[signaling] duplicate join ignored for ${hostId} (session ${state.sessionId})`);
            return;
          }

          // Dieselbe Verbindung wechselt zu einem anderen Host: alte Session
          // sauber abmelden, damit keine Karteileiche zurückbleibt.
          if (state.role === "controller" && state.hostId && state.sessionId) {
            const previous = hosts.get(state.hostId);
            if (previous) {
              previous.controllers.delete(state.sessionId);
              send(previous.ws, { type: "peer-left", sessionId: state.sessionId });
            }
          }

          const sessionId = nextSessionId();
          host.controllers.set(sessionId, ws);
          state.role = "controller";
          state.hostId = hostId;
          state.sessionId = sessionId;
          send(ws, { type: "join-accepted", hostId, sessionId });
          send(host.ws, { type: "peer-joined", sessionId });
          metrics.onJoinAccepted();
          refreshSessionCounts();
          log(
            `[signaling] controller joined host ${hostId} as ${sessionId} ` +
              `(aktive Sessions dieses Hosts: ${host.controllers.size})`,
          );
          break;
        }

        case "signal": {
          const hostId = normalizeId(msg.hostId);
          const host = hosts.get(hostId);
          if (!host) return;
          if (state.role === "host") {
            // Host -> spezifischer Controller
            const targetWs = msg.targetSessionId && host.controllers.get(msg.targetSessionId);
            if (targetWs) {
              send(targetWs, { type: "signal", sessionId: "host", data: msg.data });
            }
          } else if (state.role === "controller" && state.sessionId) {
            // Controller -> Host
            send(host.ws, { type: "signal", sessionId: state.sessionId, data: msg.data });
          }
          break;
        }

        case "leave": {
          cleanup();
          break;
        }

        default:
          send(ws, { type: "error", message: "unknown-message-type" });
      }
    });

    ws.on("close", cleanup);
    ws.on("error", cleanup);

    function cleanup() {
      if (state.role === "host" && state.hostId) {
        const host = hosts.get(state.hostId);
        if (host) {
          for (const controllerWs of host.controllers.values()) {
            send(controllerWs, { type: "error", message: "host-disconnected" });
          }
          hosts.delete(state.hostId);
          log(`[signaling] host disconnected: ${state.hostId}`);
        }
      } else if (state.role === "controller" && state.hostId && state.sessionId) {
        const host = hosts.get(state.hostId);
        if (host) {
          host.controllers.delete(state.sessionId);
          send(host.ws, { type: "peer-left", sessionId: state.sessionId });
          log(`[signaling] controller left: ${state.sessionId}`);
        }
      }
      refreshSessionCounts();
    }
  });

  /** Der tatsächlich gebundene Port (0, solange nicht gelauscht wird). */
  function boundPort() {
    const address = httpServer.address();
    return address && typeof address === "object" ? address.port : 0;
  }

  /**
   * Startet den Server. Mit `port === 0` vergibt das Betriebssystem einen
   * freien Port; aufgelöst wird erst, wenn tatsächlich gelauscht wird.
   * @param {number} [port]
   * @param {string} [host] Bind-Adresse (Default: alle Interfaces)
   * @returns {Promise<number>} der tatsächlich gebundene Port
   */
  function listen(port = configuredPort(), host) {
    return new Promise((resolve, reject) => {
      const onError = (err) => reject(err);
      httpServer.once("error", onError);
      // Der WebSocketServer hängt am HTTP-Server und spiegelt dessen
      // "error"-Event. Ohne eigenen Listener wirft Node dort eine
      // unbehandelte Ausnahme (z.B. EADDRINUSE), bevor der Aufrufer das
      // abgelehnte Promise sehen kann.
      wss.once("error", onError);
      const done = () => {
        httpServer.off("error", onError);
        wss.off("error", onError);
        resolve(boundPort());
      };
      if (host === undefined) httpServer.listen(port, done);
      else httpServer.listen(port, host, done);
    });
  }

  /** Schließt alle offenen WebSockets und den HTTP-Server. */
  function close() {
    return new Promise((resolve) => {
      for (const client of wss.clients) {
        try {
          client.terminate();
        } catch {
          /* bereits geschlossen */
        }
      }
      wss.close(() => {
        if (!httpServer.listening) {
          resolve();
          return;
        }
        httpServer.close(() => resolve());
      });
    });
  }

  return {
    httpServer,
    wss,
    hosts,
    listen,
    close,
    get port() {
      return boundPort();
    },
    get url() {
      return `ws://127.0.0.1:${boundPort()}`;
    },
  };
}

/**
 * Erzeugt UND startet eine Server-Instanz. Bequeme Kurzform für Tests:
 * `const server = await startSignalingServer({ port: 0, quiet: true })`.
 *
 * @param {{ port?: number, host?: string, quiet?: boolean, log?: (...args: unknown[]) => void }} [options]
 */
async function startSignalingServer(options = {}) {
  const server = createSignalingServer(options);
  await server.listen(options.port ?? configuredPort(), options.host);
  return server;
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function normalizeId(id) {
  return String(id || "").replace(/\s+/g, "");
}

/** Alle IPv4-LAN-Adressen dieses Rechners (für die Anzeige der Client-URL). */
function lanAddresses() {
  const result = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) result.push(entry.address);
    }
  }
  return result;
}

/** Startbanner des CLI-Modus (unverändertes Verhalten von `npm run signaling`). */
function printStartupBanner(port) {
  console.log(`[signaling] myremote signaling server listening on ws://0.0.0.0:${port}`);
  if (isMobileClientAvailable()) {
    console.log("[signaling] Mobile-Client (iPad/iPhone/Android) erreichbar unter:");
    for (const host of [...lanAddresses(), "localhost"]) {
      console.log(`[signaling]   http://${host}:${port}/`);
    }
  } else {
    console.log("[signaling] Mobile-Client noch nicht gebaut - 'npm run build:mobile' ausfuehren.");
  }
}

/**
 * CLI-Einstiegspunkt: nur beim direkten Start (`node src/signaling-server/server.js`
 * bzw. `npm run signaling`) wird automatisch gelauscht — beim `require()` aus
 * Tests passiert nichts, damit dort kein fester Port belegt wird.
 */
function main() {
  const server = createSignalingServer();
  server.listen(configuredPort()).then(
    (port) => printStartupBanner(port),
    (err) => {
      console.error("[signaling] Serverstart fehlgeschlagen:", err.message);
      process.exitCode = 1;
    },
  );
  return server;
}

const cliServer = require.main === module ? main() : null;

module.exports = {
  createSignalingServer,
  startSignalingServer,
  DEFAULT_PORT,
  /** Nur im CLI-Modus gesetzt (Rückwärtskompatibilität für frühere Nutzung). */
  server: cliServer,
  httpServer: cliServer ? cliServer.httpServer : null,
  wss: cliServer ? cliServer.wss : null,
  hosts: cliServer ? cliServer.hosts : null,
};
