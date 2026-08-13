import type { FileTransferControl } from "@shared/types";

/**
 * Dateiübertragung über einen WebRTC-DataChannel.
 *
 * Bewusst frei von DOM- und WebRTC-Typen: Sender und Empfänger arbeiten gegen
 * die schmalen Schnittstellen `FileChannel`/`FileSource`, die ein echter
 * `RTCDataChannel` bzw. ein echtes `File` strukturell erfüllen. Dadurch ist
 * die Logik (Zerlegen, Rückstau, Zusammensetzen) isoliert testbar.
 */

/**
 * 16 KiB pro Stück. Größere Nachrichten lehnen manche WebRTC-Implementierungen
 * ab; 16 KiB gilt browserübergreifend als sicher.
 */
export const CHUNK_SIZE = 16 * 1024;

/** Ab dieser Menge ungesendeter Bytes wird pausiert, statt weiter zu füllen. */
const MAX_BUFFERED_AMOUNT = 4 * 1024 * 1024;

/** Der Teil eines RTCDataChannel, den die Übertragung braucht. */
export interface FileChannel {
  readyState: string;
  bufferedAmount: number;
  send(data: string | ArrayBuffer): void;
}

/** Der Teil eines DOM-`File`, den der Sender braucht. */
export interface FileSource {
  name: string;
  size: number;
  type: string;
  slice(start: number, end: number): { arrayBuffer(): Promise<ArrayBuffer> };
}

export interface FileSenderOptions {
  chunkSize?: number;
  maxBufferedAmount?: number;
  /** Wartepause bei vollem Sendepuffer (in Tests ersetzbar). */
  wait?: () => Promise<void>;
}

/** Fortschritt in bereits übertragenen Bytes. */
export type ProgressCallback = (sentBytes: number, totalBytes: number) => void;

function newTransferId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Zerlegt eine Datei in Stücke und schiebt sie über den Kanal. */
export class FileSender {
  private readonly chunkSize: number;
  private readonly maxBufferedAmount: number;
  private readonly wait: () => Promise<void>;

  constructor(
    private readonly channel: FileChannel,
    options: FileSenderOptions = {},
  ) {
    this.chunkSize = options.chunkSize ?? CHUNK_SIZE;
    this.maxBufferedAmount = options.maxBufferedAmount ?? MAX_BUFFERED_AMOUNT;
    this.wait = options.wait ?? (() => new Promise((r) => setTimeout(r, 50)));
  }

  /** Überträgt die Datei vollständig; löst nach dem letzten Stück auf. */
  async send(file: FileSource, onProgress?: ProgressCallback): Promise<string> {
    if (this.channel.readyState !== "open") {
      throw new Error("Dateikanal ist nicht offen");
    }
    const id = newTransferId();
    this.sendControl({ type: "file-begin", id, name: file.name, size: file.size, mime: file.type });

    let offset = 0;
    while (offset < file.size) {
      const end = Math.min(offset + this.chunkSize, file.size);
      const chunk = await file.slice(offset, end).arrayBuffer();
      while (this.channel.bufferedAmount > this.maxBufferedAmount) {
        await this.wait();
      }
      if (this.channel.readyState !== "open") {
        throw new Error("Dateikanal wurde während der Übertragung geschlossen");
      }
      this.channel.send(chunk);
      offset = end;
      onProgress?.(offset, file.size);
    }

    this.sendControl({ type: "file-end", id });
    return id;
  }

  /** Bricht eine laufende Übertragung für die Gegenseite ab. */
  abort(id: string, reason: string): void {
    if (this.channel.readyState !== "open") return;
    this.sendControl({ type: "file-abort", id, reason });
  }

  private sendControl(control: FileTransferControl): void {
    this.channel.send(JSON.stringify(control));
  }
}

/** Beschreibung einer eingehenden Übertragung. */
export interface IncomingFileMeta {
  id: string;
  name: string;
  size: number;
  mime: string;
}

/** Eine vollständig empfangene Datei. */
export interface ReceivedFile extends IncomingFileMeta {
  data: Uint8Array;
}

export interface FileReceiverCallbacks {
  onStart?: (meta: IncomingFileMeta) => void;
  onProgress?: (id: string, receivedBytes: number, totalBytes: number) => void;
  onComplete?: (file: ReceivedFile) => void;
  onAborted?: (id: string, reason: string) => void;
}

interface PendingTransfer {
  meta: IncomingFileMeta;
  chunks: Uint8Array[];
  received: number;
}

/**
 * Setzt die Stücke wieder zu einer Datei zusammen. Da ein DataChannel
 * standardmäßig geordnet zustellt, gehört jedes Binärstück zur zuletzt
 * angekündigten Übertragung.
 */
export class FileReceiver {
  private pending: PendingTransfer | null = null;

  constructor(private readonly callbacks: FileReceiverCallbacks = {}) {}

  /** Nimmt eine Kanal-Nachricht entgegen (Steuerung als Text, Daten binär). */
  handleMessage(data: unknown): void {
    if (typeof data === "string") {
      this.handleControl(data);
      return;
    }
    const chunk = toBytes(data);
    if (!chunk || !this.pending) return;
    this.pending.chunks.push(chunk);
    this.pending.received += chunk.byteLength;
    this.callbacks.onProgress?.(this.pending.meta.id, this.pending.received, this.pending.meta.size);
  }

  private handleControl(text: string): void {
    let control: FileTransferControl;
    try {
      control = JSON.parse(text) as FileTransferControl;
    } catch {
      return;
    }
    switch (control.type) {
      case "file-begin":
        this.pending = {
          meta: { id: control.id, name: control.name, size: control.size, mime: control.mime },
          chunks: [],
          received: 0,
        };
        this.callbacks.onStart?.(this.pending.meta);
        break;
      case "file-end":
        this.finish(control.id);
        break;
      case "file-abort":
        this.discard(control.id, control.reason);
        break;
    }
  }

  private finish(id: string): void {
    const pending = this.pending;
    if (!pending || pending.meta.id !== id) return;
    this.pending = null;
    // Eine unvollständige Datei auszuliefern wäre schlimmer als sie zu
    // verwerfen — der Empfänger merkt es sonst erst beim Öffnen.
    if (pending.received !== pending.meta.size) {
      this.callbacks.onAborted?.(id, "unvollständig");
      return;
    }
    this.callbacks.onComplete?.({ ...pending.meta, data: concat(pending.chunks, pending.meta.size) });
  }

  private discard(id: string, reason: string): void {
    if (!this.pending || this.pending.meta.id !== id) return;
    this.pending = null;
    this.callbacks.onAborted?.(id, reason);
  }
}

function toBytes(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

function concat(chunks: Uint8Array[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
