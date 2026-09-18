/**
 * Feste Host-ID über App-Neustarts hinweg.
 *
 * Hintergrund (CR): Die Host-ID wird beim Start per `generateHostId()` neu
 * gewürfelt — die Gegenstelle musste nach jedem Neustart eine andere ID
 * eintippen. Ist die Einstellung "Feste ID behalten" aktiv, wird die ID
 * gespeichert und beim nächsten Start wiederverwendet.
 *
 * Bewusst frei von Electron-Importen und mit injiziertem Speicher (wie
 * stay-awake.ts / embedded-signaling.ts), damit die Logik ohne Electron
 * testbar ist. Fehler des Speichers sind nie fatal: Im Zweifel gilt eine
 * frisch erzeugte ID, die App startet trotzdem.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname } from "path";

/** Dauerhafter Ablageort der Host-ID (Datei, Registry, …). */
export interface HostIdentityStore {
  /** Gespeicherte ID oder null, wenn keine hinterlegt ist. */
  read(): string | null;
  write(hostId: string): void;
  /** Entfernt die gespeicherte ID (Einstellung ausgeschaltet). */
  clear(): void;
}

export interface HostIdentity {
  /** Für diesen App-Lauf gültige Host-ID. */
  readonly id: string;
  /** true = ID dauerhaft behalten, false = beim nächsten Start neu erzeugen. */
  setKeep(keep: boolean): void;
}

/** Dateibasierter Speicher; der Pfad liegt üblicherweise in `app.getPath("userData")`. */
export function createFileHostIdentityStore(path: string): HostIdentityStore {
  return {
    read(): string | null {
      try {
        const parsed = JSON.parse(readFileSync(path, "utf8")) as { hostId?: unknown };
        return typeof parsed.hostId === "string" ? parsed.hostId : null;
      } catch {
        // Datei fehlt oder ist unbrauchbar -> wie "nichts gespeichert".
        return null;
      }
    },
    write(hostId: string): void {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify({ hostId }), "utf8");
    },
    clear(): void {
      rmSync(path, { force: true });
    },
  };
}

/**
 * @param store Ablage der festen ID.
 * @param generateId Erzeugt eine neue ID (siehe id.ts `generateHostId`).
 */
export function createHostIdentity(store: HostIdentityStore, generateId: () => string): HostIdentity {
  let stored: string | null;
  try {
    stored = store.read();
  } catch {
    stored = null;
  }
  const id = stored !== null && stored.trim().length > 0 ? stored : generateId();

  return {
    id,
    setKeep(keep: boolean): void {
      try {
        if (keep) store.write(id);
        else store.clear();
      } catch (err) {
        console.error("[host-identity] Speichern/Löschen der festen ID fehlgeschlagen:", err);
      }
    },
  };
}
