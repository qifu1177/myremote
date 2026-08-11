import { useCallback, useEffect, useRef, useState } from "react";
import type { AppInfo, DesktopSource, PermissionStatus } from "@shared/types";
import { HostSession } from "../lib/hostSession";
import { captureDesktopStream } from "../lib/screenCapture";
import { missingPermissions } from "../lib/permissions";
import { StatusBadge } from "./StatusBadge";
import { useTranslation } from "../i18n";
import type { AppSettings } from "../hooks/useAppSettings";
import { CopyIcon, EyeIcon, EyeOffIcon, RefreshIcon } from "./icons";

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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<HostSession | null>(null);
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

  const stopSharing = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setSharing(false);
    setConnectedPeers(new Set());
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => stopSharing(), [stopSharing]);

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
      const session = new HostSession(signalingUrl, appInfo.hostId, password ?? appInfo.hostPassword, {
        onPeerConnected: (id) => setConnectedPeers((prev) => new Set(prev).add(id)),
        onPeerDisconnected: (id) =>
          setConnectedPeers((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          }),
        onRemoteInput: (evt) => window.myremote.simulateInput(evt),
        onError: (msg) => setError(msg),
        confirmIncomingConnection: () =>
          Promise.resolve(
            !securitySettingsRef.current.confirmEachConnection || window.confirm(t.hostCard.confirmIncomingConnection),
          ),
      });
      sessionRef.current = session;
      await session.start(stream);
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
        <span className="id-value" style={{ fontSize: 20, letterSpacing: "0.08em" }}>
          {password ? (passwordVisible ? password : "•".repeat(password.length)) : "…"}
        </span>
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
        <>
          <div className="host-preview">
            <video ref={videoRef} muted autoPlay playsInline />
          </div>
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <StatusBadge status={connectedPeers.size > 0 ? "live" : "idle"}>
              {connectedPeers.size > 0 ? t.hostCard.peersConnected(connectedPeers.size) : t.hostCard.waitingForConnection}
            </StatusBadge>
          </div>
        </>
      )}

      <div className="card-hint">{t.hostCard.hint}</div>
    </div>
  );
}
