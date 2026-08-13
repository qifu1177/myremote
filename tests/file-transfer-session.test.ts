/**
 * Dateiübertragung zwischen zwei Geräten — end to end.
 *
 * Anders als der Chat (Signaling-Relay) laufen Dateien über einen eigenen
 * WebRTC-DataChannel: Sie sind zu groß für den Signaling-Server und dürfen die
 * Maus-/Tastatur-Events des Eingabe-Kanals nicht ausbremsen.
 *
 * Getestet wird gegen den ECHTEN Signaling-Server; WebRTC wird durch die
 * verhaltenstreue Attrappe aus `tests/helpers/fake-webrtc.ts` ersetzt — sie
 * öffnet einen DataChannel nur, wenn ihn der Offerer (Host) vor `createOffer()`
 * angelegt hat.
 */
import { createRequire } from "node:module";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { FILE_CHANNEL_LABEL } from "@shared/types";
import { HostSession } from "@renderer/lib/hostSession";
import { ControllerSession } from "@renderer/lib/controllerSession";
import type { FileSource, ReceivedFile } from "@renderer/lib/fileTransfer";
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

async function waitUntil(check: () => boolean, label: string, timeoutMs = 3000): Promise<void> {
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
  return `30000000${idCounter}`;
}

function bytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) out[i] = (i * 7) % 256;
  return out;
}

/** Datenquelle mit vorgegebenem Inhalt — strukturell wie ein DOM-`File`. */
function fileSource(name: string, data: Uint8Array, mime = "application/octet-stream"): FileSource {
  return {
    name,
    size: data.byteLength,
    type: mime,
    slice: (start, end) => ({ arrayBuffer: async () => data.slice(start, end).buffer }),
  };
}

interface Pair {
  host: HostSession;
  controller: ControllerSession;
  hostInbox: Array<{ file: ReceivedFile; sessionId: string }>;
  controllerInbox: ReceivedFile[];
  stop: () => void;
}

/** Startet Host + Controller und wartet, bis der Dateikanal beidseitig offen ist. */
async function startPair(): Promise<Pair> {
  const hostId = freshHostId();
  const password = "datei-passwort";
  const hostInbox: Pair["hostInbox"] = [];
  const controllerInbox: ReceivedFile[] = [];
  const errors: string[] = [];

  const host = new HostSession(server.url, hostId, password, {
    onFileReceived: (file, sessionId) => hostInbox.push({ file, sessionId }),
    onError: (m) => errors.push(`host: ${m}`),
  });
  await host.start(new FakeMediaStream() as unknown as MediaStream);

  const controller = new ControllerSession(server.url, hostId, password, {
    onFileReceived: (file) => controllerInbox.push(file),
    onRejected: (r) => errors.push(`controller rejected: ${r}`),
    onError: (m) => errors.push(`controller: ${m}`),
  });
  await controller.connect();

  await waitUntil(
    () => host.canSendFiles && controller.canSendFiles,
    "Dateikanal auf beiden Seiten offen",
  );

  return {
    host,
    controller,
    hostInbox,
    controllerInbox,
    stop: () => {
      controller.disconnect();
      host.stop();
      expect(errors).toEqual([]);
    },
  };
}

