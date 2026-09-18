import type { ClientToServerMessage, ServerToClientMessage } from "@shared/types";

type Listener = (msg: ServerToClientMessage) => void;
type CloseListener = () => void;

/**
 * Dünner Wrapper um die WebSocket-Verbindung zum Signaling-Server.
 *
 * Der Wrapper verbindet nicht von selbst neu, meldet einen Abriss aber über
 * `onClose` nach oben (siehe HostSession): Ein unbemerkt gestorbener Socket
 * hatte den Host sonst dauerhaft unerreichbar gemacht, weil der Signaling-
 * Server ihn aus seiner Registry entfernt, die App davon aber nichts erfuhr.
 */
export class SignalingClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private closeListeners = new Set<CloseListener>();
  private openPromise: Promise<void> | null = null;
  /** Unterscheidet einen gewollten close() von einem Abriss. */
  private closedByUs = false;

  constructor(private url: string) {}

  connect(): Promise<void> {
    if (this.openPromise) return this.openPromise;
    this.closedByUs = false;
    this.openPromise = new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error(`Konnte keine Verbindung zum Signaling-Server (${this.url}) herstellen.`));
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as ServerToClientMessage;
          this.listeners.forEach((l) => l(msg));
        } catch (err) {
          console.error("[signaling] Ungültige Nachricht", err);
        }
      };
      ws.onclose = () => {
        this.openPromise = null;
        // Ein selbst ausgelöstes close() ist kein Fehlerfall und darf keine
        // Wiederanmeldung anstoßen.
        if (!this.closedByUs) this.closeListeners.forEach((l) => l());
      };
    });
    return this.openPromise;
  }

  onMessage(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Meldet einen ungewollten Verbindungsabriss (nicht: eigenes close()). */
  onClose(listener: CloseListener): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  send(msg: ClientToServerMessage): void {
    this.ws?.send(JSON.stringify(msg));
  }

  close(): void {
    this.closedByUs = true;
    this.ws?.close();
    this.ws = null;
    this.openPromise = null;
  }
}
