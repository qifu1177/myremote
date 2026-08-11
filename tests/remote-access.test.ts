/**
 * End-to-End-Tests des Fernzugriffs auf Protokollebene.
 *
 * Getestet wird der komplette Pairing-/Signaling-Ablauf gegen den ECHTEN
 * Signaling-Server (`src/signaling-server/server.js`) mit echten `ws`-Clients.
 * Der Server läuft dafür auf einem freien Port (Port 0 -> Betriebssystem
 * vergibt ihn) und wird nach den Tests sauber geschlossen.
 *
 * WebRTC selbst wird — wie in `scripts/test-mobile-e2e.mjs` — nur auf
 * Protokollebene simuliert: SDP-Offer/Answer und ICE-Kandidaten sind
 * Platzhalter-Strings. Ein echter Medienfluss bräuchte einen Browser mit
 * Bildschirmfreigabe und ist nicht Gegenstand dieser Tests.
 *
 * Alle Nachrichtentypen/Feldnamen stammen 1:1 aus `src/shared/types.ts`
 * bzw. `src/signaling-server/server.js`.
 */
import { createRequire } from "node:module";
import WebSocket from "ws";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { ClientToServerMessage, ServerToClientMessage } from "@shared/types";

// Der Signaling-Server ist CommonJS und startet beim `require()` bewusst NICHT
// von selbst (nur beim direkten Start via `npm run signaling`).
const require_ = createRequire(import.meta.url);
const { startSignalingServer } = require_("../src/signaling-server/server.js") as {
  startSignalingServer: (options?: {
    port?: number;
    host?: string;
    quiet?: boolean;
  }) => Promise<SignalingServerHandle>;
};

interface SignalingServerHandle {
  readonly port: number;
  readonly url: string;
  close: () => Promise<void>;
}

/** Obergrenze für jedes Warten auf ein Event — verhindert hängende Tests. */
const EVENT_TIMEOUT_MS = 2000;

/**
 * WebSocket-Client mit Nachrichtenpuffer.
 *
 * Wichtig: Alle eingehenden Nachrichten werden ab dem Verbindungsaufbau
 * gepuffert. Dadurch geht keine Nachricht verloren, die eintrifft, bevor der
 * Test darauf zu warten beginnt (klassische Race-Condition) — und es sind
 * keine festen Sleeps nötig.
 */
class TestClient {
  private readonly buffer: ServerToClientMessage[] = [];
  private readonly waiters = new Set<() => void>();
  private closed = false;

  private constructor(
    readonly name: string,
    private readonly ws: WebSocket,
  ) {
    ws.on("message", (raw) => {
      this.buffer.push(JSON.parse(raw.toString()) as ServerToClientMessage);
      this.waiters.forEach((notify) => notify());
    });
    ws.on("close", () => {
      this.closed = true;
      this.waiters.forEach((notify) => notify());
    });
  }

