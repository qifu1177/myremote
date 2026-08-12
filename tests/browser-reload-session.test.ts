/**
 * Regressionstests für das Neuladen der App im Browser.
 *
 * Bug: Partner-ID und Passwort lagen ausschließlich im React-State von
 * `App.tsx`. Ein Reload (F5, Tab-Wiederherstellung durch iOS Safari) verwarf
 * sie — der Nutzer landete wieder auf dem Verbindungsformular und die
 * laufende Verbindung war weg.
 *
 * Getestet wird die reine Persistenzschicht (`lib/session.ts`) sowie — gegen
 * den ECHTEN Signaling-Server — dass ein Wiederverbinden mit denselben
 * Zugangsdaten nach einem simulierten Reload tatsächlich gelingt.
 */
import { createRequire } from "node:module";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { HostSession } from "@renderer/lib/hostSession";
import { ControllerSession } from "@renderer/lib/controllerSession";
import { FakeMediaStream, installFakeWebRtc } from "./helpers/fake-webrtc";

const require_ = createRequire(import.meta.url);
const { startSignalingServer } = require_("../src/signaling-server/server.js") as {
  startSignalingServer: (o?: { port?: number; quiet?: boolean }) => Promise<{
    url: string;
    close: () => Promise<void>;
  }>;
};

const SESSION_KEY = "mydesk-mobile:session";

/** Minimaler sessionStorage-Ersatz (die Node-Umgebung hat keinen). */
function createSessionStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  } as Storage;
}

/** Lädt das Modul frisch, damit die pro Test gesetzten Stubs greifen. */
async function importFresh(): Promise<typeof import("@mobile/lib/session")> {
  vi.resetModules();
  return import("@mobile/lib/session");
}

describe("Sicherung der laufenden Sitzung (lib/session.ts)", () => {
  beforeEach(() => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage = createSessionStorage();
  });

  afterEach(() => {
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
  });

  test("ohne gesicherte Sitzung gibt es nichts wiederherzustellen", async () => {
    const { loadStoredSession } = await importFresh();
    expect(loadStoredSession()).toBeNull();
  });

  test("gesicherte Sitzung übersteht das Neuladen (Kern des Bugs)", async () => {
    const { storeSession, loadStoredSession } = await importFresh();
    storeSession({ hostId: "555666777", password: "reloadpw" });

    // Reload = neuer Modulzustand, aber derselbe sessionStorage.
    const { loadStoredSession: loadAfterReload } = await importFresh();
    expect(loadAfterReload()).toEqual({ hostId: "555666777", password: "reloadpw" });
    expect(loadStoredSession()).toEqual({ hostId: "555666777", password: "reloadpw" });
  });

  test("bewusstes Trennen verwirft die Sitzung — Reload verbindet nicht erneut", async () => {
    const { storeSession, clearStoredSession } = await importFresh();
    storeSession({ hostId: "555666777", password: "reloadpw" });
    clearStoredSession();

    const { loadStoredSession } = await importFresh();
    expect(loadStoredSession()).toBeNull();
  });

  test("unvollständige oder unlesbare Daten führen nicht zu einer halben Sitzung", async () => {
    const { loadStoredSession } = await importFresh();

    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ hostId: "555666777" }));
    expect(loadStoredSession()).toBeNull();

    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ hostId: "", password: "" }));
    expect(loadStoredSession()).toBeNull();

    sessionStorage.setItem(SESSION_KEY, "kein-json");
    expect(loadStoredSession()).toBeNull();
  });

  test("fehlender sessionStorage (privater Modus) wirft nicht", async () => {
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
    const { loadStoredSession, storeSession, clearStoredSession } = await importFresh();

    expect(() => storeSession({ hostId: "1", password: "2" })).not.toThrow();
    expect(() => clearStoredSession()).not.toThrow();
    expect(loadStoredSession()).toBeNull();
  });
});

describe("Wiederverbinden nach einem Reload (gegen echten Signaling-Server)", () => {
  let server: { url: string; close: () => Promise<void> };
  let restoreWebRtc: () => void;

  beforeAll(async () => {
    server = await startSignalingServer({ port: 0, quiet: true });
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    restoreWebRtc = installFakeWebRtc();
  });

  afterEach(() => {
    restoreWebRtc();
  });

  async function waitUntil(check: () => boolean, label: string, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (check()) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`Timeout (${timeoutMs}ms): ${label}`);
  }

  test("mit den gesicherten Zugangsdaten gelingt eine neue Sitzung beim selben Host", async () => {
    const hostId = "300000001";
    const password = "reloadpw";
    const host = new HostSession(server.url, hostId, password, {});
    await host.start(new FakeMediaStream() as unknown as MediaStream);

    // Erste Sitzung wie vor dem Reload.
    let connected = false;
    const first = new ControllerSession(server.url, hostId, password, {
      onConnected: () => {
        connected = true;
      },
    });
    await first.connect();
    await waitUntil(() => connected, "erste Sitzung verbunden");

    // Reload: Der alte Tab-Kontext verschwindet, die Zugangsdaten kommen aus
    // dem sessionStorage und werden sofort erneut verwendet.
    first.disconnect();
    await waitUntil(() => host.chatPeerCount === 0, "alte Session abgemeldet");

    let reconnected = false;
    const rejections: string[] = [];
    const second = new ControllerSession(server.url, hostId, password, {
      onConnected: () => {
        reconnected = true;
      },
      onRejected: (r) => rejections.push(r),
    });
    await second.connect();

    try {
      await waitUntil(() => reconnected, "nach dem Reload wieder verbunden");
      expect(rejections).toEqual([]);
      expect(host.chatPeerCount).toBe(1);
    } finally {
      second.disconnect();
      host.stop();
    }
  });
});
