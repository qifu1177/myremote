/**
 * Tests für die feste (über Neustarts hinweg gleichbleibende) Host-ID.
 *
 * Hintergrund (CR): Die Host-ID wurde bisher bei jedem App-Start neu erzeugt
 * (src/main/index.ts: `generateHostId()`), sodass Gegenstellen nach jedem
 * Neustart eine andere ID eintippen mussten. Über die neue Einstellung
 * "Feste ID behalten" wird die ID dauerhaft gespeichert.
 *
 * Getestet wird `src/main/host-identity.ts` gegen einen eingespeisten Speicher
 * (und zusätzlich gegen den echten Datei-Speicher in einem Temp-Ordner), weil
 * Electron im Testprozess nicht verfügbar ist.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  createFileHostIdentityStore,
  createHostIdentity,
  type HostIdentityStore,
} from "../src/main/host-identity";

/** Speicher im Arbeitsspeicher, der einen App-Neustart überdauert. */
function memoryStore(initial: string | null = null): HostIdentityStore & { value: string | null } {
  const store = {
    value: initial,
    read: () => store.value,
    write: (id: string) => {
      store.value = id;
    },
    clear: () => {
      store.value = null;
    },
  };
  return store;
}

/** Erzeugt bei jedem Aufruf eine andere ID — wie `generateHostId()`. */
function counterGenerator(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

const tempDirs: string[] = [];

function tempFile(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), "mydesk-id-"));
  tempDirs.push(dir);
  return join(dir, name);
}

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop() as string, { recursive: true, force: true });
});

describe("createHostIdentity", () => {
  test("ohne gespeicherte ID wird bei jedem Start eine neue erzeugt", () => {
    const store = memoryStore();
    const generate = counterGenerator();

    const first = createHostIdentity(store, generate).id;
    const second = createHostIdentity(store, generate).id;

    expect(first).toBe("id-1");
    expect(second).toBe("id-2");
    // Ohne aktivierte Einstellung darf nichts gespeichert werden.
    expect(store.value).toBeNull();
  });

  test("eingeschaltete Einstellung: nach dem Neustart gilt dieselbe ID", () => {
    const store = memoryStore();
    const generate = counterGenerator();

    const beforeRestart = createHostIdentity(store, generate);
    beforeRestart.setKeep(true);

    const afterRestart = createHostIdentity(store, generate);

    expect(afterRestart.id).toBe(beforeRestart.id);
  });

  test("erneutes Einschalten speichert dieselbe ID (idempotent)", () => {
    // Der Renderer setzt den Zustand bei jedem Start erneut durch.
    const store = memoryStore();
    const identity = createHostIdentity(store, counterGenerator());

    identity.setKeep(true);
    identity.setKeep(true);

    expect(store.value).toBe(identity.id);
  });

  test("ausgeschaltete Einstellung: gespeicherte ID wird verworfen", () => {
    const store = memoryStore("id-alt");
    const generate = counterGenerator();

    const identity = createHostIdentity(store, generate);
    expect(identity.id).toBe("id-alt");

    identity.setKeep(false);

    expect(store.value).toBeNull();
    expect(createHostIdentity(store, generate).id).toBe("id-1");
  });

  test("unbrauchbarer Speicherinhalt führt zu einer frischen ID statt zu einem Fehler", () => {
    const store = memoryStore("   ");

    expect(createHostIdentity(store, counterGenerator()).id).toBe("id-1");
  });

  test("defekter Speicher legt den Start nicht lahm", () => {
    const store: HostIdentityStore = {
      read: () => {
        throw new Error("Datei unlesbar");
      },
      write: () => {
        throw new Error("Datei nicht schreibbar");
      },
      clear: () => {
        throw new Error("Datei nicht löschbar");
      },
    };

    const identity = createHostIdentity(store, counterGenerator());

    expect(identity.id).toBe("id-1");
    expect(() => identity.setKeep(true)).not.toThrow();
    expect(() => identity.setKeep(false)).not.toThrow();
  });
});

describe("createFileHostIdentityStore", () => {
  test("ohne Datei ist nichts gespeichert", () => {
    const store = createFileHostIdentityStore(tempFile("host-identity.json"));

    expect(store.read()).toBeNull();
  });

  test("geschriebene ID wird wieder gelesen", () => {
    const path = tempFile("host-identity.json");

    createFileHostIdentityStore(path).write("482 913 607");

    expect(createFileHostIdentityStore(path).read()).toBe("482 913 607");
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ hostId: "482 913 607" });
  });

  test("clear() entfernt die gespeicherte ID", () => {
    const path = tempFile("host-identity.json");
    const store = createFileHostIdentityStore(path);

    store.write("482 913 607");
    store.clear();

    expect(store.read()).toBeNull();
  });

  test("kaputte Datei wird wie 'nichts gespeichert' behandelt", () => {
    const path = tempFile("host-identity.json");
    writeFileSync(path, "{kein json");

    expect(createFileHostIdentityStore(path).read()).toBeNull();
  });
});
