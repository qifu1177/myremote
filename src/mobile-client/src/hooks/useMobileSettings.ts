import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_TOUCH_CONFIG, type TouchInputConfig } from "../lib/touchInput";

const SETTINGS_KEY = "mydesk-mobile:settings";
const RECENT_KEY = "mydesk-mobile:recent";

/**
 * Standard-Signaling-URL des Mobile-Clients.
 *
 * Wichtig: Auf dem Handy ist "localhost" der *eigene* Browser, nicht der
 * Host-Rechner. Da der Signaling-Server den Mobile-Client selbst per HTTP
 * ausliefert, ist die passende Adresse in aller Regel derselbe Host/Port,
 * von dem die Seite geladen wurde — das leiten wir hier automatisch ab.
 */
export function defaultSignalingUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:8787";
  const { protocol, hostname, port } = window.location;
  if (protocol === "file:") return "ws://localhost:8787";
  const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
  // Im Vite-Dev-Server (Port 5180) läuft das Signaling separat auf 8787.
  const targetPort = port === "5180" ? "8787" : port;
  return `${wsProtocol}//${hostname}${targetPort ? `:${targetPort}` : ""}`;
}

export interface MobileSettings extends TouchInputConfig {
  signalingUrl: string;
}

/**
 * Prüft, ob eine gespeicherte Signaling-URL zur aktuellen Seiten-Herkunft passt.
 *
 * Der Mobile-Client wird vom Signaling-Server selbst ausgeliefert. Zeigt eine
 * gespeicherte URL auf einen anderen Host (alte LAN-IP nach DHCP-Wechsel,
 * anderes Netz, oder "localhost" aus einem Desktop-Profil), ist sie veraltet
 * und vom Mobilgerät aus nicht erreichbar — dann gilt die Adresse, von der die
 * Seite tatsächlich geladen wurde. Abweichende Ports bleiben erlaubt, damit
 * eine bewusst gesetzte URL (Feld "Server" bzw. `?server=`) erhalten bleibt.
 */
function matchesPageOrigin(url: string): boolean {
  if (typeof window === "undefined" || window.location.protocol === "file:") return true;
  try {
    return new URL(url).hostname === window.location.hostname;
  } catch {
    return false;
  }
}

/** Exportiert für Tests: Auflösung der wirksamen Einstellungen beim Start. */
export function loadSettings(): MobileSettings {
  const fallback: MobileSettings = { ...DEFAULT_TOUCH_CONFIG, signalingUrl: defaultSignalingUrl() };
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<MobileSettings>) : {};
    const { signalingUrl, ...touch } = parsed;
    return {
      ...fallback,
      ...touch,
      ...(signalingUrl && matchesPageOrigin(signalingUrl) ? { signalingUrl } : {}),
    };
  } catch {
    return fallback;
  }
}

export function useMobileSettings(): {
  settings: MobileSettings;
  update: (patch: Partial<MobileSettings>) => void;
} {
  const [settings, setSettings] = useState<MobileSettings>(loadSettings);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* privater Modus / Speicher voll: Einstellungen gelten dann nur für die Sitzung */
    }
  }, [settings]);

  const update = useCallback((patch: Partial<MobileSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  return { settings, update };
}

export interface RecentEntry {
  hostId: string;
  lastUsed: number;
}

export function useRecentHosts(): {
  recents: RecentEntry[];
  addRecent: (hostId: string) => void;
  removeRecent: (hostId: string) => void;
  clearRecents: () => void;
} {
  const [recents, setRecents] = useState<RecentEntry[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      return raw ? (JSON.parse(raw) as RecentEntry[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recents));
    } catch {
      /* ignorieren */
    }
  }, [recents]);

  const addRecent = useCallback((hostId: string) => {
    const id = hostId.trim();
    if (!id) return;
    setRecents((prev) => [{ hostId: id, lastUsed: Date.now() }, ...prev.filter((r) => r.hostId !== id)].slice(0, 8));
  }, []);

  const removeRecent = useCallback((hostId: string) => {
    setRecents((prev) => prev.filter((r) => r.hostId !== hostId));
  }, []);

  const clearRecents = useCallback(() => setRecents([]), []);

  return useMemo(
    () => ({ recents, addRecent, removeRecent, clearRecents }),
    [recents, addRecent, removeRecent, clearRecents],
  );
}
