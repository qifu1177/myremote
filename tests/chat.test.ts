/**
 * Tests der Chat-Funktion zwischen zwei Geräten.
 *
 * Kernanforderung: Text kann **vor** und **nach** dem Aufbau der
 * WebRTC-Verbindung ausgetauscht werden. Deshalb läuft der Chat über den
 * Signaling-Kanal (Relay-Nachricht `{ kind: "chat" }`) und nicht über den
 * DataChannel, der erst mit der Peer-Verbindung entsteht.
 *
 * Getestet wird gegen den ECHTEN Signaling-Server; WebRTC wird durch die
 * verhaltenstreue Attrappe aus `tests/helpers/fake-webrtc.ts` ersetzt.
 */
import { createRequire } from "node:module";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { ChatMessage } from "@shared/types";
import { HostSession } from "@renderer/lib/hostSession";
import { ControllerSession } from "@renderer/lib/controllerSession";
import { FakeMediaStream, installFakeWebRtc } from "./helpers/fake-webrtc";

const require_ = createRequire(import.meta.url);
const { startSignalingServer } = require_("../src/signaling-server/server.js") as {
  startSignalingServer: (o?: { port?: number; quiet?: boolean }) => Promise<{
    url: string;
    close: () => Promise<void>;
  }>;
};

let server: { url: string; close: () => Promise<void> };
let restoreWebRtc: () => void;

beforeAll(async () => {
  server = await startSignalingServer({ port: 0, quiet: true });
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  restoreWebRtc = installFakeWebRtc();
});

afterEach(() => {
  restoreWebRtc();
});

async function waitUntil(check: () => boolean, label: string, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`Timeout (${timeoutMs}ms): ${label}`);
}

let idCounter = 0;
function freshHostId(): string {
  idCounter += 1;
  return `20000000${idCounter}`;
}

interface ChatPair {
  host: HostSession;
  controller: ControllerSession;
  /** Beim Host eingegangene Nachrichten (mit Session des Absenders). */
  hostInbox: Array<{ msg: ChatMessage; sessionId: string }>;
  /** Beim Controller eingegangene Nachrichten. */
  controllerInbox: ChatMessage[];
  hostConnected: () => boolean;
  controllerConnected: () => boolean;
  stop: () => void;
}

/**
 * Startet Host + Controller. Die Peer-Verbindung wird NICHT abgewartet —
 * so lässt sich prüfen, dass der Chat schon vorher funktioniert.
 *
 * @param withStream false = der Host gibt seinen Bildschirm (noch) nicht frei.
 */
async function startPair(withStream = true): Promise<ChatPair> {
  const hostId = freshHostId();
  const password = "geheim123";
  const hostInbox: ChatPair["hostInbox"] = [];
  const controllerInbox: ChatMessage[] = [];
  const errors: string[] = [];
  let hostConnected = false;
  let controllerConnected = false;

  const host = new HostSession(server.url, hostId, password, {
    onChatMessage: (msg, sessionId) => hostInbox.push({ msg, sessionId }),
    onPeerConnected: () => {
      hostConnected = true;
    },
    onError: (m) => errors.push(`host: ${m}`),
  });
  await host.start(withStream ? (new FakeMediaStream() as unknown as MediaStream) : null);

  const controller = new ControllerSession(server.url, hostId, password, {
    onChatMessage: (msg) => controllerInbox.push(msg),
    onConnected: () => {
      controllerConnected = true;
    },
    onRejected: (r) => errors.push(`controller rejected: ${r}`),
    onError: (m) => errors.push(`controller: ${m}`),
  });
  await controller.connect();

  return {
    host,
    controller,
    hostInbox,
    controllerInbox,
    hostConnected: () => hostConnected,
    controllerConnected: () => controllerConnected,
    stop: () => {
      controller.disconnect();
      host.stop();
      expect(errors).toEqual([]);
    },
  };
}

