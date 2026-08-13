import { useCallback, useEffect, useRef, useState } from "react";
import type { AppInfo, ChatMessage, DesktopSource, PermissionStatus } from "@shared/types";
import { HostSession } from "../lib/hostSession";
import { captureDesktopStream } from "../lib/screenCapture";
import { missingPermissions } from "../lib/permissions";
import { StatusBadge } from "./StatusBadge";
import { ChatPanel } from "./ChatPanel";
import { FileTransferPanel } from "./FileTransferPanel";
import { useTranslation } from "../i18n";
import { useFileTransfers } from "../hooks/useFileTransfers";
import type { AppSettings } from "../hooks/useAppSettings";
import { ChatIcon, CopyIcon, EyeIcon, EyeOffIcon, FolderIcon, RefreshIcon } from "./icons";

interface HostCardProps {
  appInfo: AppInfo | null;
  signalingUrl: string;
  securitySettings: AppSettings["security"];
  displaySettings: AppSettings["display"];
}

const PERSISTED_PASSWORD_KEY = "myremote:persistedHostPassword";

export function HostCard({ appInfo, signalingUrl, securitySettings, displaySettings }: HostCardProps): JSX.Element {
  const t = useTranslation();
  const [sharing, setSharing] = useState(false);
  const [sources, setSources] = useState<DesktopSource[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [connectedPeers, setConnectedPeers] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<PermissionStatus | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  /** Wie viele Controller aktuell per Chat erreichbar sind (auch ohne Peer-Verbindung). */
  const [chatPeers, setChatPeers] = useState(0);
  const [filesOpen, setFilesOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<HostSession | null>(null);

  const { transfers, callbacks: fileCallbacks, sendFiles } = useFileTransfers((file, onProgress) => {
    const session = sessionRef.current;
    if (!session) return Promise.reject(new Error(t.fileTransfer.waitingForPeer));
    return session.sendFile(file, onProgress);
  });
  // ensureSession erzeugt die Callbacks einmalig als Closure — über die Ref
  // greifen sie trotzdem immer auf den aktuellen Stand zu.
  const fileCallbacksRef = useRef(fileCallbacks);
  fileCallbacksRef.current = fileCallbacks;
  // Ref statt direktem State-Zugriff im Callback, da confirmIncomingConnection
  // als Closure beim Sitzungsstart erzeugt wird und spätere Settings-Änderungen
  // (während einer laufenden Freigabe) trotzdem berücksichtigt werden sollen.
  const securitySettingsRef = useRef(securitySettings);
  useEffect(() => {
    securitySettingsRef.current = securitySettings;
  }, [securitySettings]);

  // appInfo liefert das beim App-Start generierte Passwort. Ist "Zufälliges
  // Passwort bei jedem Start" (Settings → Sicherheit) deaktiviert, wird
  // stattdessen ein zuvor lokal gespeichertes Passwort wiederverwendet (sofern
  // vorhanden), damit es über App-Neustarts hinweg stabil bleibt.
  useEffect(() => {
    if (!appInfo?.hostPassword) return;
    if (!securitySettings.randomPasswordOnStart) {
      const stored = localStorage.getItem(PERSISTED_PASSWORD_KEY);
      if (stored) {
        setPassword(stored);
        return;
      }
      localStorage.setItem(PERSISTED_PASSWORD_KEY, appInfo.hostPassword);
    }
    setPassword(appInfo.hostPassword);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appInfo?.hostPassword]);

  useEffect(() => {
    if (password && !securitySettings.randomPasswordOnStart) {
      localStorage.setItem(PERSISTED_PASSWORD_KEY, password);
    }
  }, [password, securitySettings.randomPasswordOnStart]);

  async function regeneratePassword(): Promise<void> {
    setRefreshing(true);
    try {
      const next = await window.myremote.regenerateHostPassword();
      // Eine reine Chat-Anmeldung läuft noch mit dem alten Passwort — sie wird
      // beendet und unten automatisch mit dem neuen neu angemeldet. Während
      // einer laufenden Freigabe bleibt die Sitzung unangetastet.
      if (!sharing) {
        sessionRef.current?.stop();
        sessionRef.current = null;
        setChatPeers(0);
      }
      setPassword(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }

  const refreshPermissions = useCallback(async (): Promise<PermissionStatus> => {
    const status = await window.myremote.getPermissions();
    setPermissions(status);
    return status;
  }, []);

  // Berechtigungen werden im System erteilt, während die App im Hintergrund
  // ist. Deshalb bei jeder Rückkehr ins Fenster erneut prüfen — sonst zeigt
  // die Karte dauerhaft den alten (fehlenden) Stand an.
  useEffect(() => {
    void refreshPermissions();
    const onFocus = (): void => {
      void refreshPermissions();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshPermissions]);

  /** Beendet nur die Bildschirmfreigabe — die Sitzung (und damit der Chat) bleibt. */
  const stopSharing = useCallback(() => {
    sessionRef.current?.stopStream();
    setSharing(false);
    setConnectedPeers(new Set());
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  /** Beim Verlassen der Seite alles abbauen (auch die Chat-Sitzung). */
  useEffect(
    () => () => {
      sessionRef.current?.stop();
      sessionRef.current = null;
    },
    [],
  );

  /**
   * Liefert die laufende Host-Sitzung; meldet den Host bei Bedarf ohne
   * Bildschirmfreigabe beim Signaling-Server an. So ist er für den Chat
   * erreichbar, ohne etwas freizugeben.
   */
  const ensureSession = useCallback(async (): Promise<HostSession | null> => {
    if (sessionRef.current) return sessionRef.current;
    if (!appInfo) return null;
    // Leeres Passwort = "Ohne Passwort freigeben" (Settings -> Sicherheit).
    // Der Signaling-Server lässt dann jeden Beitritt mit dieser ID zu.
    const effectivePassword = securitySettings.shareWithoutPassword ? "" : (password ?? appInfo.hostPassword);
    const session = new HostSession(signalingUrl, appInfo.hostId, effectivePassword, {
      onPeerConnected: (id) => setConnectedPeers((prev) => new Set(prev).add(id)),
      onPeerDisconnected: (id) =>
        setConnectedPeers((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        }),
      onRemoteInput: (evt) => window.myremote.simulateInput(evt),
      onChatMessage: (msg) => {
        setChatMessages((prev) => [...prev, msg]);
        setUnreadChat((n) => n + 1);
        setChatOpen(true);
      },
      onChatPeersChanged: setChatPeers,
      onIncomingFile: (meta) => {
        fileCallbacksRef.current.onIncomingFile(meta);
        setFilesOpen(true);
      },
      onIncomingFileProgress: (id, received, total) =>
        fileCallbacksRef.current.onIncomingFileProgress(id, received, total),
      onFileReceived: (file) => fileCallbacksRef.current.onFileReceived(file),
      onFileAborted: (id, reason) => fileCallbacksRef.current.onFileAborted(id, reason),
      onError: (msg) => setError(msg),
      confirmIncomingConnection: () =>
        Promise.resolve(
          !securitySettingsRef.current.confirmEachConnection || window.confirm(t.hostCard.confirmIncomingConnection),
        ),
    });
    sessionRef.current = session;
    await session.start();
    return session;
    // t/securitySettings werden bewusst über Refs bzw. beim Erzeugen gelesen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appInfo, signalingUrl, password, securitySettings.shareWithoutPassword]);

  // Das Passwort steckt in der Registrierung beim Signaling-Server. Wird "Ohne
  // Passwort freigeben" umgeschaltet, muss eine bereits laufende (Chat-)Sitzung
  // neu angemeldet werden — sonst gilt weiter die alte Registrierung. Während
  // einer laufenden Freigabe bleibt sie unangetastet, genau wie beim
  // Neu-Generieren des Passworts.
  useEffect(() => {
    if (sharing || !sessionRef.current) return;
    sessionRef.current.stop();
    sessionRef.current = null;
    setChatPeers(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [securitySettings.shareWithoutPassword]);

  function sendChat(text: string): void {
    const sent = sessionRef.current?.sendChat(text);
    if (sent) setChatMessages((prev) => [...prev, sent]);
  }

  async function toggleChat(): Promise<void> {
    if (chatOpen) {
      setChatOpen(false);
      return;
    }
    setUnreadChat(0);
    setChatOpen(true);
    try {
      await ensureSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function openPicker(): Promise<void> {
    setError(null);
    // Vor dem Auflisten prüfen: Ohne Bildschirmaufnahme-Recht liefert macOS
    // für alle Bildschirme nur Ersatz-Thumbnails, die Auswahl wäre blind.
    const status = await refreshPermissions();
    if (status.screen !== "granted") {
      setError(t.hostCard.screenPermissionRequired);
      return;
    }
    const list = await window.myremote.getDesktopSources();
    setSources(list);
    setPickerOpen(true);
  }

  async function startSharing(source: DesktopSource): Promise<void> {
    if (!appInfo) return;
    setPickerOpen(false);
    try {
      const stream = await captureDesktopStream(source.id, displaySettings.quality);
      // Eingaben müssen auf genau diesem Bildschirm landen, nicht auf dem
      // primären — sonst steuert man bei mehreren Monitoren ins Leere.
      window.myremote.setInputDisplay(source.displayId);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      // Läuft bereits eine (Chat-)Sitzung, wird sie weiterverwendet — sonst
      // ginge der bisherige Chat beim Start der Freigabe verloren.
      const session = await ensureSession();
      if (!session) return;
      await session.setStream(stream);
      setSharing(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="card">
      <div className="card-label">{t.hostCard.yourId}</div>
      <div className="id-row">
        <span className="id-value">{appInfo?.hostId ?? "…"}</span>
        <button
          className="id-copy-btn"
          type="button"
          title={t.hostCard.copyId}
          aria-label={t.hostCard.copyId}
          onClick={() => appInfo && navigator.clipboard.writeText(appInfo.hostId.replace(/\s+/g, ""))}
        >
          <CopyIcon size={14} />
        </button>
      </div>
      <div className="card-label">{t.hostCard.password}</div>
      <div className="id-row">
        {/* Ohne Passwort freigeben: Es gibt nichts anzuzeigen, zu verbergen,
            neu zu erzeugen oder zu kopieren — nur den Hinweis. */}
        <span
          className="id-value"
          style={{ fontSize: securitySettings.shareWithoutPassword ? 15 : 20, letterSpacing: "0.08em" }}
        >
          {securitySettings.shareWithoutPassword
            ? t.hostCard.noPasswordNeeded
            : password
              ? passwordVisible
                ? password
                : "•".repeat(password.length)
              : "…"}
        </span>
        {!securitySettings.shareWithoutPassword && (
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="id-copy-btn"
            type="button"
            title={passwordVisible ? t.hostCard.hidePassword : t.hostCard.showPassword}
            onClick={() => setPasswordVisible((v) => !v)}
          >
            {passwordVisible ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
          </button>
          <button
            className="id-copy-btn"
            type="button"
            title={t.hostCard.regeneratePassword}
            disabled={refreshing}
            onClick={regeneratePassword}
          >
            <RefreshIcon size={14} />
          </button>
          <button
            className="id-copy-btn"
            type="button"
            title={t.hostCard.copyPassword}
            aria-label={t.hostCard.copyPassword}
            onClick={() => password && navigator.clipboard.writeText(password)}
          >
            <CopyIcon size={14} />
          </button>
        </div>
        )}
      </div>

      {permissions &&
        missingPermissions(permissions).map((kind) => (
          <div key={kind} className="permission-warning">
            <div className="error-text">
              {kind === "screen" ? t.hostCard.screenPermissionHint : t.hostCard.accessibilityHint}
            </div>
            <div className="permission-actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => void window.myremote.openPrivacySettings(kind)}
              >
                {t.hostCard.openSystemSettings}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => void refreshPermissions()}>
                {t.hostCard.recheckPermission}
              </button>
            </div>
          </div>
        ))}

      {!sharing ? (
        <button className="btn btn-primary btn-block" style={{ marginTop: 18 }} onClick={openPicker}>
          {t.hostCard.shareScreen}
        </button>
      ) : (
        <button className="btn btn-danger btn-block" style={{ marginTop: 18 }} onClick={stopSharing}>
          {t.hostCard.stopSharing}
        </button>
      )}

      {error && <div className="error-text">{error}</div>}

      {pickerOpen && (
        <div className="settings-inline">
          <div className="section-title">{t.hostCard.chooseScreen}</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {sources.map((s) => (
              <button
                key={s.id}
                className="btn btn-secondary"
                style={{ padding: 6, display: "flex", flexDirection: "column", gap: 6 }}
                onClick={() => startSharing(s)}
              >
                <img src={s.thumbnailDataUrl} alt={s.name} width={140} style={{ borderRadius: 4 }} />
                <span style={{ fontSize: 11 }}>
                  {s.name}
                  {/* Auflösung mit anzeigen: Mehrere Monitore heißen oft
                      identisch ("Bildschirm 1"/"Entire Screen"). */}
                  {s.size ? ` · ${s.size.width}×${s.size.height}` : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {sharing && (
        <div className="host-preview">
          <video ref={videoRef} muted autoPlay playsInline />
        </div>
      )}

      {/* Chat ist bewusst unabhängig von der Bildschirmfreigabe erreichbar:
          Er läuft über den Signaling-Kanal, nicht über die Peer-Verbindung. */}
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
        {sharing && (
          <StatusBadge status={connectedPeers.size > 0 ? "live" : "idle"}>
            {connectedPeers.size > 0 ? t.hostCard.peersConnected(connectedPeers.size) : t.hostCard.waitingForConnection}
          </StatusBadge>
        )}
        <button
          type="button"
          className={`toolbar-icon-btn ${chatOpen ? "active" : ""}`}
          title={unreadChat > 0 ? t.chat.unread(unreadChat) : chatOpen ? t.chat.close : t.chat.open}
          onClick={() => void toggleChat()}
        >
          <ChatIcon size={17} />
          {unreadChat > 0 && <span className="chat-unread-dot" />}
        </button>
        {/* Dateien brauchen — anders als der Chat — die stehende
            Peer-Verbindung, laufen also nur bei aktiver Freigabe. */}
        <button
          type="button"
          className={`toolbar-icon-btn ${filesOpen ? "active" : ""}`}
          title={filesOpen ? t.fileTransfer.close : t.fileTransfer.open}
          onClick={() => setFilesOpen((v) => !v)}
        >
          <FolderIcon size={17} />
        </button>
      </div>
      {chatOpen && <ChatPanel messages={chatMessages} selfRole="host" onSend={sendChat} disabled={chatPeers === 0} />}
      {filesOpen && (
        <FileTransferPanel transfers={transfers} onSend={sendFiles} disabled={connectedPeers.size === 0} />
      )}

      <div className="card-hint">{t.hostCard.hint}</div>
    </div>
  );
}
