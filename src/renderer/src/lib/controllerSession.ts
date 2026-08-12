import type { ChatMessage, RemoteInputEvent, SignalPayload } from "@shared/types";
import { DATA_CHANNEL_LABEL } from "@shared/types";
import { SignalingClient } from "./signalingClient";
import { createChatMessage } from "./chatMessage";
import { RTC_CONFIG } from "./rtcConfig";

export interface ControllerSessionCallbacks {
  onRemoteStream?: (stream: MediaStream) => void;
  /** Eingehende Chat-Nachricht des Hosts (auch vor dem WebRTC-Aufbau). */
  onChatMessage?: (message: ChatMessage) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onRejected?: (reason: string) => void;
  onError?: (message: string) => void;
}

/**
 * Verwaltet den Controller-seitigen Zustand: Verbindungsaufbau zum
 * Signaling-Server, Beitritt zu einer Host-Session per (ID, Passwort),
 * Aufbau der RTCPeerConnection (Empfang des Bildschirm-Streams) sowie den
 * DataChannel, über den lokale Maus-/Tastatureingaben an den Host gesendet
 * werden.
 */
export class ControllerSession {
  private signaling: SignalingClient;
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;

  constructor(
    private signalingUrl: string,
    private hostId: string,
    private password: string,
    private callbacks: ControllerSessionCallbacks,
  ) {
    this.signaling = new SignalingClient(signalingUrl);
  }

  async connect(): Promise<void> {
    await this.signaling.connect();
    this.signaling.onMessage((msg) => this.handleMessage(msg));
    this.signaling.send({ type: "join", hostId: this.hostId, password: this.password });
  }

  /** Für das Verbindungsinfo-Overlay (Latenz via getStats()) in RemoteView. */
  get peerConnection(): RTCPeerConnection | null {
    return this.pc;
  }

  sendInput(evt: RemoteInputEvent): void {
    if (this.dataChannel?.readyState === "open") {
      this.dataChannel.send(JSON.stringify(evt));
    }
  }

  /**
   * Sendet eine Chat-Nachricht an den Host und liefert sie zurück (für die
   * eigene Anzeige). Läuft über den Signaling-Kanal, ist also schon vor dem
   * Aufbau der Peer-Verbindung nutzbar.
   */
  sendChat(text: string): ChatMessage {
    const message = createChatMessage("controller", text);
    this.signaling.send({
      type: "signal",
      hostId: this.hostId,
      data: { kind: "chat", message },
    });
    return message;
  }

  /** true, sobald Eingaben tatsächlich zum Host übertragen werden können. */
  isInputChannelOpen(): boolean {
    return this.dataChannel?.readyState === "open";
  }

  /** Label des ausgehandelten Eingabe-Kanals (für Diagnose/Tests). */
  get inputChannelLabel(): string | null {
    return this.dataChannel?.label ?? null;
  }

  disconnect(): void {
    this.dataChannel = null;
    this.pc?.close();
    this.pc = null;
    this.signaling.close();
  }

  private handleMessage(msg: Parameters<Parameters<SignalingClient["onMessage"]>[0]>[0]): void {
    switch (msg.type) {
      case "join-rejected":
        this.callbacks.onRejected?.(msg.reason);
        break;
      case "join-accepted":
        this.setupPeerConnection();
        break;
      case "signal":
        void this.handleSignal(msg.data);
        break;
      case "error":
        this.callbacks.onError?.(msg.message);
        this.callbacks.onDisconnected?.();
        break;
    }
  }

  private setupPeerConnection(): void {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.pc = pc;

    // Der Eingabe-Kanal wird vom Host (dem Offerer) angelegt und hier nur
    // entgegengenommen — siehe Kommentar in hostSession.ts. Ein hier selbst
    // erzeugter Kanal würde nie geöffnet, da das Answer-SDP keine neue
    // "m=application"-Sektion hinzufügen kann.
    pc.ondatachannel = (ev) => {
      if (ev.channel.label !== DATA_CHANNEL_LABEL) return;
      this.dataChannel = ev.channel;
    };

    pc.ontrack = (ev) => {
      this.callbacks.onRemoteStream?.(ev.streams[0]);
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.signaling.send({
          type: "signal",
          hostId: this.hostId,
          data: { kind: "ice-candidate", candidate: ev.candidate.toJSON() },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") this.callbacks.onConnected?.();
      if (pc.connectionState === "failed" || pc.connectionState === "closed" || pc.connectionState === "disconnected") {
        this.callbacks.onDisconnected?.();
      }
    };
  }

  private async handleSignal(data: SignalPayload): Promise<void> {
    if (data.kind === "chat") {
      this.callbacks.onChatMessage?.(data.message);
      return;
    }
    if (data.kind === "reject") {
      this.callbacks.onRejected?.("rejected-by-host");
      this.disconnect();
      return;
    }
    const pc = this.pc;
    if (!pc) return;
    if (data.kind === "offer") {
      await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.signaling.send({
        type: "signal",
        hostId: this.hostId,
        data: { kind: "answer", sdp: answer.sdp ?? "" },
      });
    } else if (data.kind === "ice-candidate") {
      try {
        await pc.addIceCandidate(data.candidate);
      } catch (err) {
        console.error("[controller] addIceCandidate fehlgeschlagen", err);
      }
    }
  }
}
