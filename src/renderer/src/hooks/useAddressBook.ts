import { useCallback, useEffect, useState } from "react";

export interface AddressBookEntry {
  id: string;
  /** Ziel-Host-ID (z.B. "193 205 884") */
  hostId: string;
  name: string;
}

const STORAGE_KEY = "myremote:addressBook";

function migrate(raw: unknown): AddressBookEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is Partial<AddressBookEntry> & { id: string } => !!e && typeof e.id === "string")
    .map((e) => ({
      id: e.id,
      hostId: typeof e.hostId === "string" ? e.hostId : "",
      name: typeof e.name === "string" && e.name.length > 0 ? e.name : e.hostId ?? "",
    }))
    .filter((e) => e.hostId.length > 0);
}

function load(): AddressBookEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? migrate(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/**
 * Persistiertes lokales Adressbuch (analog zur "Adressbuch"-Ansicht im
 * Design: dauerhaft gespeicherte Kontakte, unabhängig vom Verlauf der
 * zuletzt genutzten Verbindungen in useRecentConnections).
 */
export function useAddressBook(): {
  entries: AddressBookEntry[];
  addEntry: (name: string, hostId: string) => void;
  renameEntry: (id: string, name: string) => void;
  removeEntry: (id: string) => void;
} {
  const [entries, setEntries] = useState<AddressBookEntry[]>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  const addEntry = useCallback((name: string, hostId: string) => {
    const trimmedId = hostId.trim();
    const trimmedName = name.trim();
    if (!trimmedId) return;
    setEntries((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, hostId: trimmedId, name: trimmedName || trimmedId },
    ]);
  }, []);

  const renameEntry = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, name: trimmed } : e)));
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return { entries, addEntry, renameEntry, removeEntry };
}
