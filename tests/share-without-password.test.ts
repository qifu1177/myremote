/**
 * Bildschirm ohne Passwort freigeben (Settings -> Sicherheit).
 *
 * Der Host meldet sich dafür mit LEEREM Passwort beim Signaling-Server an;
 * zum Verbinden genügt dann die Partner-ID. Vorher lehnte der Server so eine
 * Registrierung mit "missing-id-or-password" ab, ein Beitritt war also gar
 * nicht möglich.
 *
 * Getestet wird gegen den ECHTEN Signaling-Server auf einem freien Port und
 * zusätzlich über die echten Session-Klassen (WebRTC ersetzt durch die
 * Attrappe aus `tests/helpers/fake-webrtc.ts`) — denn erst die Sessions
 * zeigen, dass der komplette Handshake ohne Passwort durchläuft.
 */
import { createRequire } from "node:module";
import WebSocket from "ws";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { ClientToServerMessage, ServerToClientMessage } from "@shared/types";
import { HostSession } from "@renderer/lib/hostSession";
import { ControllerSession } from "@renderer/lib/controllerSession";
import { FakeMediaStream, installFakeWebRtc } from "./helpers/fake-webrtc";

const require_ = createRequire(import.meta.url);
const { startSignalingServer } = require_("../src/signaling-server/server.js") as {
  startSignalingServer: (options?: { port?: number; host?: string; quiet?: boolean }) => Promise<ServerHandle>;
};

interface ServerHandle {
  readonly url: string;
  close: () => Promise<void>;
}

const EVENT_TIMEOUT_MS = 2000;

/** Minimaler WS-Client mit Nachrichtenpuffer (keine Race-Conditions). */
class TestClient {
  private readonly buffer: ServerToClientMessage[] = [];
  private readonly waiters = new Set<() => void>();

  private constructor(private readonly ws: WebSocket) {
    ws.on("message", (raw) => {
      this.buffer.push(JSON.parse(raw.toString()) as ServerToClientMessage);
      this.waiters.forEach((notify) => notify());
    });
  }

  static open(url: string): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => reject(new Error("Verbindung nicht zustande gekommen")), EVENT_TIMEOUT_MS);
      ws.once("open", () => {
        clearTimeout(timer);
        resolve(new TestClient(ws));
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

  waitFor<T extends ServerToClientMessage["type"]>(
    type: T,
    timeoutMs = EVENT_TIMEOUT_MS,
  ): Promise<Extract<ServerToClientMessage, { type: T }>> {
    return new Promise((resolve, reject) => {
      const tryResolve = (): boolean => {
        const index = this.buffer.findIndex((m) => m.type === type);
        if (index === -1) return false;
        const [msg] = this.buffer.splice(index, 1);
        resolve(msg as Extract<ServerToClientMessage, { type: T }>);
        return true;
      };
      if (tryResolve()) return;
      const timer = setTimeout(() => {
        this.waiters.delete(notify);
        reject(new Error(`Timeout (${timeoutMs}ms) beim Warten auf "${type}"`));
      }, timeoutMs);
      const notify = (): void => {
        if (tryResolve()) {
          clearTimeout(timer);
          this.waiters.delete(notify);
        }
      };
      this.waiters.add(notify);
    });
  }

  close(): void {
    this.ws.close();
  }
}

let server: ServerHandle;
const clients: TestClient[] = [];

async function openClient(): Promise<TestClient> {
  const client = await TestClient.open(server.url);
  clients.push(client);
  return client;
}

let idCounter = 0;
function freshHostId(): string {
  idCounter += 1;
  return `40000000${idCounter}`;
}

beforeAll(async () => {
  server = await startSignalingServer({ port: 0, host: "127.0.0.1", quiet: true });
});

afterAll(async () => {
  clients.forEach((c) => c.close());
  await server.close();
});

describe("Signaling: Host ohne Passwort", () => {
  test("Registrierung mit leerem Passwort wird angenommen", async () => {
    const host = await openClient();
    const hostId = freshHostId();

    host.send({ type: "register-host", id: hostId, password: "" });

    const registered = await host.waitFor("registered");
    expect(registered.hostId).toBe(hostId);
  });

  test("Beitritt gelingt allein mit der Partner-ID", async () => {
    const host = await openClient();
    const controller = await openClient();
    const hostId = freshHostId();

    host.send({ type: "register-host", id: hostId, password: "" });
    await host.waitFor("registered");

    controller.send({ type: "join", hostId, password: "" });

    const accepted = await controller.waitFor("join-accepted");
    expect(accepted.hostId).toBe(hostId);
    // Der Host erfährt davon wie immer über peer-joined.
    await expect(host.waitFor("peer-joined")).resolves.toMatchObject({ sessionId: accepted.sessionId });
  });

  test("ein trotzdem gesendetes Passwort blockiert den Beitritt nicht", async () => {
    const host = await openClient();
    const controller = await openClient();
    const hostId = freshHostId();

    host.send({ type: "register-host", id: hostId, password: "" });
    await host.waitFor("registered");

    // Der Controller weiß nicht, dass der Host offen ist, und schickt einen
    // alten Wert aus seinem Formular mit — das darf ihn nicht aussperren.
    controller.send({ type: "join", hostId, password: "irgendwas-altes" });

    await expect(controller.waitFor("join-accepted")).resolves.toBeTruthy();
  });

  test("ohne ID bleibt die Registrierung abgelehnt", async () => {
    const host = await openClient();

    host.send({ type: "register-host", id: "", password: "" });

    const failed = await host.waitFor("register-failed");
    expect(failed.reason).toBe("missing-id-or-password");
  });

  test("ein Host MIT Passwort prüft weiterhin — auch gegen ein leeres", async () => {
    const host = await openClient();
    const controller = await openClient();
    const hostId = freshHostId();

    host.send({ type: "register-host", id: hostId, password: "geheim" });
    await host.waitFor("registered");

    // Der Kern der Regression: Die Lockerung darf nicht dazu führen, dass ein
    // leeres Passwort plötzlich überall passt.
    controller.send({ type: "join", hostId, password: "" });
    expect((await controller.waitFor("join-rejected")).reason).toBe("wrong-password");

    controller.send({ type: "join", hostId, password: "falsch" });
    expect((await controller.waitFor("join-rejected")).reason).toBe("wrong-password");

    controller.send({ type: "join", hostId, password: "geheim" });
    await expect(controller.waitFor("join-accepted")).resolves.toBeTruthy();
  });
});

describe("Sitzung ohne Passwort: kompletter Verbindungsaufbau", () => {
  let restoreWebRtc: () => void;

  beforeEach(() => {
    restoreWebRtc = installFakeWebRtc();
  });

  afterEach(() => {
    restoreWebRtc();
  });

  test("Controller bekommt Bild und Eingabekanal, ohne ein Passwort zu kennen", async () => {
    const hostId = freshHostId();
    const host = new HostSession(server.url, hostId, "", {});
    await host.start(new FakeMediaStream() as unknown as MediaStream);

    let connected = false;
    const controller = new ControllerSession(server.url, hostId, "", {
      onConnected: () => {
        connected = true;
      },
    });
    await controller.connect();

    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && !controller.isInputChannelOpen()) {
      await new Promise((r) => setTimeout(r, 10));
    }

    expect(connected).toBe(true);
    expect(controller.isInputChannelOpen()).toBe(true);

    controller.disconnect();
    host.stop();
  });
});
