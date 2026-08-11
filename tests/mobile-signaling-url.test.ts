/**
 * Regressionstests für die Auflösung der Signaling-URL im Mobile-Client.
 *
 * Hintergrund des Bugs: Der Zugriff vom Handy/iPad auf den Mac schlug fehl,
 * weil eine im Browser gespeicherte, veraltete Signaling-URL Vorrang vor der
 * Adresse hatte, von der die Seite tatsächlich geladen wurde. Typische Fälle:
 *  - "localhost" (zeigt auf dem Mobilgerät auf das Gerät selbst),
 *  - eine alte LAN-IP nach DHCP-Wechsel oder Netzwechsel.
 * Selbst ein frisch gescannter QR-Code half dann nicht mehr.
 *
 * Getestet wird die reine Auflösungslogik aus `useMobileSettings.ts` —
 * ohne React, mit minimalen Stubs für `window.location` und `localStorage`.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_TOUCH_CONFIG } from "@mobile/lib/touchInput";

const SETTINGS_KEY = "mydesk-mobile:settings";

/** Minimaler localStorage-Ersatz (die Node-Umgebung hat keinen). */
function createLocalStorage(): Storage {
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

/** Setzt die Seiten-Herkunft, von der der Mobile-Client geladen wurde. */
function setPageOrigin(href: string): void {
  const url = new URL(href);
  (globalThis as { window?: unknown }).window = {
    location: { protocol: url.protocol, hostname: url.hostname, port: url.port },
  };
}

/**
 * Lädt das Modul frisch, damit die pro Test gesetzten globalen Stubs
 * (`window`, `localStorage`) wirken und kein Modulzustand übrig bleibt.
 */
async function importFresh(): Promise<typeof import("@mobile/hooks/useMobileSettings")> {
  vi.resetModules();
  return import("@mobile/hooks/useMobileSettings");
}

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = createLocalStorage();
});

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
  delete (globalThis as { window?: unknown }).window;
});

describe("defaultSignalingUrl: Ableitung aus der Seiten-Herkunft", () => {
  test("HTTP-Auslieferung durch den Signaling-Server => gleicher Host und Port", async () => {
    setPageOrigin("http://192.168.1.50:8787/?id=100200300");
    const { defaultSignalingUrl } = await importFresh();
    expect(defaultSignalingUrl()).toBe("ws://192.168.1.50:8787");
  });

  test("HTTPS => wss (verschlüsselte Seite darf kein unverschlüsseltes ws nutzen)", async () => {
    setPageOrigin("https://remote.example.com/");
    const { defaultSignalingUrl } = await importFresh();
    expect(defaultSignalingUrl()).toBe("wss://remote.example.com");
  });

  test("Vite-Dev-Server (5180): Signaling läuft separat auf 8787", async () => {
    setPageOrigin("http://192.168.1.50:5180/");
    const { defaultSignalingUrl } = await importFresh();
    expect(defaultSignalingUrl()).toBe("ws://192.168.1.50:8787");
  });
});

describe("loadSettings: veraltete gespeicherte Signaling-URL (Bug-Regression)", () => {
  test('gespeichertes "localhost" wird auf dem Mobilgerät verworfen', async () => {
    // Genau der reproduzierte Fehlerfall: Die Seite kam von der LAN-Adresse,
    // gespeichert war aber localhost -> Verbindung war unmöglich.
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ signalingUrl: "ws://localhost:8787" }));
    setPageOrigin("http://192.168.1.50:8787/");

    const { loadSettings } = await importFresh();
    expect(loadSettings().signalingUrl).toBe("ws://192.168.1.50:8787");
  });

  test("alte LAN-IP (Netz-/DHCP-Wechsel) wird durch die aktuelle Adresse ersetzt", async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ signalingUrl: "ws://192.168.0.99:8787" }));
    setPageOrigin("http://192.168.1.50:8787/");

    const { loadSettings } = await importFresh();
    expect(loadSettings().signalingUrl).toBe("ws://192.168.1.50:8787");
  });

  test("URL desselben Hosts mit abweichendem Port bleibt erhalten (bewusst gesetzt)", async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ signalingUrl: "ws://192.168.1.50:9999" }));
    setPageOrigin("http://192.168.1.50:8787/");

    const { loadSettings } = await importFresh();
    expect(loadSettings().signalingUrl).toBe("ws://192.168.1.50:9999");
  });

  test("unlesbare gespeicherte URL fällt auf die Seiten-Herkunft zurück", async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ signalingUrl: "nicht-eine-url" }));
    setPageOrigin("http://192.168.1.50:8787/");

    const { loadSettings } = await importFresh();
    expect(loadSettings().signalingUrl).toBe("ws://192.168.1.50:8787");
  });

  test("Touch-Einstellungen bleiben trotz verworfener URL erhalten", async () => {
    const scrollSpeed = DEFAULT_TOUCH_CONFIG.scrollSpeed + 3;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ signalingUrl: "ws://localhost:8787", scrollSpeed }));
    setPageOrigin("http://192.168.1.50:8787/");

    const { loadSettings } = await importFresh();
    const settings = loadSettings();
    expect(settings.signalingUrl).toBe("ws://192.168.1.50:8787");
    expect(settings.scrollSpeed).toBe(scrollSpeed);
  });

  test("ohne gespeicherte Einstellungen gelten Seiten-Herkunft und Touch-Defaults", async () => {
    setPageOrigin("http://192.168.1.50:8787/");

    const { loadSettings } = await importFresh();
    expect(loadSettings()).toEqual({ ...DEFAULT_TOUCH_CONFIG, signalingUrl: "ws://192.168.1.50:8787" });
  });
});
