import { useEffect, useState } from "react";
import type { AppInfo } from "@shared/types";
import { HostCard } from "../components/HostCard";
import { ConnectCard } from "../components/ConnectCard";
import { RecentConnections } from "../components/RecentConnections";
import { MobileAccessCard } from "../components/MobileAccessCard";
import { useRecentConnections } from "../hooks/useRecentConnections";
import { useTranslation } from "../i18n";
import type { AppSettings } from "../hooks/useAppSettings";

interface ConnectPageProps {
  appInfo: AppInfo | null;
  signalingUrl: string;
  securitySettings: AppSettings["security"];
  displaySettings: AppSettings["display"];
  prefillHostId: string | null;
  onOpenRemote: (hostId: string, password: string) => void;
}

export function ConnectPage({
  appInfo,
  signalingUrl,
  securitySettings,
  displaySettings,
  prefillHostId,
  onOpenRemote,
}: ConnectPageProps): JSX.Element {
  const t = useTranslation();
  const { recents, addRecent, toggleFavorite, renameRecent, removeRecent } = useRecentConnections();
  const [pendingPasswordFor, setPendingPasswordFor] = useState<string | null>(prefillHostId ?? null);
  const [connecting] = useState(false);
  const [error] = useState<string | null>(null);

  // Wird gesetzt, wenn die Adressbuch-Seite eine Ziel-ID zum Verbinden übergibt.
  useEffect(() => {
    if (prefillHostId) setPendingPasswordFor(prefillHostId);
  }, [prefillHostId]);

  function handleConnect(hostId: string, password: string): void {
    addRecent(hostId);
    onOpenRemote(hostId, password);
  }

  function handleSelectRecent(id: string): void {
    setPendingPasswordFor(id);
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{t.connectPage.title}</h1>
        <p className="page-subtitle">{t.connectPage.subtitle}</p>
      </div>

      <div className="card-grid">
        <HostCard
          appInfo={appInfo}
          signalingUrl={signalingUrl}
          securitySettings={securitySettings}
          displaySettings={displaySettings}
        />
        <div>
          <ConnectCard
            initialHostId={pendingPasswordFor ?? undefined}
            onConnect={(id, pw) => {
              setPendingPasswordFor(null);
              handleConnect(id, pw);
            }}
            connecting={connecting}
            error={error}
          />
          {/* Zugang für iPad / iPhone / Android-Phone: QR-Code + URL zum
              Mobile-Client, der vom Signaling-Server ausgeliefert wird. */}
          <MobileAccessCard appInfo={appInfo} signalingUrl={signalingUrl} />
        </div>
      </div>

      <RecentConnections
        recents={recents}
        onSelect={handleSelectRecent}
        onToggleFavorite={toggleFavorite}
        onRename={renameRecent}
        onRemove={removeRecent}
      />
    </>
  );
}
