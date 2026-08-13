/**
 * Tests der Dateiübertragung (Chunking + Reassemblierung).
 *
 * Die Übertragung läuft über einen eigenen DataChannel: Große Dateistücke
 * dürfen die Maus-/Tastatur-Events des Eingabe-Kanals nicht ausbremsen.
 * Getestet wird hier die reine Logik gegen ein minimales Kanal-Interface —
 * ohne DOM, ohne WebRTC.
 */
import { describe, expect, test } from "vitest";
import type { FileTransferControl } from "@shared/types";
import { CHUNK_SIZE, FileReceiver, FileSender, type FileChannel, type FileSource } from "@renderer/lib/fileTransfer";

/** Kanal-Attrappe: merkt sich alles Gesendete und simuliert den Sendepuffer. */
class FakeChannel implements FileChannel {
  readyState = "open";
  bufferedAmount = 0;
  readonly sent: Array<string | ArrayBuffer> = [];

  send(data: string | ArrayBuffer): void {
    if (this.readyState !== "open") throw new Error("Kanal geschlossen");
    this.sent.push(data);
    if (typeof data !== "string") this.bufferedAmount += data.byteLength;
  }

  /** Steuernachrichten in Reihenfolge. */
  controls(): FileTransferControl[] {
    return this.sent.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d));
  }

  chunks(): ArrayBuffer[] {
    return this.sent.filter((d): d is ArrayBuffer => typeof d !== "string");
  }
}

/** Datenquelle mit vorgegebenem Inhalt — strukturell wie ein DOM-`File`. */
function fileSource(name: string, bytes: Uint8Array, mime = "application/octet-stream"): FileSource {
  return {
    name,
    size: bytes.byteLength,
    type: mime,
    slice: (start, end) => ({
      arrayBuffer: async () => bytes.slice(start, end).buffer,
    }),
  };
}

function bytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) out[i] = i % 256;
  return out;
}

describe("FileSender", () => {
  test("kündigt die Datei an, sendet die Stücke und meldet das Ende", async () => {
    const channel = new FakeChannel();
    const sender = new FileSender(channel);

    await sender.send(fileSource("notiz.txt", bytes(10), "text/plain"));

    const controls = channel.controls();
    expect(controls[0]).toMatchObject({ type: "file-begin", name: "notiz.txt", size: 10, mime: "text/plain" });
    expect(controls.at(-1)).toMatchObject({ type: "file-end" });
    // Die Übertragungs-ID klammert Anfang und Ende zusammen.
    expect(controls.at(-1)).toMatchObject({ id: (controls[0] as { id: string }).id });
    expect(channel.chunks()).toHaveLength(1);
  });

  test("zerlegt große Dateien in Stücke fester Größe", async () => {
    const channel = new FakeChannel();
    const sender = new FileSender(channel, { chunkSize: 100 });

    await sender.send(fileSource("gross.bin", bytes(250)));

    expect(channel.chunks().map((c) => c.byteLength)).toEqual([100, 100, 50]);
  });

  test("meldet den Fortschritt in Bytes", async () => {
    const channel = new FakeChannel();
    const sender = new FileSender(channel, { chunkSize: 100 });
    const progress: number[] = [];

    await sender.send(fileSource("gross.bin", bytes(250)), (sentBytes) => progress.push(sentBytes));

    expect(progress).toEqual([100, 200, 250]);
  });

  test("überträgt auch eine leere Datei vollständig (nur Ankündigung und Ende)", async () => {
    const channel = new FakeChannel();
    const sender = new FileSender(channel);

    await sender.send(fileSource("leer.txt", bytes(0)));

    expect(channel.chunks()).toHaveLength(0);
    expect(channel.controls().map((c) => c.type)).toEqual(["file-begin", "file-end"]);
  });

  test("wartet, solange der Sendepuffer voll ist (Rückstau)", async () => {
    const channel = new FakeChannel();
    // Der Puffer wird künstlich nicht geleert -> der Sender muss warten.
    channel.bufferedAmount = 1000;
    let waits = 0;
    const sender = new FileSender(channel, {
      chunkSize: 100,
      maxBufferedAmount: 500,
      wait: async () => {
        waits += 1;
        // Nach zwei Wartezyklen "leert" das Netzwerk den Puffer.
        if (waits >= 2) channel.bufferedAmount = 0;
      },
    });

    await sender.send(fileSource("gross.bin", bytes(200)));

    expect(waits).toBeGreaterThanOrEqual(2);
    expect(channel.chunks()).toHaveLength(2);
  });

  test("bricht ab, wenn der Kanal nicht offen ist", async () => {
    const channel = new FakeChannel();
    channel.readyState = "closed";
    const sender = new FileSender(channel);

    await expect(sender.send(fileSource("notiz.txt", bytes(10)))).rejects.toThrow();
  });

  test("verwendet standardmäßig eine für WebRTC sichere Stückgröße", () => {
    // 64 KiB ist die von allen Browsern zuverlässig unterstützte Obergrenze.
    expect(CHUNK_SIZE).toBeLessThanOrEqual(64 * 1024);
  });
});

