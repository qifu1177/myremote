import { useCallback, useEffect, useState } from "react";

export interface RecentConnection {
  id: string;
  name: string;
  lastConnectedAt: number;
  /** Ob der Eintrag vom Nutzer als Favorit markiert wurde. Bei Alt-Daten ohne
   *  dieses Feld wird beim Laden `false` angenommen (siehe migrate()). */
  favorite: boolean;
}

const STORAGE_KEY = "myremote:recentConnections";

/** Wandelt evtl. ältere gespeicherte Einträge (ohne `favorite`-Feld) in das
 *  aktuelle Format um, ohne bestehende Daten zu verlieren. */
function migrate(raw: unknown): RecentConnection[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Partial<RecentConnection> & { id: string } => !!r && typeof r.id === "string")
    .map((r) => ({
      id: r.id,
      name: typeof r.name === "string" && r.name.length > 0 ? r.name : r.id,
      lastConnectedAt: typeof r.lastConnectedAt === "number" ? r.lastConnectedAt : Date.now(),
      favorite: r.favorite === true,
    }));
}

function load(): RecentConnection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? migrate(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function useRecentConnections(): {
  recents: RecentConnection[];
  addRecent: (id: string) => void;
  toggleFavorite: (id: string) => void;
  renameRecent: (id: string, name: string) => void;
  removeRecent: (id: string) => void;
} {
  const [recents, setRecents] = useState<RecentConnection[]>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recents));
  }, [recents]);

  const addRecent = useCallback((id: string) => {
    setRecents((prev) => {
      const existing = prev.find((r) => r.id === id);
      const withoutDup = prev.filter((r) => r.id !== id);
      const next: RecentConnection[] = [
        {
          id,
          name: existing?.name ?? id,
          lastConnectedAt: Date.now(),
          favorite: existing?.favorite ?? false,
        },
        ...withoutDup,
      ];
      // Favoriten sollen nicht durch das Auto-Trimmen der letzten Verbindungen
      // verloren gehen: nur unter den nicht-favorisierten Einträgen kürzen.
      const favorites = next.filter((r) => r.favorite);
      const others = next.filter((r) => !r.favorite).slice(0, 8);
      return [...favorites, ...others].sort((a, b) => b.lastConnectedAt - a.lastConnectedAt);
    });
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setRecents((prev) => prev.map((r) => (r.id === id ? { ...r, favorite: !r.favorite } : r)));
  }, []);

  const renameRecent = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setRecents((prev) => prev.map((r) => (r.id === id ? { ...r, name: trimmed } : r)));
  }, []);

  const removeRecent = useCallback((id: string) => {
    setRecents((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return { recents, addRecent, toggleFavorite, renameRecent, removeRecent };
}

/** Formatiert einen Zeitstempel relativ zu jetzt, übersetzt über die aktuell aktive Sprache. */
export function formatRelativeTime(
  ts: number,
  labels: { justNow: string; minutesAgo: (n: number) => string; hoursAgo: (n: number) => string; daysAgo: (n: number) => string },
): string {
  const diffMs = Date.now() - ts;
  const min = Math.round(diffMs / 60000);
  if (min < 1) return labels.justNow;
  if (min < 60) return labels.minutesAgo(min);
  const h = Math.round(min / 60);
  if (h < 24) return labels.hoursAgo(h);
  const d = Math.round(h / 24);
  return labels.daysAgo(d);
}