describe("Dateiübertragung zwischen zwei Geräten", () => {
  test("Controller sendet eine Datei an den Host", async () => {
    const pair = await startPair();
    try {
      const data = bytes(500);
      await pair.controller.sendFile(fileSource("bericht.pdf", data, "application/pdf"));

      await waitUntil(() => pair.hostInbox.length === 1, "Datei beim Host angekommen");
      expect(pair.hostInbox[0].file.name).toBe("bericht.pdf");
      expect(pair.hostInbox[0].file.mime).toBe("application/pdf");
      expect(Array.from(pair.hostInbox[0].file.data)).toEqual(Array.from(data));
      expect(pair.hostInbox[0].sessionId).toMatch(/^s/);
    } finally {
      pair.stop();
    }
  });

  test("Host sendet eine Datei an den Controller", async () => {
    const pair = await startPair();
    try {
      const data = bytes(1234);
      await pair.host.sendFile(fileSource("logo.png", data, "image/png"));

      await waitUntil(() => pair.controllerInbox.length === 1, "Datei beim Controller angekommen");
      expect(pair.controllerInbox[0].name).toBe("logo.png");
      expect(Array.from(pair.controllerInbox[0].data)).toEqual(Array.from(data));
    } finally {
      pair.stop();
    }
  });

  test("überträgt eine Datei, die deutlich größer als ein Stück ist, byte-genau", async () => {
    const pair = await startPair();
    try {
      // 100 KiB -> mehrere Stücke bei 16 KiB Stückgröße.
      const data = bytes(100 * 1024);
      await pair.controller.sendFile(fileSource("gross.bin", data));

      await waitUntil(() => pair.hostInbox.length === 1, "große Datei angekommen", 10000);
      const received = pair.hostInbox[0].file;
      expect(received.data.byteLength).toBe(data.byteLength);
      expect(Array.from(received.data.slice(0, 64))).toEqual(Array.from(data.slice(0, 64)));
      expect(Array.from(received.data.slice(-64))).toEqual(Array.from(data.slice(-64)));
    } finally {
      pair.stop();
    }
  });

  test("meldet Beginn und Fortschritt der eingehenden Datei", async () => {
    const hostId = freshHostId();
    const password = "fortschritt";
    const starts: string[] = [];
    const progress: number[] = [];
    let done = false;

    const host = new HostSession(server.url, hostId, password, {
      onIncomingFile: (meta) => starts.push(meta.name),
      onIncomingFileProgress: (_id, receivedBytes) => progress.push(receivedBytes),
      onFileReceived: () => {
        done = true;
      },
    });
    await host.start(new FakeMediaStream() as unknown as MediaStream);

    const controller = new ControllerSession(server.url, hostId, password, {});
    await controller.connect();
    await waitUntil(() => controller.canSendFiles, "Dateikanal offen");

    try {
      const data = bytes(40 * 1024);
      await controller.sendFile(fileSource("mittel.bin", data));
      await waitUntil(() => done, "Übertragung abgeschlossen");

      expect(starts).toEqual(["mittel.bin"]);
      expect(progress.at(-1)).toBe(data.byteLength);
      expect(progress.length).toBeGreaterThan(1);
    } finally {
      controller.disconnect();
      host.stop();
    }
  });

  test("mehrere Dateien nacheinander kommen vollständig und in Reihenfolge an", async () => {
    const pair = await startPair();
    try {
      await pair.controller.sendFile(fileSource("eins.txt", bytes(300)));
      await pair.controller.sendFile(fileSource("zwei.txt", bytes(20 * 1024)));

      await waitUntil(() => pair.hostInbox.length === 2, "beide Dateien angekommen", 10000);
      expect(pair.hostInbox.map((e) => e.file.name)).toEqual(["eins.txt", "zwei.txt"]);
      expect(pair.hostInbox.map((e) => e.file.data.byteLength)).toEqual([300, 20 * 1024]);
    } finally {
      pair.stop();
    }
  });

  test("Dateien laufen über einen eigenen Kanal, nicht über den Eingabe-Kanal", async () => {
    const pair = await startPair();
    try {
      // Eingaben dürfen von einer Übertragung nicht betroffen sein.
      expect(pair.controller.fileChannelLabel).toBe(FILE_CHANNEL_LABEL);
      expect(pair.controller.inputChannelLabel).not.toBe(FILE_CHANNEL_LABEL);
    } finally {
      pair.stop();
    }
  });

  test("ohne Verbindung schlägt das Senden fehl, statt still zu verschwinden", async () => {
    const controller = new ControllerSession(server.url, freshHostId(), "egal", {});
    expect(controller.canSendFiles).toBe(false);
    await expect(controller.sendFile(fileSource("x.txt", bytes(10)))).rejects.toThrow();
    controller.disconnect();
  });
});
