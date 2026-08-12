import type { ChatMessage, RemoteInputEvent, SignalPayload } from "@shared/types";
import { DATA_CHANNEL_LABEL } from "@shared/types";
import { SignalingClient } from "./signalingClient";
import { createChatMessage } from "./chatMessage";
import { RTC_CONFIG } from "./rtcConfig";

export interface HostSessionCallbacks {
  onPeerConnected?: (sessionId: string) => void;
  onPeerDisconnected?: (sessionId: string) => void;
  onRemoteInput?: (evt: RemoteInputEvent) => void;
  /** Eingehende Chat-Nachricht eines Controllers (auch vor dem WebRTC-Aufbau). */
  onChatMessage?: (message: ChatMessage, sessionId: string) => void;
  /**
   * Anzahl der per Chat erreichbaren Controller hat sich geändert. Wird schon
   * beim Beitritt zum Signaling-Server gemeldet — also bevor die
   * Peer-Verbindung steht —, damit die UI den Chat früh freischalten kann.
   */
  onChatPeersChanged?: (count: number) => void;
  onError?: (message: string) => void;
  /**
   * Wird für jede eingehende Verbindung aufgerufen, bevor der WebRTC-Handshake
   * beginnt (Settings → Sicherheit → "Zustimmung bei jeder Verbindung"). Löst
   * `true` auf, wenn die Verbindung angenommen werden soll. Ohne diesen
   * Callback (bzw. wenn er nicht gesetzt ist) werden Verbindungen automatisch
   * angenommen.
   */
  confirmIncomingConnection?: (sessionId: string) => Promise<boolean>;
}

/**
 * Verwaltet den Host-seitigen Zustand: Registrierung beim Signaling-Server
 * unter (ID, Passwort), Annahme eingehender Controller-Verbindungen und
 * Aufbau je einer RTCPeerConnection pro Controller, über die der
 * Bildschirm-Stream gesendet und Eingabe-Events per DataChannel empfangen
 * werden.
 */
export class HostSession {
  private signaling: SignalingClient;
  private peers = new Map<string, RTCPeerConnection>();
  private channels = new Map<string, RTCDataChannel>();
  /**
   * Alle Controller-Sessions, die dem Signaling-Server beigetreten sind —
   * unabhängig davon, ob die WebRTC-Verbindung schon steht. Chat läuft über
   * diese Liste, damit schon vor dem Verbindungsaufbau geschrieben werden kann.
   */
  private chatPeers = new Set<string>();
  private stream: MediaStream | null = null;

  constructor(
    private signalingUrl: string,
    private hostId: string,
    private password: string,
    private callbacks: HostSessionCallbacks,
  ) {
    this.signaling = new SignalingClient(signalingUrl);
  }

  /**
   * Meldet den Host beim Signaling-Server an. Der Bildschirm-Stream ist
   * optional: Ohne ihn ist der Host nur erreichbar (Chat), gibt aber nichts
   * frei. Die Freigabe kann jederzeit per `setStream()` nachgeholt werden.
   */
  async start(stream: MediaStream | null = null): Promise<void> {
    this.stream = stream;
    await this.signaling.connect();
    this.signaling.onMessage((msg) => this.handleMessage(msg));
    this.signaling.send({ type: "register-host", id: this.hostId, password: this.password });
  }

  /** true, wenn aktuell ein Bildschirm freigegeben wird. */
  get isSharing(): boolean {
    return this.stream !== null;
  }

  /**
   * Startet die Bildschirmfreigabe innerhalb einer bereits laufenden Sitzung
   * und baut die Peer-Verbindung zu allen bereits beigetretenen Controllern auf.
   */
  async setStream(stream: MediaStream): Promise<void> {
    this.stream = stream;
    for (const sessionId of [...this.chatPeers]) {
      if (!this.peers.has(sessionId)) await this.acceptOrRejectPeer(sessionId);
    }
  }

