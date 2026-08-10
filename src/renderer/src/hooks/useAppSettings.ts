import { useCallback, useEffect, useState } from "react";

/** Bildqualität-Stufen, analog zum Design (Beste Qualität/Ausbalanciert/Beste Geschwindigkeit). */
export type StreamQuality = "best" | "balanced" | "fast";

export interface AppSettings {
  security: {
    /** Bei jedem App-Start automatisch ein neues Host-Passwort generieren (Standard: an). */
    randomPasswordOnStart: boolean;
    /** Jede eingehende Verbindung muss am Host manuell bestätigt werden. */
    confirmEachConnection: boolean;
  };
  display: {
    quality: StreamQuality;
    showRemoteCursor: boolean;
    fitToWindow: boolean;
  };
  network: {
    directIpAccess: boolean;
    port: string;
  };
}

const STORAGE_KEY = "myremote:settings";

export const DEFAULT_SETTINGS: AppSettings = {
  security: {
    randomPasswordOnStart: true,
    confirmEachConnection: true,
  },
  display: {
    quality: "balanced",
    showRemoteCursor: true,
    fitToWindow: true,
  },
  network: {
    directIpAccess: false,
    port: "8787",
  },
};

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      security: { ...DEFAULT_SETTINGS.security, ...parsed.security },
      display: { ...DEFAULT_SETTINGS.display, ...parsed.display },
      network: { ...DEFAULT_SETTINGS.network, ...parsed.network },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Persistierte App-Einstellungen (Sicherheit/Anzeige/Netzwerk), analog zu den drei
 *  Einstellungs-Tabs aus dem Design. Wird sowohl in SettingsPage als auch in
 *  HostCard/RemoteView gelesen, um die dort beschriebenen Effekte umzusetzen. */
export function useAppSettings(): {
  settings: AppSettings;
  updateSecurity: (patch: Partial<AppSettings["security"]>) => void;
  updateDisplay: (patch: Partial<AppSettings["display"]>) => void;
  updateNetwork: (patch: Partial<AppSettings["network"]>) => void;
} {
  const [settings, setSettings] = useState<AppSettings>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSecurity = useCallback((patch: Partial<AppSettings["security"]>) => {
    setSettings((prev) => ({ ...prev, security: { ...prev.security, ...patch } }));
  }, []);
  const updateDisplay = useCallback((patch: Partial<AppSettings["display"]>) => {
    setSettings((prev) => ({ ...prev, display: { ...prev.display, ...patch } }));
  }, []);
  const updateNetwork = useCallback((patch: Partial<AppSettings["network"]>) => {
    setSettings((prev) => ({ ...prev, network: { ...prev.network, ...patch } }));
  }, []);

  return { settings, updateSecurity, updateDisplay, updateNetwork };
}