describe("FileReceiver", () => {
  /** Spiegelt alles, was der Sender in den Kanal schreibt, in den Empfänger. */
  function pipe(channel: FakeChannel, receiver: FileReceiver): void {
    for (const data of channel.sent) receiver.handleMessage(data);
  }

  test("setzt die Datei byte-genau wieder zusammen", async () => {
    const original = bytes(250);
    const channel = new FakeChannel();
    await new FileSender(channel, { chunkSize: 100 }).send(fileSource("gross.bin", original, "text/plain"));

    const received: Array<{ name: string; mime: string; data: Uint8Array }> = [];
    const receiver = new FileReceiver({ onComplete: (f) => received.push(f) });
    pipe(channel, receiver);

    expect(received).toHaveLength(1);
    expect(received[0].name).toBe("gross.bin");
    expect(received[0].mime).toBe("text/plain");
    expect(Array.from(received[0].data)).toEqual(Array.from(original));
  });

  test("meldet Beginn und Fortschritt der eingehenden Übertragung", async () => {
    const channel = new FakeChannel();
    await new FileSender(channel, { chunkSize: 100 }).send(fileSource("gross.bin", bytes(250)));

    const starts: string[] = [];
    const progress: number[] = [];
    const receiver = new FileReceiver({
      onStart: (meta) => starts.push(meta.name),
      onProgress: (_id, receivedBytes) => progress.push(receivedBytes),
    });
    pipe(channel, receiver);

    expect(starts).toEqual(["gross.bin"]);
    expect(progress).toEqual([100, 200, 250]);
  });

  test("überträgt mehrere Dateien nacheinander", async () => {
    const channel = new FakeChannel();
    const sender = new FileSender(channel, { chunkSize: 100 });
    await sender.send(fileSource("a.bin", bytes(150)));
    await sender.send(fileSource("b.bin", bytes(50)));

    const names: string[] = [];
    const sizes: number[] = [];
    const receiver = new FileReceiver({
      onComplete: (f) => {
        names.push(f.name);
        sizes.push(f.data.byteLength);
      },
    });
    pipe(channel, receiver);

    expect(names).toEqual(["a.bin", "b.bin"]);
    expect(sizes).toEqual([150, 50]);
  });

  test("ignoriert Daten ohne vorherige Ankündigung", () => {
    const completed: unknown[] = [];
    const receiver = new FileReceiver({ onComplete: (f) => completed.push(f) });

    expect(() => receiver.handleMessage(new Uint8Array([1, 2, 3]).buffer)).not.toThrow();
    expect(completed).toEqual([]);
  });

  test("meldet einen Abbruch und verwirft die halbe Datei", async () => {
    const channel = new FakeChannel();
    // Nur Ankündigung + ein Stück, danach ein Abbruch.
    const sender = new FileSender(channel, { chunkSize: 100 });
    await sender.send(fileSource("teil.bin", bytes(100)));
    const id = (channel.controls()[0] as { id: string }).id;

    const completed: unknown[] = [];
    const aborted: string[] = [];
    const receiver = new FileReceiver({
      onComplete: (f) => completed.push(f),
      onAborted: (_id, reason) => aborted.push(reason),
    });
    // Ankündigung + Stück durchreichen, das "file-end" aber durch einen
    // Abbruch ersetzen.
    receiver.handleMessage(channel.sent[0]);
    receiver.handleMessage(channel.sent[1]);
    receiver.handleMessage(JSON.stringify({ type: "file-abort", id, reason: "Verbindung verloren" }));

    expect(completed).toEqual([]);
    expect(aborted).toEqual(["Verbindung verloren"]);
  });

  test("meldet unvollständige Dateien als Abbruch statt sie auszuliefern", async () => {
    const channel = new FakeChannel();
    await new FileSender(channel, { chunkSize: 100 }).send(fileSource("gross.bin", bytes(250)));

    const completed: unknown[] = [];
    const aborted: string[] = [];
    const receiver = new FileReceiver({
      onComplete: (f) => completed.push(f),
      onAborted: (_id, reason) => aborted.push(reason),
    });
    // Ein Stück unterschlagen (Ankündigung, 2 von 3 Stücken, Ende).
    receiver.handleMessage(channel.sent[0]);
    receiver.handleMessage(channel.sent[1]);
    receiver.handleMessage(channel.sent[2]);
    receiver.handleMessage(channel.sent[4]);

    expect(completed).toEqual([]);
    expect(aborted).toHaveLength(1);
  });
});
