import { useRef } from "react";
import type { FileTransferItem } from "@renderer/hooks/useFileTransfers";
import { formatBytes } from "@renderer/lib/fileTransfer";
import type { MobileTexts } from "../i18n";

interface FilePanelProps {
  transfers: FileTransferItem[];
  /** Übergibt die ausgewählten Dateien an die Sitzung. */
  onSend: (files: File[]) => void;
  onClose: () => void;
  /** true, solange keine Gegenstelle Dateien empfangen kann. */
  disabled?: boolean;
  texts: MobileTexts;
}

/**
 * Dateiübertragung des Browser-Clients.
 *
 * Anders als der Chat (Signaling-Relay) laufen Dateien über den eigenen
 * WebRTC-DataChannel `myremote-files`. Das Panel ist deshalb erst nutzbar,
 * wenn die Peer-Verbindung steht.
 *
 * Bewusst ohne Drag-and-drop-Zone (im Gegensatz zur Desktop-Variante): Auf
 * Touch-Geräten gibt es nichts zu ziehen, dort öffnet der Knopf die
 * System-Dateiauswahl bzw. direkt Fotos/iCloud Drive.
 */
export function FilePanel({ transfers, onSend, onClose, disabled = false, texts }: FilePanelProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function pick(files: FileList | null): void {
    const list = files ? Array.from(files) : [];
    if (list.length > 0) onSend(list);
  }

  return (
    <section className="file-panel" aria-label={texts.files}>
      <header className="chat-panel-head">
        <span className="chat-panel-title">{texts.files}</span>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {texts.close}
        </button>
      </header>

      <div className="file-actions">
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {texts.filesChoose}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          aria-label={texts.filesChoose}
          onChange={(e) => {
            pick(e.target.files);
            // Zurücksetzen, damit dieselbe Datei erneut gewählt werden kann.
            e.target.value = "";
          }}
        />
        {disabled && <p className="file-hint">{texts.filesWaitingForPeer}</p>}
      </div>

      <div className="file-list">
        {transfers.length === 0 ? (
          <p className="file-empty">{texts.filesEmpty}</p>
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
                  {item.status === "active" && texts.filesProgress(percent)}
                  {item.status === "failed" && texts.filesFailed(item.error ?? "")}
                  {item.status === "done" &&
                    (item.url ? (
                      <a className="file-save-link" href={item.url} download={item.name}>
                        {texts.filesSave}
                      </a>
                    ) : (
                      texts.filesSent
                    ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
