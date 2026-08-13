/**
 * Gemeinsame Typen zwischen Main-Prozess, Renderer und Signaling-Server.
 * Definiert das Nachrichtenprotokoll für Signaling (WebSocket) und die
 * über den WebRTC-DataChannel gesendeten Eingabe-Events.
 */

/** Rolle, die eine App-Instanz einnimmt. */
export type Role = "host" | "controller";

// ---------------------------------------------------------------------------
// Signaling-Protokoll (Client <-> Signaling-Server über WebSocket)
// ---------------------------------------------------------------------------

/** Nachrichten, die ein Client an den Signaling-Server sendet. */
export type ClientToServerMessage =
  | {
      type: "register-host";
      /** eindeutige Host-ID, z.B. "482 913 607" (ohne Leerzeichen intern) */
      id: string;
      /** Klartext-Passwort für den Verbindungsaufbau (nur für lokale/LAN MVP-Zwecke) */
      password: string;
    }
  | {
      type: "join";
      /** ID des Host, zu dem sich der Controller verbinden möchte */
      hostId: string;
      password: string;
    }
  | {
      /** WebRTC-Signalisierungsdaten (SDP-Offer/Answer, ICE-Kandidaten) weiterleiten */
      type: "signal";
      hostId: string;
      /** Ziel-Session (bei Host: an welchen Controller; bei Controller: leer/serverseitig ermittelt) */
      targetSessionId?: string;
      data: SignalPayload;
    }
  | {
      type: "leave";
      hostId: string;
    };

/** Nachrichten, die der Signaling-Server an einen Client sendet. */
export type ServerToClientMessage =
  | { type: "registered"; hostId: string; sessionId: string }
  | { type: "register-failed"; reason: string }
  | { type: "join-accepted"; hostId: string; sessionId: string }
  | { type: "join-rejected"; reason: string }
  | {
      /** Ein neuer Controller möchte sich mit diesem Host verbinden (an Host gesendet) */
      type: "peer-joined";
      sessionId: string;
    }
  | { type: "peer-left"; sessionId: string }
  | {
      type: "signal";
      sessionId: string;
      data: SignalPayload;
    }
  | { type: "error"; message: string };

/**
 * Minimale eigene Definition (statt des globalen DOM-Typs `RTCIceCandidateInit`),
 * damit dieses Modul sowohl im Renderer (DOM-Lib vorhanden) als auch im
 * Electron-Main-Prozess (keine DOM-Lib) fehlerfrei typisiert werden kann.
 */
export interface IceCandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export type SignalPayload =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice-candidate"; candidate: IceCandidateInit }
  /** Host lehnt eine eingehende Verbindung ab (Einstellung "Zustimmung bei
   *  jeder Verbindung"), bevor der WebRTC-Handshake überhaupt beginnt. Wird
   *  über den bereits vorhandenen "signal"-Relay-Kanal gesendet, damit der
   *  Signaling-Server dafür nicht angepasst werden muss. */
  | { kind: "reject" }
  /** Text-Chat zwischen Host und Controller. Läuft bewusst über den
   *  "signal"-Relay-Kanal und nicht über den WebRTC-DataChannel: Nur so kann
   *  bereits gechattet werden, BEVOR die Peer-Verbindung (Video/Eingabe)
   *  steht — und der Signaling-Server bleibt unverändert. */
  | { kind: "chat"; message: ChatMessage };

/** Eine über den Signaling-Kanal ausgetauschte Chat-Nachricht. */
export interface ChatMessage {
  /** Eindeutige ID der Nachricht (vom Absender vergeben). */
  id: string;
  /** Rolle des Absenders. */
  from: Role;
  text: string;
  /** Sendezeitpunkt als Unix-Zeit in Millisekunden. */
  sentAt: number;
}

// ---------------------------------------------------------------------------
// Eingabe-Events (Controller -> Host über WebRTC DataChannel)
// ---------------------------------------------------------------------------

export type RemoteInputEvent =
  | {
      type: "mouse-move";
      /** normierte Koordinaten 0..1 relativ zur Video-/Bildschirmgröße */
      xNorm: number;
      yNorm: number;
    }
  | {
      type: "mouse-down" | "mouse-up";
      button: "left" | "right" | "middle";
      xNorm: number;
      yNorm: number;
    }
  | {
      type: "mouse-wheel";
      deltaX: number;
      deltaY: number;
    }
  | {
      type: "key-down" | "key-up";
      /** JS KeyboardEvent.key */
      key: string;
      /** JS KeyboardEvent.code */
      code: string;
      ctrlKey: boolean;
      shiftKey: boolean;
      altKey: boolean;
      metaKey: boolean;
    };

