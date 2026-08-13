import { useCallback, useEffect, useRef, useState } from "react";
import type { IncomingFileMeta, ProgressCallback, ReceivedFile } from "../lib/fileTransfer";

/** Eine laufende oder abgeschlossene Übertragung — Grundlage der Anzeige. */
export interface FileTransferItem {
  id: string;
  name: string;
  size: number;
  direction: "incoming" | "outgoing";
  /** Bereits übertragene Bytes. */
  transferred: number;
  status: "active" | "done" | "failed";
  /** Nur bei vollständig empfangenen Dateien: Blob-URL zum Speichern. */
  url?: string;
  /** Nur bei status "failed". */
  error?: string;
}

/** Die Session-Callbacks, die dieser Hook für die Empfangsseite bereitstellt. */
export interface FileTransferCallbacks {
  onIncomingFile: (meta: IncomingFileMeta) => void;
  onIncomingFileProgress: (id: string, receivedBytes: number, totalBytes: number) => void;
  onFileReceived: (file: ReceivedFile) => void;
  onFileAborted: (id: string, reason: string) => void;
}

/** Sendefunktion der jeweiligen Session (Host oder Controller). */
export type SendFile = (file: File, onProgress?: ProgressCallback) => Promise<void>;

let outgoingCounter = 0;

/**
 * Hält den Zustand aller Dateiübertragungen einer Sitzung. Host- und
 * Controller-Seite nutzen ihn unverändert — beide Sessions bieten dieselben
 * Callbacks und dieselbe `sendFile`-Signatur.
 */
export function useFileTransfers(sendFile: SendFile): {
  transfers: FileTransferItem[];
  callbacks: FileTransferCallbacks;
  sendFiles: (files: File[]) => Promise<void>;
} {
  const [transfers, setTransfers] = useState<FileTransferItem[]>([]);
  // Beim Verlassen der Ansicht die Blob-URLs freigeben (sonst Speicherleck).
  const urlsRef = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const url of urlsRef.current) URL.revokeObjectURL(url);
      urlsRef.current = [];
    },
    [],
  );

  const update = useCallback((id: string, patch: Partial<FileTransferItem>) => {
    setTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const callbacks: FileTransferCallbacks = {
    onIncomingFile: (meta) =>
      setTransfers((prev) => [
        ...prev,
        { id: meta.id, name: meta.name, size: meta.size, direction: "incoming", transferred: 0, status: "active" },
      ]),
    onIncomingFileProgress: (id, receivedBytes) => update(id, { transferred: receivedBytes }),
    onFileReceived: (file) => {
      // Cast: TypeScript lässt hier nur ArrayBuffer-gestützte Views zu, der
      // Empfänger baut die Daten aber als generisches Uint8Array zusammen.
      const part = file.data as unknown as BlobPart;
      const url = URL.createObjectURL(new Blob([part], { type: file.mime || "application/octet-stream" }));
      urlsRef.current.push(url);
      update(file.id, { transferred: file.size, status: "done", url });
    },
    onFileAborted: (id, reason) => update(id, { status: "failed", error: reason }),
  };

  const sendFiles = useCallback(
    async (files: File[]): Promise<void> => {
      for (const file of files) {
        outgoingCounter += 1;
        const id = `out-${outgoingCounter}`;
        setTransfers((prev) => [
          ...prev,
          { id, name: file.name, size: file.size, direction: "outgoing", transferred: 0, status: "active" },
        ]);
        try {
          await sendFile(file, (sentBytes) => update(id, { transferred: sentBytes }));
          update(id, { transferred: file.size, status: "done" });
        } catch (err) {
          update(id, { status: "failed", error: err instanceof Error ? err.message : String(err) });
        }
      }
    },
    [sendFile, update],
  );

  return { transfers, callbacks, sendFiles };
}