describe("Chat zwischen zwei Geräten", () => {
  test("Controller kann Text senden, BEVOR die Peer-Verbindung steht", async () => {
    const pair = await startPair();
    try {
      // Sofort tippen — ohne auf "connected" zu warten.
      const sent = pair.controller.sendChat("Hallo, bist du da?");
      expect(sent.from).toBe("controller");
      expect(sent.text).toBe("Hallo, bist du da?");

      await waitUntil(() => pair.hostInbox.length === 1, "Nachricht beim Host angekommen");
      expect(pair.hostInbox[0].msg).toEqual(sent);
      expect(pair.hostInbox[0].sessionId).toMatch(/^s/);
    } finally {
      pair.stop();
    }
  });

  test("Host kann antworten, bevor die Peer-Verbindung steht", async () => {
    const pair = await startPair();
    try {
      // Erst wenn der Host den Peer kennt, kann er ihn adressieren.
      await waitUntil(() => pair.host.chatPeerCount > 0, "Host kennt den Controller");
      const sent = pair.host.sendChat("Ja, einen Moment.");
      expect(sent.from).toBe("host");

      await waitUntil(() => pair.controllerInbox.length === 1, "Antwort beim Controller angekommen");
      expect(pair.controllerInbox[0]).toEqual(sent);
      // Die Peer-Verbindung ist für den Chat ausdrücklich nicht nötig.
      expect(pair.controllerInbox[0].text).toBe("Ja, einen Moment.");
    } finally {
      pair.stop();
    }
  });

  test("Chat funktioniert auch NACH dem Verbindungsaufbau in beide Richtungen", async () => {
    const pair = await startPair();
    try {
      await waitUntil(() => pair.hostConnected() && pair.controllerConnected(), "Peer-Verbindung steht");

      const fromController = pair.controller.sendChat("Siehst du meinen Bildschirm?");
      await waitUntil(() => pair.hostInbox.length === 1, "Nachricht beim Host");
      expect(pair.hostInbox[0].msg).toEqual(fromController);

      const fromHost = pair.host.sendChat("Ja, alles gut zu sehen.");
      await waitUntil(() => pair.controllerInbox.length === 1, "Nachricht beim Controller");
      expect(pair.controllerInbox[0]).toEqual(fromHost);
    } finally {
      pair.stop();
    }
  });

  test("mehrere Nachrichten behalten Reihenfolge und haben eindeutige IDs", async () => {
    const pair = await startPair();
    try {
      const texts = ["eins", "zwei", "drei"];
      const sent = texts.map((text) => pair.controller.sendChat(text));

      await waitUntil(() => pair.hostInbox.length === 3, "alle drei Nachrichten angekommen");
      expect(pair.hostInbox.map((e) => e.msg.text)).toEqual(texts);
      expect(new Set(sent.map((m) => m.id)).size).toBe(3);
    } finally {
      pair.stop();
    }
  });

  test("Host sendet an alle verbundenen Controller", async () => {
    const hostId = freshHostId();
    const password = "pw-broadcast";
    const host = new HostSession(server.url, hostId, password, {});
    await host.start(new FakeMediaStream() as unknown as MediaStream);

    const inboxes: ChatMessage[][] = [[], []];
    const controllers = inboxes.map(
      (inbox) =>
        new ControllerSession(server.url, hostId, password, {
          onChatMessage: (msg) => inbox.push(msg),
        }),
    );
    for (const c of controllers) await c.connect();

    try {
      await waitUntil(() => host.chatPeerCount === 2, "Host kennt beide Controller");
      const sent = host.sendChat("Hallo zusammen");
      await waitUntil(() => inboxes.every((i) => i.length === 1), "beide Controller haben die Nachricht");
      expect(inboxes.map((i) => i[0])).toEqual([sent, sent]);
    } finally {
      for (const c of controllers) c.disconnect();
      host.stop();
    }
  });

  test("Host wird über erreichbare Chat-Partner informiert (schon vor der Peer-Verbindung)", async () => {
    const hostId = freshHostId();
    const password = "pw-peers";
    const counts: number[] = [];
    const host = new HostSession(server.url, hostId, password, {
      onChatPeersChanged: (n) => counts.push(n),
    });
    await host.start(new FakeMediaStream() as unknown as MediaStream);

    const controller = new ControllerSession(server.url, hostId, password, {});
    await controller.connect();
    await waitUntil(() => counts.includes(1), "Beitritt gemeldet");

    controller.disconnect();
    await waitUntil(() => counts.at(-1) === 0, "Verlassen gemeldet");
    host.stop();
  });

  test("Chat funktioniert, ohne dass der Host seinen Bildschirm freigibt", async () => {
    const pair = await startPair(false);
    try {
      const fromController = pair.controller.sendChat("Kurze Frage vorab");
      await waitUntil(() => pair.hostInbox.length === 1, "Nachricht beim Host (ohne Freigabe)");
      expect(pair.hostInbox[0].msg).toEqual(fromController);

      const fromHost = pair.host.sendChat("Klar, frag ruhig");
      await waitUntil(() => pair.controllerInbox.length === 1, "Antwort beim Controller (ohne Freigabe)");
      expect(pair.controllerInbox[0]).toEqual(fromHost);
    } finally {
      pair.stop();
    }
  });

  test("Bildschirmfreigabe kann nachträglich gestartet werden — Chat bleibt erhalten", async () => {
    const pair = await startPair(false);
    try {
      pair.controller.sendChat("Zeig mir mal deinen Bildschirm");
      await waitUntil(() => pair.hostInbox.length === 1, "erste Nachricht angekommen");

      await pair.host.setStream(new FakeMediaStream() as unknown as MediaStream);
      await waitUntil(() => pair.hostConnected() && pair.controllerConnected(), "Peer-Verbindung steht");

      pair.controller.sendChat("Jetzt sehe ich ihn");
      await waitUntil(() => pair.hostInbox.length === 2, "zweite Nachricht angekommen");
      expect(pair.hostInbox.map((e) => e.msg.text)).toEqual([
        "Zeig mir mal deinen Bildschirm",
        "Jetzt sehe ich ihn",
      ]);
    } finally {
      pair.stop();
    }
  });

  test("Senden ohne bestehende Session wirft nicht", async () => {
    const controller = new ControllerSession(server.url, freshHostId(), "egal", {});
    expect(() => controller.sendChat("noch nicht verbunden")).not.toThrow();
    controller.disconnect();
  });
});
