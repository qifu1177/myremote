import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { AppInfo } from "@shared/types";
import { useTranslation } from "../i18n";
import { isLoopbackUrl, mobileClientInviteUrl, withReachableHost } from "../lib/mobileClientUrl";
import { CopyIcon } from "./icons";

interface MobileAccessCardProps {
  appInfo: AppInfo | null;
  signalingUrl: string;
}

/**
 * Zeigt QR-Code und URL, mit denen der **Mobile-Client** auf iPad, iPhone
 * oder Android-Phone geöffnet wird.
 *
 * Bewusst als eigene Komponente (statt Erweiterung der HostCard), damit die
 * bestehende, erprobte Host-Logik unverändert bleibt (Open-Closed-Prinzip).
 */
export function MobileAccessCard({ appInfo, signalingUrl }: MobileAccessCardProps): JSX.Element {
  const t = useTranslation();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Steht die Signaling-URL auf "localhost", wird für QR-Code und angezeigte
  // Adresse die LAN-Adresse dieses Rechners eingesetzt — nur die ist vom
  // iPad/Smartphone aus erreichbar.
  const reachableUrl = withReachableHost(signalingUrl, appInfo?.lanAddress ?? null);
  const inviteUrl = appInfo ? mobileClientInviteUrl(reachableUrl, appInfo.hostId) : null;
  const loopback = isLoopbackUrl(reachableUrl);

  useEffect(() => {
    if (!inviteUrl) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(inviteUrl, {
      width: 320,
      margin: 1,
      color: { dark: "#0b1210", light: "#eef1f5" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [inviteUrl]);

  function copyUrl(): void {
    if (!inviteUrl) return;
    void navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="card mobile-access-card">
      <div className="card-label">{t.mobileAccess.title}</div>
      <p className="card-hint" style={{ marginTop: 0 }}>
        {t.mobileAccess.subtitle}
      </p>

      {qrDataUrl ? (
        <div className="qr-wrap">
          <img className="qr-image" src={qrDataUrl} alt={t.mobileAccess.qrAlt} width={168} height={168} />
        </div>
      ) : (
        <div className="qr-wrap qr-placeholder">…</div>
      )}

      {inviteUrl && (
        <div className="id-row">
          <span className="mobile-url">{inviteUrl}</span>
          <button
            className="id-copy-btn"
            type="button"
            title={t.mobileAccess.copyUrl}
            aria-label={t.mobileAccess.copyUrl}
            onClick={copyUrl}
          >
            <CopyIcon size={14} />
          </button>
        </div>
      )}

      {copied && <div className="card-hint">{t.mobileAccess.copied}</div>}
      {loopback && <div className="error-text">{t.mobileAccess.loopbackHint}</div>}
      <div className="card-hint">{t.mobileAccess.hint}</div>
    </div>
  );
}
