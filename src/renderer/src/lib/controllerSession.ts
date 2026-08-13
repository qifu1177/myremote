import type { ChatMessage, RemoteInputEvent, SignalPayload } from "@shared/types";
import { DATA_CHANNEL_LABEL, FILE_CHANNEL_LABEL } from "@shared/types";
import { SignalingClient } from "./signalingClient";
import { createChatMessage } from "./chatMessage";
import { FileReceiver, FileSender } from "./fileTransfer";
import type { FileSource, IncomingFileMeta, ProgressCallback, ReceivedFile } from "./fileTransfer";
import { RTC_CONFIG } from "./rtcConfig";

export interface ControllerSessionCallbacks {
  onRemoteStream?: (stream: MediaStream) => void;
  /** Eingehende Chat-Nachricht des Hosts (auch vor dem WebRTC-Aufbau). */
  onChatMessage?: (message: ChatMessage) => void;
  /** Der Host beginnt, eine Datei zu senden. */
  onIncomingFile?: (meta: IncomingFileMeta) => void;
  /** Fortschritt einer eingehenden Datei in Bytes. */
  onIncomingFileProgress?: (id: string, receivedBytes: number, totalBytes: number) => void;
  /** Eine Datei wurde vollständig empfangen. */
  onFileReceived?: (file: ReceivedFile) => void;
  /** Eine eingehende Datei wurde abgebrochen/kam unvollständig an. */
  onFileAborted?: (id: string, reason: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onRejected?: (reason: string) => void;
  onError?: (message: string) => void;
}

export interface ControllerSessionOptions {
  /**
   * Nur-Chat-Modus: Es wird keine RTCPeerConnection aufgebaut (kein Video,
   * keine Eingaben). Der Chat läuft über den Signaling-Kanal und funktioniert
   * damit trotzdem. Genutzt von der Verbindungsmaske des Browser-Clients,
   * damit dort „Chat öffnen" keine versteckte Bildschirmverbindung startet.
   */
  chatOnly?: boolean;
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
  /** Eigener Kanal für Dateien (siehe FILE_CHANNEL_LABEL). */
  private fileChannel: RTCDataChannel | null = null;

  constructor(
    private signalingUrl: string,
    private hostId: string,
    private password: string,
    private callbacks: ControllerSessionCallbacks,
    private options: ControllerSessionOptions = {},
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

  /** true, sobald Dateien tatsächlich zum Host übertragen werden können. */
  get canSendFiles(): boolean {
    return this.fileChannel?.readyState === "open";
  }

  /** Label des ausgehandelten Dateikanals (für Diagnose/Tests). */
  get fileChannelLabel(): string | null {
    return this.fileChannel?.label ?? null;
  }

  /**
   * Sendet eine Datei an den Host. Löst auf, sobald sie vollständig
   * abgegeben wurde.
   */
  async sendFile(file: FileSource, onProgress?: ProgressCallback): Promise<void> {
    const channel = this.fileChannel;
    if (!channel || channel.readyState !== "open") {
      throw new Error("Keine Verbindung zum Host: Datei kann nicht gesendet werden");
    }
    await new FileSender(channel).send(file, onProgress);
  }

  /** true, sobald Eingaben tatsächlich zum Host übertragen werden können. */
  isInputChannelOpen(): boolean {
    return this.dataChannel?.readyState === "open";
  }

  /** Label des ausgehandelten Eingabe-Kanals (für Diagnose/Tests). */
  get inputChannelLabel(): string | null {
    return this.dataChannel?.label ?? null;
  }

  /** Verdrahtet den Empfänger für vom Host gesendete Dateien. */
  private attachFileReceiver(channel: RTCDataChannel): RTCDataChannel {
    // Ohne diese Einstellung liefert der Browser Binärdaten als Blob — der
    // Empfänger erwartet ArrayBuffer.
    channel.binaryType = "arraybuffer";
    const receiver = new FileReceiver({
      onStart: (meta) => this.callbacks.onIncomingFile?.(meta),
      onProgress: (id, received, total) => this.callbacks.onIncomingFileProgress?.(id, received, total),
      onComplete: (file) => this.callbacks.onFileReceived?.(file),
      onAborted: (id, reason) => this.callbacks.onFileAborted?.(id, reason),
    });
    channel.onmessage = (m) => receiver.handleMessage(m.data);
    return channel;
  }

  disconnect(): void {
    this.dataChannel = null;
    this.fileChannel = null;
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
        // Im Nur-Chat-Modus keine Peer-Verbindung aufbauen: Das Angebot des
        // Hosts wird dann in handleSignal ignoriert (pc bleibt null).
        if (!this.options.chatOnly) this.setupPeerConnection();
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
      if (ev.channel.label === DATA_CHANNEL_LABEL) {
        this.dataChannel = ev.channel;
      } else if (ev.channel.label === FILE_CHANNEL_LABEL) {
        this.fileChannel = this.attachFileReceiver(ev.channel);
      }
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