  /** Öffnet eine Verbindung und wartet, bis sie offen ist. */
  static open(url: string, name: string): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => reject(new Error(`${name}: Verbindung zu ${url} nicht zustande gekommen`)), EVENT_TIMEOUT_MS);
      ws.once("open", () => {
        clearTimeout(timer);
        resolve(new TestClient(name, ws));
      });
      ws.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  send(msg: ClientToServerMessage): void {
    this.ws.send(JSON.stringify(msg));
  }

  /**
   * Wartet auf die erste (noch nicht konsumierte) Nachricht, die auf das
   * Prädikat passt. Bereits gepufferte Nachrichten zählen mit.
   *
   * @param label sprechender Name für die Fehlermeldung bei Timeout
   */
  waitFor<T extends ServerToClientMessage["type"]>(
    type: T,
    options: { timeoutMs?: number; where?: (msg: Extract<ServerToClientMessage, { type: T }>) => boolean } = {},
  ): Promise<Extract<ServerToClientMessage, { type: T }>> {
    const timeoutMs = options.timeoutMs ?? EVENT_TIMEOUT_MS;
    const matches = (msg: ServerToClientMessage): msg is Extract<ServerToClientMessage, { type: T }> =>
      msg.type === type && (!options.where || options.where(msg as Extract<ServerToClientMessage, { type: T }>));

    return new Promise((resolve, reject) => {
      const tryResolve = (): boolean => {
        const index = this.buffer.findIndex(matches);
        if (index === -1) return false;
        const [msg] = this.buffer.splice(index, 1);
        resolve(msg as Extract<ServerToClientMessage, { type: T }>);
        return true;
      };

      if (tryResolve()) return;

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`${this.name}: Timeout (${timeoutMs}ms) beim Warten auf "${type}"`));
      }, timeoutMs);

      const notify = (): void => {
        if (tryResolve()) {
          cleanup();
          return;
        }
        if (this.closed) {
          cleanup();
          reject(new Error(`${this.name}: Verbindung geschlossen, bevor "${type}" eintraf`));
        }
      };

      const cleanup = (): void => {
        clearTimeout(timer);
        this.waiters.delete(notify);
      };

      this.waiters.add(notify);
    });
  }

  /** Wartet, bis der Socket geschlossen ist (für deterministische Reconnect-Tests). */
  close(): Promise<void> {
    if (this.closed) return Promise.resolve();
    return new Promise((resolve) => {
      this.ws.once("close", () => resolve());
      this.ws.close();
    });
  }
}

let server: SignalingServerHandle;
const openClients: TestClient[] = [];

async function openClient(name: string): Promise<TestClient> {
  const client = await TestClient.open(server.url, name);
  openClients.push(client);
  return client;
}

beforeAll(async () => {
  // Port 0 => freier Port vom Betriebssystem; keine Kollision mit einem
  // eventuell parallel laufenden `npm run signaling` (Port 8787).
  server = await startSignalingServer({ port: 0, host: "127.0.0.1", quiet: true });
  expect(server.port).toBeGreaterThan(0);
});

afterAll(async () => {
  await Promise.all(openClients.map((c) => c.close()));
  await server.close();
});

// ---------------------------------------------------------------------------
// A) Happy Path — Mobilgerät (Controller) steuert Desktop (Host)
// ---------------------------------------------------------------------------

interface Scenario {
  /** Name des Testfalls */
  name: string;
  /** steuerndes Gerät (Controller) */
  controller: string;
  /** ferngesteuertes Gerät (Host) */
  hostPlatform: string;
  /** Host-ID in Anzeigeform (mit Leerzeichen — der Server normalisiert sie) */
  hostId: string;
  password: string;
}

const scenarios: Scenario[] = [
  { name: "iPad -> Mac", controller: "iPad", hostPlatform: "macOS", hostId: "100 200 301", password: "pw-mac-ipad" },
  { name: "iPad -> Windows", controller: "iPad", hostPlatform: "Windows", hostId: "100 200 302", password: "pw-win-ipad" },
  {
    name: "Android-Phone -> Mac",
    controller: "Android-Phone",
    hostPlatform: "macOS",
    hostId: "100 200 303",
    password: "pw-mac-android",
  },
  {
    name: "Android-Phone -> Windows",
    controller: "Android-Phone",
    hostPlatform: "Windows",
    hostId: "100 200 304",
    password: "pw-win-android",
  },
];

