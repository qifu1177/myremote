import { useRef, useState } from "react";
import type { FileTransferItem } from "../hooks/useFileTransfers";
import { useTranslation } from "../i18n";

interface FileTransferPanelProps {
  transfers: FileTransferItem[];
  /** Übergibt die ausgewählten/abgelegten Dateien an die Sitzung. */
  onSend: (files: File[]) => void;
  /** false, wenn (noch) keine Gegenstelle Dateien empfangen kann. */
  disabled?: boolean;
}

/** Kompakte, lesbare Größenangabe (B/KB/MB/GB). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/**
 * Dateiübertragung zwischen Host und Controller. Die Dateien laufen über einen
 * eigenen WebRTC-DataChannel, deshalb ist das Panel erst nutzbar, wenn die
 * Peer-Verbindung steht (anders als der Chat).
 */
export function FileTransferPanel({ transfers, onSend, disabled = false }: FileTransferPanelProps): JSX.Element {
  const t = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function pick(files: FileList | null): void {
    const list = files ? Array.from(files) : [];
    if (list.length > 0) onSend(list);
  }

  return (
    <div className="file-panel">
      <div className="file-panel-title">{t.fileTransfer.title}</div>
      <div
        className={`file-dropzone ${dragOver ? "over" : ""} ${disabled ? "disabled" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled) pick(e.dataTransfer.files);
        }}
      >
        <div className="file-dropzone-text">{t.fileTransfer.dropHint}</div>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {t.fileTransfer.choose}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          aria-label={t.fileTransfer.choose}
          onChange={(e) => {
            pick(e.target.files);
            // Zurücksetzen, damit dieselbe Datei erneut gewählt werden kann.
            e.target.value = "";
          }}
        />
      </div>

      <div className="file-list">
        {transfers.length === 0 ? (
          <div className="file-empty">{t.fileTransfer.empty}</div>
        ) : (
          transfers.map((item) => {
            const percent = item.size === 0 ? 100 : Math.round((item.transferred / item.size) * 100);
            return (
              <div key={item.id} className="file-item">
                <div className="file-item-head">
                  <span className="file-item-name" title={item.name}>
                    {item.direction === "incoming" ? "↓" : "↑"} {item.name}
                  </span>
                  <span className="file-item-size">{formatBytes(item.size)}</span>
                </div>
                {item.status === "active" && (
                  <div className="file-progress" role="progressbar" aria-valuenow={percent}>
                    <div className="file-progress-bar" style={{ width: `${percent}%` }} />
                  </div>
                )}
                <div className="file-item-status">
                  {item.status === "active" && t.fileTransfer.progress(percent)}
                  {item.status === "failed" && t.fileTransfer.failed(item.error ?? "")}
                  {item.status === "done" &&
                    (item.url ? (
                      <a className="file-save-link" href={item.url} download={item.name}>
                        {t.fileTransfer.save}
                      </a>
                    ) : (
                      t.fileTransfer.sent
                    ))}
                </div>
              </div>
            );
          })
        )}
      </div>
      {disabled && <div className="file-hint">{t.fileTransfer.waitingForPeer}</div>}
    </div>
  );
}
