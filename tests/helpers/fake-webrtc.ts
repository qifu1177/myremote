/**
 * Minimale, aber *semantisch treue* WebRTC-Attrappe für die Tests.
 *
 * Warum nicht einfach ein Stub, der jeden DataChannel öffnet?
 * Genau daran wäre der hier getestete Fehler vorbeigelaufen: In echtem WebRTC
 * wird ein DataChannel nur dann aufgebaut, wenn er zum Zeitpunkt von
 * `createOffer()` beim **Offerer** existiert — nur dann enthält das SDP eine
 * `m=application`-Sektion. Legt ihn stattdessen der Answerer an, bleibt der
 * Kanal für immer im Zustand "connecting".
 *
 * Dieses Verhalten wurde im echten Chrome nachgemessen und wird hier
 * nachgebildet:
 *
 *   Offer nur mit Video-Track      -> "m=video"
 *   Offer mit Video + DataChannel  -> "m=video" + "m=application"
 *   Answer                         -> spiegelt die m-Sektionen des Offers
 *   DataChannel wird "open"        -> nur wenn BEIDE SDPs "m=application" haben
 *
 * Damit prüfen die Tests den tatsächlichen Verhandlungsablauf und nicht nur
 * das Absetzen der Signaling-Nachrichten.
 */