describe("Fernzugriff: Happy Path", () => {
  test.each(scenarios)(
    "$name: vollständiger Handshake (register -> join -> offer/answer -> ICE)",
    async ({ name, controller, hostPlatform, hostId, password }) => {
      const host = await openClient(`Host(${hostPlatform})`);
      const remote = await openClient(`Controller(${controller})`);

      // 1) Host registriert sich mit ID + Passwort.
      host.send({ type: "register-host", id: hostId, password });
      const registered = await host.waitFor("registered");
      // Der Server normalisiert die ID (Leerzeichen entfallen).
      expect(registered.hostId).toBe(hostId.replace(/\s+/g, ""));
      expect(registered.sessionId).toBe("host");

      // 2) Controller tritt mit korrekter ID + Passwort bei.
      remote.send({ type: "join", hostId, password });
      const accepted = await remote.waitFor("join-accepted");
      expect(accepted.hostId).toBe(hostId.replace(/\s+/g, ""));
      expect(accepted.sessionId).toMatch(/^s/);

      // 3) Host wird über den neuen Peer informiert.
      const peerJoined = await host.waitFor("peer-joined");
      expect(peerJoined.sessionId).toBe(accepted.sessionId);

      // 4) Host -> Controller: SDP-Offer (WebRTC nur als Protokoll simuliert).
      const offerSdp = `v=0\r\n(fake-offer ${name})`;
      host.send({
        type: "signal",
        hostId,
        targetSessionId: peerJoined.sessionId,
        data: { kind: "offer", sdp: offerSdp },
      });
      const offer = await remote.waitFor("signal", { where: (m) => m.data.kind === "offer" });
      expect(offer.sessionId).toBe("host");
      expect(offer.data).toEqual({ kind: "offer", sdp: offerSdp });

      // 5) Controller -> Host: SDP-Answer.
      const answerSdp = `v=0\r\n(fake-answer ${name})`;
      remote.send({ type: "signal", hostId, data: { kind: "answer", sdp: answerSdp } });
      const answer = await host.waitFor("signal", { where: (m) => m.data.kind === "answer" });
      expect(answer.sessionId).toBe(accepted.sessionId);
      expect(answer.data).toEqual({ kind: "answer", sdp: answerSdp });

      // 6) ICE-Kandidat Controller -> Host.
      const controllerCandidate = { candidate: `candidate:1 1 udp 1 127.0.0.1 10001 typ host`, sdpMid: "0", sdpMLineIndex: 0 };
      remote.send({ type: "signal", hostId, data: { kind: "ice-candidate", candidate: controllerCandidate } });
      const iceToHost = await host.waitFor("signal", { where: (m) => m.data.kind === "ice-candidate" });
      expect(iceToHost.sessionId).toBe(accepted.sessionId);
      expect(iceToHost.data).toEqual({ kind: "ice-candidate", candidate: controllerCandidate });

      // 7) ICE-Kandidat Host -> Controller.
      const hostCandidate = { candidate: `candidate:2 1 udp 1 127.0.0.1 10002 typ srflx`, sdpMid: "0", sdpMLineIndex: 0 };
      host.send({
        type: "signal",
        hostId,
        targetSessionId: peerJoined.sessionId,
        data: { kind: "ice-candidate", candidate: hostCandidate },
      });
      const iceToController = await remote.waitFor("signal", { where: (m) => m.data.kind === "ice-candidate" });
      expect(iceToController.sessionId).toBe("host");
      expect(iceToController.data).toEqual({ kind: "ice-candidate", candidate: hostCandidate });

      await remote.close();
      await host.close();
    },
  );
});

// ---------------------------------------------------------------------------
// B) Fehler-, Timeout- und Reconnect-Verhalten
// ---------------------------------------------------------------------------

