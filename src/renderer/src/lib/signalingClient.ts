import type { ClientToServerMessage, ServerToClientMessage } from "@shared/types";

type Listener = (msg: ServerToClientMessage) => void;

/**
 * Dünner Wrapper um die WebSocket-Verbindung zum Signaling-Server.
 * Reconnect wird für dieses MVP bewusst nicht implementiert (siehe README,
 * Abschnitt "Bekannte Einschränkungen") — bei Verbindungsabbruch muss der
 * Nutzer die Verbindung erneut aufbauen.
 */
export class SignalingClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private openPromise: Promise<void> | null = null;

  constructor(private url: string) {}

  connect(): Promise<void> {
    if (this.openPromise) return this.openPromise;
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
      };
    });
    return this.openPromise;
  }

  onMessage(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(msg: ClientToServerMessage): void {
    this.ws?.send(JSON.stringify(msg));
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
    this.openPromise = null;
  }
}
