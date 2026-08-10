import { useEffect, useState } from "react";
import "./styles/app.css";
import { Sidebar, type Page } from "./components/Sidebar";
import { ConnectPage } from "./pages/ConnectPage";
import { AddressBookPage } from "./pages/AddressBookPage";
import { SettingsPage } from "./pages/SettingsPage";
import { RemoteView } from "./components/RemoteView";
import { useAppInfo } from "./hooks/useAppInfo";
import { useSignalingUrl } from "./hooks/useSignalingUrl";
import { useAppSettings } from "./hooks/useAppSettings";

interface ActiveRemote {
  hostId: string;
  password: string;
}

export default function App(): JSX.Element {
  const appInfo = useAppInfo();
  const [signalingUrl, setSignalingUrl] = useSignalingUrl();
  const { settings, updateSecurity, updateDisplay, updateNetwork } = useAppSettings();
  const [page, setPage] = useState<Page>("connect");
  const [activeRemote, setActiveRemote] = useState<ActiveRemote | null>(null);
  // Von der Adressbuch-Seite aus vorbefüllte Ziel-ID für die Verbinden-Karte
  // auf der ConnectPage (analog zum bereits vorhandenen Klick auf einen
  // Verlaufs-/Favoriten-Eintrag).
  const [prefillHostId, setPrefillHostId] = useState<string | null>(null);

  // Auf macOS reservieren die nativen Traffic-Light-Fensterknöpfe (bei
  // titleBarStyle "hiddenInset") den Bereich oben links im Fenster. Damit
  // sie nicht mit den App-eigenen Sidebar-/Toolbar-Buttons kollidieren,
  // markieren wir das <body> mit der Plattform, sobald sie bekannt ist.
  useEffect(() => {
    if (appInfo?.platform) {
      document.body.dataset.platform = appInfo.platform;
    }
  }, [appInfo?.platform]);

  if (activeRemote) {
    return (
      <RemoteView
        hostId={activeRemote.hostId}
        password={activeRemote.password}
        signalingUrl={signalingUrl}
        displaySettings={settings.display}
        onClose={() => setActiveRemote(null)}
      />
    );
  }

  return (
    <div className="app-shell">
      <Sidebar active={page} onNavigate={setPage} />
      <main className="main-panel">
        {/* App-Name in der obersten Zeile des Fensters, auf gleicher Höhe wie
            die nativen macOS-Traffic-Light-Buttons (die im .sidebar-Bereich
            liegen). Der Text liegt im bereits als Drag-Region markierten
            oberen Streifen von .main-panel (siehe .main-panel::before) und
            bekommt auf macOS zusätzlichen Abstand, damit er nicht mit den
            Ampel-Knöpfen kollidiert. */}
        <div className="app-title-bar">mydesk</div>
        {page === "connect" && (
          <ConnectPage
            appInfo={appInfo}
            signalingUrl={signalingUrl}
            securitySettings={settings.security}
            displaySettings={settings.display}
            prefillHostId={prefillHostId}
            onOpenRemote={(hostId, password) => setActiveRemote({ hostId, password })}
          />
        )}
        {page === "addressbook" && (
          <AddressBookPage
            onConnect={(hostId) => {
              setPrefillHostId(hostId);
              setPage("connect");
            }}
          />
        )}
        {page === "settings" && (
          <SettingsPage
            signalingUrl={signalingUrl}
            onChangeSignalingUrl={setSignalingUrl}
            appInfo={appInfo}
            settings={settings}
            onUpdateSecurity={updateSecurity}
            onUpdateDisplay={updateDisplay}
            onUpdateNetwork={updateNetwork}
          />
        )}
      </main>
    </div>
  );
}