// ---------------------------------------------------------------------------
// Dateiübertragung (Host <-> Controller über einen eigenen DataChannel)
// ---------------------------------------------------------------------------

/**
 * Steuernachrichten der Dateiübertragung. Sie werden als JSON-Text über den
 * Datei-DataChannel gesendet; die eigentlichen Dateistücke folgen als
 * Binärnachrichten (ArrayBuffer) zwischen "file-begin" und "file-end".
 * Da ein DataChannel standardmäßig geordnet zustellt, gehört jedes Binärstück
 * eindeutig zur zuletzt angekündigten Übertragung.
 */
export type FileTransferControl =
  | {
      type: "file-begin";
      /** Eindeutige ID der Übertragung (vom Absender vergeben). */
      id: string;
      name: string;
      /** Größe in Bytes — für Fortschrittsanzeige und Vollständigkeitsprüfung. */
      size: number;
      /** MIME-Typ, leer wenn unbekannt. */
      mime: string;
    }
  | { type: "file-end"; id: string }
  | { type: "file-abort"; id: string; reason: string };

// ---------------------------------------------------------------------------
// Electron IPC (Main <-> Renderer)
// ---------------------------------------------------------------------------

export interface DesktopSource {
  id: string;
  name: string;
  thumbnailDataUrl: string;
  /**
   * Electron-Display-ID des Bildschirms hinter dieser Quelle (als String, da
   * desktopCapturer sie so liefert), oder null wenn nicht zuordenbar. Wird
   * gebraucht, damit Eingaben auf genau dem freigegebenen Bildschirm landen
   * (Multi-Monitor) — nicht immer auf dem primären.
   */
  displayId: string | null;
  /** Auflösung des Bildschirms, um gleich benannte Quellen unterscheidbar zu machen. */
  size: { width: number; height: number } | null;
}

/**
 * Status der macOS-Datenschutzberechtigungen, ohne die weder Bildschirm-
 * freigabe noch Fernsteuerung funktionieren. Auf Windows/Linux immer
 * "granted"/true.
 */
export interface PermissionStatus {
  /** Bedienungshilfen — Voraussetzung für Maus-/Tastatursimulation. */
  accessibility: boolean;
  /** Bildschirmaufnahme — Voraussetzung für ein echtes Bildschirmbild. */
  screen: "granted" | "denied" | "restricted" | "not-determined" | "unknown";
}

/** Bereich der Systemeinstellungen, der geöffnet werden soll. */
export type PrivacyPane = "accessibility" | "screen";

export interface AppInfo {
  platform: NodeJS.Platform;
  /** von generateId()/generatePassword() erzeugte Zugangsdaten für den Host-Modus */
  hostId: string;
  hostPassword: string;
  /**
   * IPv4-Adresse dieses Rechners im lokalen Netz (z.B. "192.168.1.20"), oder
   * null, wenn keine gefunden wurde. Wird gebraucht, um in der UI (QR-Code /
   * Einladungs-URL für den Mobile-Client) statt "localhost" die tatsächlich
   * vom Handy/iPad erreichbare Adresse anzuzeigen.
   */
  lanAddress: string | null;
}

/** Kanal-Namen für IPC + DataChannel Label, zentral gepflegt. */
export const IPC_CHANNELS = {
  getAppInfo: "app:get-info",
  getDesktopSources: "app:get-desktop-sources",
  simulateInput: "input:simulate",
  /** Legt fest, auf welchem Bildschirm Eingaben ausgeführt werden. */
  setInputDisplay: "input:set-display",
  getPermissions: "permissions:get",
  openPrivacySettings: "permissions:open-settings",
  regenerateHostPassword: "app:regenerate-host-password",
} as const;

export const DATA_CHANNEL_LABEL = "myremote-input";

/**
 * Eigener DataChannel für Dateiübertragungen. Bewusst getrennt vom
 * Eingabe-Kanal: Große Dateistücke würden dort sonst Maus-/Tastatur-Events
 * verzögern.
 */
export const FILE_CHANNEL_LABEL = "myremote-files";