/** Ein per WebRTC ausgetauschter Datenkanal. */
export class FakeDataChannel {
  readyState: "connecting" | "open" | "closed" = "connecting";
  onmessage: ((ev: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  /** Gegenstelle; wird beim Verhandeln gesetzt. */
  peer: FakeDataChannel | null = null;

  constructor(readonly label: string) {}

  send(data: string): void {
    if (this.readyState !== "open") throw new Error(`DataChannel "${this.label}" ist nicht offen`);
    // Zustellung asynchron, wie im echten Netzwerk.
    queueMicrotask(() => this.peer?.onmessage?.({ data }));
  }

  open(): void {
    if (this.readyState === "open") return;
    this.readyState = "open";
    this.onopen?.();
  }

  close(): void {
    this.readyState = "closed";
  }
}

interface FakeSessionDescription {
  type: "offer" | "answer";
  sdp: string;
}

let pcCounter = 0;

/** Alle lebenden Verbindungen, damit sich zwei Peers über die SDP finden. */
const registry = new Map<string, FakePeerConnection>();

const MEDIA_LINE = "m=video 9 UDP/TLS/RTP/SAVPF 96";
const DATA_LINE = "m=application 9 UDP/DTLS/SCTP webrtc-datachannel";

export class FakePeerConnection {
  readonly id = `pc${(pcCounter += 1)}`;
  connectionState: RTCPeerConnectionState = "new";

  onicecandidate: ((ev: { candidate: FakeIceCandidate | null }) => void) | null = null;
  ondatachannel: ((ev: { channel: FakeDataChannel }) => void) | null = null;
  ontrack: ((ev: { streams: FakeMediaStream[] }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;

  /** Kandidaten, die diese Seite über das Signaling empfangen hat. */
  readonly receivedCandidates: unknown[] = [];

  private readonly tracks: unknown[] = [];
  private readonly localChannels: FakeDataChannel[] = [];
  private remoteChannels: FakeDataChannel[] = [];
  private localSdp: string | null = null;
  private remoteSdp: string | null = null;
  private remotePeer: FakePeerConnection | null = null;

  constructor(_config?: unknown) {
    registry.set(this.id, this);
  }

  // --- API-Oberfläche, die Host-/ControllerSession benutzen ---------------

  addTrack(track: unknown, _stream: unknown): void {
    this.tracks.push(track);
  }

  createDataChannel(label: string): FakeDataChannel {
    const channel = new FakeDataChannel(label);
    this.localChannels.push(channel);
    return channel;
  }

  async createOffer(): Promise<FakeSessionDescription> {
    return { type: "offer", sdp: this.buildSdp(this.tracks.length > 0, this.localChannels.length > 0) };
  }

  async createAnswer(): Promise<FakeSessionDescription> {
    // Ein Answer kann nur die im Offer angebotenen m-Sektionen bestätigen.
    const offer = this.remoteSdp ?? "";
    return {
      type: "answer",
      sdp: this.buildSdp(offer.includes(MEDIA_LINE), offer.includes(DATA_LINE)),
    };
  }

  async setLocalDescription(description: FakeSessionDescription): Promise<void> {
    this.localSdp = description.sdp;
    // Echte Implementierungen sammeln ab hier ICE-Kandidaten.
    queueMicrotask(() => this.onicecandidate?.({ candidate: new FakeIceCandidate(this.id) }));
    this.maybeComplete();
  }

  async setRemoteDescription(description: { type: string; sdp: string }): Promise<void> {
    this.remoteSdp = description.sdp;
    const peerId = /^a=peer:(pc\d+)$/m.exec(description.sdp)?.[1];
    this.remotePeer = peerId ? (registry.get(peerId) ?? null) : null;

    if (description.type === "offer") {
      // Der Answerer erfährt hier, was der Offerer anbietet.
      if (description.sdp.includes(MEDIA_LINE)) {
        queueMicrotask(() => this.ontrack?.({ streams: [new FakeMediaStream()] }));
      }
      if (description.sdp.includes(DATA_LINE)) {
        for (const remote of this.remotePeer?.localChannels ?? []) {
          const incoming = new FakeDataChannel(remote.label);
          incoming.peer = remote;
          remote.peer = incoming;
          this.remoteChannels.push(incoming);
          queueMicrotask(() => this.ondatachannel?.({ channel: incoming }));
        }
      }
    }
    this.maybeComplete();
  }

  async addIceCandidate(candidate: unknown): Promise<void> {
    this.receivedCandidates.push(candidate);
  }

  async getStats(): Promise<Map<string, unknown>> {
    return new Map();
  }

  close(): void {
    this.connectionState = "closed";
    for (const c of [...this.localChannels, ...this.remoteChannels]) c.close();
    registry.delete(this.id);
  }

  // --- intern ------------------------------------------------------------

  private buildSdp(withMedia: boolean, withData: boolean): string {
    const lines = ["v=0", `a=peer:${this.id}`];
    if (withMedia) lines.push(MEDIA_LINE);
    if (withData) lines.push(DATA_LINE);
    return lines.join("\n");
  }

  /** Sobald beide Beschreibungen gesetzt sind, ist die Verbindung fertig verhandelt. */
  private maybeComplete(): void {
    if (!this.localSdp || !this.remoteSdp || this.connectionState === "connected") return;

    // Ein DataChannel kommt nur zustande, wenn BEIDE Seiten ihn ausgehandelt
    // haben — genau das ist der Kern des behobenen Fehlers.
    const negotiated = this.localSdp.includes(DATA_LINE) && this.remoteSdp.includes(DATA_LINE);
    if (negotiated) {
      for (const c of [...this.localChannels, ...this.remoteChannels]) queueMicrotask(() => c.open());
    }

    this.connectionState = "connected";
    queueMicrotask(() => this.onconnectionstatechange?.());
  }
}

export class FakeIceCandidate {
  constructor(private readonly from: string) {}
  toJSON(): { candidate: string; sdpMid: string; sdpMLineIndex: number } {
    return { candidate: `candidate:from-${this.from}`, sdpMid: "0", sdpMLineIndex: 0 };
  }
}

export class FakeMediaStream {
  constructor(private readonly tracks: unknown[] = [{ kind: "video", stop: () => {} }]) {}
  getTracks(): unknown[] {
    return this.tracks;
  }
}

/**
 * Installiert die Attrappen als Globals (der Produktionscode nutzt die
 * Browser-Globals `RTCPeerConnection` / `MediaStream`) und liefert eine
 * Aufräumfunktion zurück.
 */
export function installFakeWebRtc(): () => void {
  const g = globalThis as Record<string, unknown>;
  const previous = { pc: g.RTCPeerConnection, ms: g.MediaStream };
  g.RTCPeerConnection = FakePeerConnection;
  g.MediaStream = FakeMediaStream;
  return () => {
    g.RTCPeerConnection = previous.pc;
    g.MediaStream = previous.ms;
    registry.clear();
  };
}
