/**
 * Tests für die Schlafsperre des Hosts.
 *
 * Hintergrund (Bug): Steuerte man den Mac längere Zeit nicht, endete die
 * Verbindung von selbst — der Rechner schlief ein, weil macOS die Leerlaufzeit
 * nur über PHYSISCHE Eingaben zählt (siehe src/main/stay-awake.ts).
 *
 * Getestet wird gegen eine nachgebaute `powerSaveBlocker`-API, weil Electron im
 * Testprozess nicht verfügbar ist — deshalb ist die Blocker-API injiziert.
 */
import { describe, expect, test } from "vitest";
import { createStayAwake, type PowerSaveBlockerLike } from "../src/main/stay-awake";

/** Zählt Starts/Stops wie Electrons `powerSaveBlocker`, inkl. vergebener IDs. */
function fakeBlocker(): PowerSaveBlockerLike & { started: string[]; stopped: number[] } {
  const running = new Set<number>();
  const started: string[] = [];
  const stopped: number[] = [];
  let nextId = 0;
  return {
    started,
    stopped,
    start(type) {
      started.push(type);
      const id = nextId++;
      running.add(id);
      return id;
    },
    stop(id) {
      stopped.push(id);
      running.delete(id);
    },
    isStarted: (id) => running.has(id),
  };
}

describe("createStayAwake", () => {
  test("hält den Bildschirm wach, sobald freigegeben wird", () => {
    const blocker = fakeBlocker();
    const stayAwake = createStayAwake(blocker);

    stayAwake.set(true);

    // "prevent-app-suspension" würde zwar das System wachhalten, aber den
    // Bildschirm abschalten lassen — dann liefert macOS keine echten Frames
    // mehr und der Controller sähe nur ein schwarzes Bild.
    expect(blocker.started).toEqual(["prevent-display-sleep"]);
    expect(stayAwake.active).toBe(true);
  });

  test("gibt die Sperre beim Beenden der Freigabe wieder frei", () => {
    const blocker = fakeBlocker();
    const stayAwake = createStayAwake(blocker);

    stayAwake.set(true);
    stayAwake.set(false);

    expect(blocker.stopped).toEqual([0]);
    expect(stayAwake.active).toBe(false);
  });

  test("doppeltes Aktivieren erzeugt keine zweite Sperre", () => {
    // React-StrictMode mountet den Effekt in der Entwicklung doppelt. Ohne
    // Idempotenz bliebe die erste Sperre-ID unerreichbar zurück und der Mac
    // würde auch nach "Freigabe beenden" nie wieder einschlafen.
    const blocker = fakeBlocker();
    const stayAwake = createStayAwake(blocker);

    stayAwake.set(true);
    stayAwake.set(true);
    stayAwake.set(false);

    expect(blocker.started).toEqual(["prevent-display-sleep"]);
    expect(blocker.stopped).toEqual([0]);
    expect(stayAwake.active).toBe(false);
  });

  test("Deaktivieren ohne aktive Sperre tut nichts", () => {
    const blocker = fakeBlocker();
    const stayAwake = createStayAwake(blocker);

    stayAwake.set(false);

    expect(blocker.started).toEqual([]);
    expect(blocker.stopped).toEqual([]);
  });

  test("nach dem Freigeben lässt sich die Sperre erneut setzen", () => {
    const blocker = fakeBlocker();
    const stayAwake = createStayAwake(blocker);

    stayAwake.set(true);
    stayAwake.set(false);
    stayAwake.set(true);

    expect(blocker.started).toEqual(["prevent-display-sleep", "prevent-display-sleep"]);
    expect(stayAwake.active).toBe(true);
  });
});