describe("Fernzugriff: Fehlerfälle", () => {
  test("unbekannte Host-ID (Host offline) => join-rejected mit Grund 'host-not-found'", async () => {
    const remote = await openClient("Controller(iPad)");

    remote.send({ type: "join", hostId: "999 999 999", password: "egal" });

    const rejected = await remote.waitFor("join-rejected");
    expect(rejected.reason).toBe("host-not-found");

    await remote.close();
  });

  test("falsches Passwort => join-rejected mit Grund 'wrong-password'", async () => {
    const host = await openClient("Host(macOS)");
    const remote = await openClient("Controller(Android-Phone)");
    const hostId = "200 300 401";

    host.send({ type: "register-host", id: hostId, password: "richtig" });
    await host.waitFor("registered");

    remote.send({ type: "join", hostId, password: "falsch" });
    const rejected = await remote.waitFor("join-rejected");
    expect(rejected.reason).toBe("wrong-password");

    // Der Host darf davon keine peer-joined-Nachricht erhalten haben:
    // deterministisch geprüft über eine kurze Frist (es kann nie eintreffen).
    await expect(host.waitFor("peer-joined", { timeoutMs: 100 })).rejects.toThrow(/Timeout/);

    // Mit korrektem Passwort klappt es anschließend sofort.
    remote.send({ type: "join", hostId, password: "richtig" });
    const accepted = await remote.waitFor("join-accepted");
    expect(accepted.hostId).toBe("200300401");

    await remote.close();
    await host.close();
  });

  test("Timeout-Verhalten: ausbleibendes Offer läuft nach kurzer Frist deterministisch in den Timeout", async () => {
    const host = await openClient("Host(Windows)");
    const remote = await openClient("Controller(iPad)");
    const hostId = "200 300 402";
    const password = "pw-timeout";

    host.send({ type: "register-host", id: hostId, password });
    await host.waitFor("registered");

    remote.send({ type: "join", hostId, password });
    const accepted = await remote.waitFor("join-accepted");
    const peerJoined = await host.waitFor("peer-joined");

    // Der Host antwortet bewusst NICHT — es kann also nie ein Offer eintreffen.
    // Der Timeout ist damit nicht zeitkritisch, sondern sicher.
    await expect(remote.waitFor("signal", { timeoutMs: 100 })).rejects.toThrow(
      /Timeout \(100ms\) beim Warten auf "signal"/,
    );

    // Nach dem Timeout ist die Session weiterhin intakt: ein späteres Offer
    // kommt normal an (der Timeout hat nichts "verschluckt").
    host.send({
      type: "signal",
      hostId,
      targetSessionId: peerJoined.sessionId,
      data: { kind: "offer", sdp: "v=0\r\n(fake-offer late)" },
    });
    const offer = await remote.waitFor("signal");
    expect(offer.data).toEqual({ kind: "offer", sdp: "v=0\r\n(fake-offer late)" });
    expect(accepted.sessionId).toBe(peerJoined.sessionId);

    await remote.close();
    await host.close();
  });

  test("Reconnect: Trennung meldet peer-left, erneuter join wird wieder akzeptiert", async () => {
    const host = await openClient("Host(macOS)");
    const hostId = "200 300 403";
    const password = "pw-reconnect";

    host.send({ type: "register-host", id: hostId, password });
    await host.waitFor("registered");

    // Erste Verbindung des Controllers.
    const first = await openClient("Controller(Android-Phone) #1");
    first.send({ type: "join", hostId, password });
    const firstAccepted = await first.waitFor("join-accepted");
    const firstJoined = await host.waitFor("peer-joined");
    expect(firstJoined.sessionId).toBe(firstAccepted.sessionId);

    // Verbindungsabbruch auf Controller-Seite.
    await first.close();
    const peerLeft = await host.waitFor("peer-left");
    expect(peerLeft.sessionId).toBe(firstAccepted.sessionId);

    // Reconnect mit neuer Verbindung: neue Session, erneut akzeptiert.
    const second = await openClient("Controller(Android-Phone) #2");
    second.send({ type: "join", hostId, password });
    const secondAccepted = await second.waitFor("join-accepted");
    const secondJoined = await host.waitFor("peer-joined");
    expect(secondJoined.sessionId).toBe(secondAccepted.sessionId);
    expect(secondAccepted.sessionId).not.toBe(firstAccepted.sessionId);

    // Und der Handshake funktioniert auf der neuen Session wieder vollständig.
    host.send({
      type: "signal",
      hostId,
      targetSessionId: secondJoined.sessionId,
      data: { kind: "offer", sdp: "v=0\r\n(fake-offer reconnect)" },
    });
    const offer = await second.waitFor("signal", { where: (m) => m.data.kind === "offer" });
    expect(offer.data).toEqual({ kind: "offer", sdp: "v=0\r\n(fake-offer reconnect)" });

    await second.close();
    await host.close();
  });
});