  /**
   * Beendet nur die Bildschirmfreigabe. Signaling-Verbindung und Chat bleiben
   * bestehen, damit weiter geschrieben werden kann.
   */
  stopStream(): void {
    for (const pc of this.peers.values()) pc.close();
    this.peers.clear();
    this.channels.clear();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  /** Anzahl der Controller, die aktuell per Chat erreichbar sind. */
  get chatPeerCount(): number {
    return this.chatPeers.size;
  }

  /**
   * Sendet eine Chat-Nachricht an alle beigetretenen Controller und liefert
   * die versendete Nachricht zurück (für die eigene Anzeige).
   */
  sendChat(text: string): ChatMessage {
    const message = createChatMessage("host", text);
    for (const sessionId of this.chatPeers) {
      this.signaling.send({
        type: "signal",
        hostId: this.hostId,
        targetSessionId: sessionId,
        data: { kind: "chat", message },
      });
    }
    return message;
  }

  /** Einzige Stelle, an der `chatPeers` verändert wird — meldet jede Änderung. */
  private updateChatPeer(sessionId: string, present: boolean): void {
    const changed = present ? !this.chatPeers.has(sessionId) : this.chatPeers.delete(sessionId);
    if (present) this.chatPeers.add(sessionId);
    if (changed) this.callbacks.onChatPeersChanged?.(this.chatPeers.size);
  }

  stop(): void {
    this.stopStream();
    this.chatPeers.clear();
    this.callbacks.onChatPeersChanged?.(0);
    this.signaling.send({ type: "leave", hostId: this.hostId });
    this.signaling.close();
  }

  private handleMessage(msg: Parameters<Parameters<SignalingClient["onMessage"]>[0]>[0]): void {
    switch (msg.type) {
      case "register-failed":
        this.callbacks.onError?.(`Registrierung fehlgeschlagen: ${msg.reason}`);
        break;
      case "peer-joined":
        this.updateChatPeer(msg.sessionId, true);
        // Ohne freigegebenen Bildschirm gibt es nichts anzubieten: Der
        // Controller bleibt reiner Chat-Partner, bis setStream() läuft.
        if (this.stream) void this.acceptOrRejectPeer(msg.sessionId);
        break;
      case "peer-left": {
        const pc = this.peers.get(msg.sessionId);
        pc?.close();
        this.peers.delete(msg.sessionId);
        this.channels.delete(msg.sessionId);
        this.updateChatPeer(msg.sessionId, false);
        this.callbacks.onPeerDisconnected?.(msg.sessionId);
        break;
      }
      case "signal":
        void this.handleSignal(msg.sessionId, msg.data);
        break;
      case "error":
        this.callbacks.onError?.(msg.message);
        break;
    }
  }

  private async acceptOrRejectPeer(sessionId: string): Promise<void> {
    const confirm = this.callbacks.confirmIncomingConnection;
    const accepted = confirm ? await confirm(sessionId) : true;
    if (!accepted) {
      this.signaling.send({
        type: "signal",
        hostId: this.hostId,
        targetSessionId: sessionId,
        data: { kind: "reject" },
      });
      this.updateChatPeer(sessionId, false);
      return;
    }
    await this.createPeerForController(sessionId);
  }

  private async createPeerForController(sessionId: string): Promise<void> {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.peers.set(sessionId, pc);

    this.stream?.getTracks().forEach((track) => pc.addTrack(track, this.stream as MediaStream));

    // Der Eingabe-Kanal MUSS hier — also vor createOffer() — angelegt werden.
    // Nur dann enthält das Offer-SDP eine "m=application"-Sektion und der
    // Kanal wird überhaupt ausgehandelt. Legt ihn stattdessen die Gegenseite
    // (der Answerer) an, bleibt er dauerhaft im Zustand "connecting" und es
    // kommt nie eine Eingabe beim Host an.
    const channel = pc.createDataChannel(DATA_CHANNEL_LABEL);
    channel.onmessage = (m) => {
      try {
        const evt = JSON.parse(m.data as string) as RemoteInputEvent;
        this.callbacks.onRemoteInput?.(evt);
      } catch (err) {
        console.error("[host] Ungültiges Input-Event", err);
      }
    };
    this.channels.set(sessionId, channel);

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.signaling.send({
          type: "signal",
          hostId: this.hostId,
          targetSessionId: sessionId,
          data: { kind: "ice-candidate", candidate: ev.candidate.toJSON() },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") this.callbacks.onPeerConnected?.(sessionId);
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.channels.delete(sessionId);
        this.callbacks.onPeerDisconnected?.(sessionId);
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.signaling.send({
      type: "signal",
      hostId: this.hostId,
      targetSessionId: sessionId,
      data: { kind: "offer", sdp: offer.sdp ?? "" },
    });
  }

  private async handleSignal(sessionId: string, data: SignalPayload): Promise<void> {
    // Chat ist bewusst unabhängig von der Peer-Verbindung: Er muss auch dann
    // funktionieren, wenn (noch) keine RTCPeerConnection existiert.
    if (data.kind === "chat") {
      this.updateChatPeer(sessionId, true);
      this.callbacks.onChatMessage?.(data.message, sessionId);
      return;
    }
    const pc = this.peers.get(sessionId);
    if (!pc) return;
    if (data.kind === "answer") {
      await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
    } else if (data.kind === "ice-candidate") {
      try {
        await pc.addIceCandidate(data.candidate);
      } catch (err) {
        console.error("[host] addIceCandidate fehlgeschlagen", err);
      }
    }
  }
}
