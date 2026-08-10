import type { RemoteInputEvent, SignalPayload } from "@shared/types";
import { DATA_CHANNEL_LABEL } from "@shared/types";
import { SignalingClient } from "./signalingClient";
import { RTC_CONFIG } from "./rtcConfig";

export interface HostSessionCallbacks {
  onPeerConnected?: (sessionId: string) => void;
  onPeerDisconnected?: (sessionId: string) => void;
  onRemoteInput?: (evt: RemoteInputEvent) => void;
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
  private stream: MediaStream | null = null;

  constructor(
    private signalingUrl: string,
    private hostId: string,
    private password: string,
    private callbacks: HostSessionCallbacks,
  ) {
    this.signaling = new SignalingClient(signalingUrl);
  }

  async start(stream: MediaStream): Promise<void> {
    this.stream = stream;
    await this.signaling.connect();
    this.signaling.onMessage((msg) => this.handleMessage(msg));
    this.signaling.send({ type: "register-host", id: this.hostId, password: this.password });
  }

  stop(): void {
    for (const pc of this.peers.values()) pc.close();
    this.peers.clear();
    this.channels.clear();
    this.signaling.send({ type: "leave", hostId: this.hostId });
    this.signaling.close();
    this.stream?.getTracks().forEach((t) => t.stop());
  }

  private handleMessage(msg: Parameters<Parameters<SignalingClient["onMessage"]>[0]>[0]): void {
    switch (msg.type) {
      case "register-failed":
        this.callbacks.onError?.(`Registrierung fehlgeschlagen: ${msg.reason}`);
        break;
      case "peer-joined":
        void this.acceptOrRejectPeer(msg.sessionId);
        break;
      case "peer-left": {
        const pc = this.peers.get(msg.sessionId);
        pc?.close();
        this.peers.delete(msg.sessionId);
        this.channels.delete(msg.sessionId);
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
