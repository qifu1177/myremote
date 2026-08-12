import { useCallback, useEffect, useState } from "react";
import { ConnectScreen } from "./components/ConnectScreen";
import { RemoteScreen } from "./components/RemoteScreen";
import { useDeviceClass } from "./hooks/useDeviceClass";
import { useMobileSettings, useRecentHosts } from "./hooks/useMobileSettings";
import { clearStoredSession, loadStoredSession, storeSession } from "./lib/session";
import { detectLocale, storeLocale, textsFor, type Locale } from "./i18n";

interface ActiveSession {
  hostId: string;
  password: string;
}

/**
 * Wurzelkomponente des Mobile-Clients.
 *
 * Zwei Zustände: Verbindungsmaske (ConnectScreen) oder laufende Sitzung
 * (RemoteScreen). Zusätzlich werden Parameter aus der URL übernommen, damit
 * ein vom Host angezeigter QR-Code die Partner-ID (optional auch das
 * Passwort) direkt vorbelegen kann:
 *   http://<server>:8787/?id=482913607&pw=abc123
 *
 * Die laufende Sitzung wird im sessionStorage gesichert und beim Start sofort
 * wiederhergestellt, damit ein Neuladen der Seite die Verbindung nicht
 * abreißen lässt (siehe lib/session.ts).
 */
export default function App(): JSX.Element {
  const device = useDeviceClass();
  const { settings, update } = useMobileSettings();
  const { recents, addRecent, removeRecent, clearRecents } = useRecentHosts();
  const [locale, setLocale] = useState<Locale>(detectLocale);
  // Direkt beim ersten Render aus dem sessionStorage lesen: So erscheint nach
  // einem Neuladen sofort wieder die Sitzung statt kurz des Verbindungsformulars.
  const [session, setSession] = useState<ActiveSession | null>(loadStoredSession);
  const [prefill, setPrefill] = useState<{ hostId: string; password: string }>({ hostId: "", password: "" });

  const texts = textsFor(locale);

  useEffect(() => {
    storeLocale(locale);
    document.documentElement.lang = locale;
  }, [locale]);

  // Formfaktor als data-Attribut, damit CSS gezielt Phone/Tablet-Varianten
  // gestalten kann, ohne dass Komponenten Layout-Logik enthalten müssen.
  useEffect(() => {
    document.body.dataset.device = device.deviceClass;
    document.body.dataset.orientation = device.orientation;
  }, [device.deviceClass, device.orientation]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const pw = params.get("pw");
    const server = params.get("server");
    if (id || pw) setPrefill({ hostId: id ?? "", password: pw ?? "" });
    if (server) update({ signalingUrl: server });
    if (id || pw || server) {
      // Zugangsdaten nicht dauerhaft in der Adressleiste stehen lassen.
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [update]);

  const handleConnect = useCallback(
    (hostId: string, password: string) => {
      addRecent(hostId);
      storeSession({ hostId, password });
      setSession({ hostId, password });
    },
    [addRecent],
  );

  // Trennen ist eine bewusste Entscheidung: Dann darf ein Neuladen die
  // Verbindung auch nicht wiederherstellen.
  const handleClose = useCallback(() => {
    clearStoredSession();
    setSession(null);
  }, []);

  if (session) {
    return (
      <RemoteScreen
        hostId={session.hostId}
        password={session.password}
        settings={settings}
        onUpdateSettings={update}
        texts={texts}
        device={device}
        onClose={handleClose}
      />
    );
  }

  return (
    <ConnectScreen
      texts={texts}
      locale={locale}
      onChangeLocale={setLocale}
      settings={settings}
      onUpdateSettings={update}
      recents={recents}
      onRemoveRecent={removeRecent}
      onClearRecents={clearRecents}
      prefill={prefill}
      device={device}
      onConnect={handleConnect}
    />
  );
}
