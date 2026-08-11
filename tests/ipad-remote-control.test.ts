/**
 * Tests für den eigentlichen Anwendungsfall:
 * **Ein iPad steuert einen Mac-/Windows-Rechner fern.**
 *
 * Das iPad ist im Sinne des Protokolls ein ganz normaler *Controller*
 * (`src/mobile-client` verwendet unverändert die `ControllerSession` der
 * Desktop-App). Getestet wird deshalb die vollständige Kette:
 *
 *   iPad (ControllerSession)
 *     -> echter Signaling-Server (src/signaling-server/server.js)
 *       -> Host (HostSession)
 *         -> Eingabe-Simulation auf dem Host (Key-Mapping für nut-js)
 *
 * WebRTC wird durch `tests/helpers/fake-webrtc.ts` ersetzt — eine Attrappe,
 * die das SDP-Verhandlungsverhalten von echtem WebRTC nachbildet (im Browser
 * nachgemessen). Insbesondere öffnet sich ein DataChannel nur, wenn ihn der
 * **Offerer** vor `createOffer()` anlegt. Ohne diese Treue würden die Tests
 * den behobenen Fehler nicht bemerken.
 */
import { createRequire } from "node:module";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { RemoteInputEvent } from "@shared/types";
import { DATA_CHANNEL_LABEL } from "@shared/types";
import { HostSession } from "@renderer/lib/hostSession";
import { ControllerSession } from "@renderer/lib/controllerSession";
import { TouchInputController } from "@mobile/lib/touchInput";
import { buildCharEvents, buildKeyEvents, NO_MODIFIERS } from "@mobile/lib/keyboardInput";
import { FakeMediaStream, installFakeWebRtc } from "./helpers/fake-webrtc";
// Das Key-Mapping des Hosts wird direkt geprüft. `input-simulation.ts` selbst
// importiert Electron und nut-js (im Testprozess nicht verfügbar), daher liegt
// die reine Abbildungslogik in einem eigenen, importierbaren Modul.
import { resolveNutKeyName } from "../src/main/key-map";

const require_ = createRequire(import.meta.url);
const { startSignalingServer } = require_("../src/signaling-server/server.js") as {
  startSignalingServer: (o?: { port?: number; quiet?: boolean }) => Promise<{
    url: string;
    close: () => Promise<void>;
  }>;
};

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

/** Wartet, bis `check()` wahr wird — ohne feste Sleeps. */
async function waitUntil(check: () => boolean, label: string, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`Timeout (${timeoutMs}ms): ${label}`);
}

let idCounter = 0;
function freshHostId(): string {
  idCounter += 1;
  return `10000000${idCounter}`;
}

interface Pairing {
  host: HostSession;
  ipad: ControllerSession;
  /** Alle Eingabe-Events, die tatsächlich auf dem Host angekommen sind. */
  receivedInputs: RemoteInputEvent[];
  stop: () => void;
}

/**
 * Baut eine vollständige Sitzung auf: Host teilt seinen Bildschirm, das iPad
 * verbindet sich, beide Seiten sind verbunden.
 */
async function pairIpadWithHost(password = "geheim123"): Promise<Pairing> {
  const hostId = freshHostId();
  const receivedInputs: RemoteInputEvent[] = [];
  let hostConnected = false;
  let ipadConnected = false;
  const errors: string[] = [];

  const host = new HostSession(server.url, hostId, password, {
    onRemoteInput: (evt) => receivedInputs.push(evt),
    onPeerConnected: () => {
      hostConnected = true;
    },
    onError: (m) => errors.push(`host: ${m}`),
  });
  await host.start(new FakeMediaStream() as unknown as MediaStream);

  const ipad = new ControllerSession(server.url, hostId, password, {
    onConnected: () => {
      ipadConnected = true;
    },
    onRejected: (r) => errors.push(`ipad rejected: ${r}`),
    onError: (m) => errors.push(`ipad: ${m}`),
  });
  await ipad.connect();

  await waitUntil(
    () => (hostConnected && ipadConnected) || errors.length > 0,
    "Host und iPad verbunden",
  );
  expect(errors).toEqual([]);

  return {
    host,
    ipad,
    receivedInputs,
    stop: () => {
      ipad.disconnect();
      host.stop();
    },
  };
}

describe("iPad steuert einen Mac-/Windows-Host fern", () => {
  test("der Eingabe-Kanal wird tatsächlich geöffnet (Regression: DataChannel blieb 'connecting')", async () => {
    const pairing = await pairIpadWithHost();
    try {
      // Der Kanal muss auf der iPad-Seite wirklich offen sein — nur dann
      // verlassen Eingaben das Gerät überhaupt.
      await waitUntil(() => pairing.ipad.isInputChannelOpen(), "Eingabe-Kanal offen");
      expect(pairing.ipad.inputChannelLabel).toBe(DATA_CHANNEL_LABEL);
    } finally {
      pairing.stop();
    }
  });

  test("Tippen auf dem iPad löst einen Linksklick auf dem Host aus", async () => {
    const pairing = await pairIpadWithHost();
    try {
      await waitUntil(() => pairing.ipad.isInputChannelOpen(), "Eingabe-Kanal offen");

      // Gesten-Engine des Mobile-Clients: ein Tipp in die Mitte des Bildes.
      const touch = new TouchInputController(
        { onInput: (evt) => pairing.ipad.sendInput(evt) },
        { mode: "direct" },
      );
      touch.setContainer({ width: 1000, height: 750 });
      touch.setVideoAspect(4 / 3);
      touch.onTouchStart([{ id: 1, x: 500, y: 375 }]);
      touch.onTouchEnd([]);

      await waitUntil(
        () => pairing.receivedInputs.some((e) => e.type === "mouse-up"),
        "Klick auf dem Host angekommen",
      );

      const types = pairing.receivedInputs.map((e) => e.type);
      expect(types).toContain("mouse-move");
      expect(types).toContain("mouse-down");
      expect(types).toContain("mouse-up");

      const down = pairing.receivedInputs.find((e) => e.type === "mouse-down");
      expect(down).toMatchObject({ button: "left" });
      // Mitte des Bildes -> Mitte des entfernten Bildschirms.
      // Hinweis: "mouse-down" und "mouse-up" teilen sich eine Variante des
      // Union-Typs, daher wird hier auf beide zugleich eingegrenzt.
      const click = down as Extract<RemoteInputEvent, { type: "mouse-down" | "mouse-up" }>;
      expect(click.xNorm).toBeCloseTo(0.5, 2);
      expect(click.yNorm).toBeCloseTo(0.5, 2);
    } finally {
      pairing.stop();
    }
  });

  test("Tastatureingaben vom iPad kommen als Key-Events beim Host an", async () => {
    const pairing = await pairIpadWithHost();
    try {
      await waitUntil(() => pairing.ipad.isInputChannelOpen(), "Eingabe-Kanal offen");

      for (const evt of buildCharEvents("a", NO_MODIFIERS)) pairing.ipad.sendInput(evt);
      await waitUntil(
        () => pairing.receivedInputs.filter((e) => e.type === "key-up").length === 1,
        "Tastendruck auf dem Host angekommen",
      );

      expect(pairing.receivedInputs).toEqual([
        { type: "key-down", key: "a", code: "KeyA", ctrlKey: false, shiftKey: false, altKey: false, metaKey: false },
        { type: "key-up", key: "a", code: "KeyA", ctrlKey: false, shiftKey: false, altKey: false, metaKey: false },
      ]);
    } finally {
      pairing.stop();
    }
  });

  test("Zwei-Finger-Scrollen kommt als mouse-wheel beim Host an", async () => {
    const pairing = await pairIpadWithHost();
    try {
      await waitUntil(() => pairing.ipad.isInputChannelOpen(), "Eingabe-Kanal offen");

      const touch = new TouchInputController(
        { onInput: (evt) => pairing.ipad.sendInput(evt) },
        { scrollSpeed: 4, naturalScroll: false },
      );
      touch.setContainer({ width: 1000, height: 750 });
      touch.onTouchStart([
        { id: 1, x: 400, y: 300 },
        { id: 2, x: 500, y: 300 },
      ]);
      for (let y = 320; y <= 500; y += 20) {
        touch.onTouchMove([
          { id: 1, x: 400, y },
          { id: 2, x: 500, y },
        ]);
      }
      touch.onTouchEnd([]);

      await waitUntil(
        () => pairing.receivedInputs.some((e) => e.type === "mouse-wheel"),
        "Scroll-Event auf dem Host angekommen",
      );
      const wheel = pairing.receivedInputs.filter(
        (e): e is Extract<RemoteInputEvent, { type: "mouse-wheel" }> => e.type === "mouse-wheel",
      );
      expect(wheel.length).toBeGreaterThan(0);
      expect(wheel.every((w) => Number.isInteger(w.deltaX) && Number.isInteger(w.deltaY))).toBe(true);
    } finally {
      pairing.stop();
    }
  });

  test("falsches Passwort wird abgelehnt und es entsteht kein Eingabe-Kanal", async () => {
    const hostId = freshHostId();
    const host = new HostSession(server.url, hostId, "richtig", {});
    await host.start(new FakeMediaStream() as unknown as MediaStream);

    let rejectedWith: string | null = null;
    const ipad = new ControllerSession(server.url, hostId, "falsch", {
      onRejected: (reason) => {
        rejectedWith = reason;
      },
    });
    await ipad.connect();

    await waitUntil(() => rejectedWith !== null, "Ablehnung erhalten");
    expect(rejectedWith).toBe("wrong-password");
    expect(ipad.isInputChannelOpen()).toBe(false);

    ipad.disconnect();
    host.stop();
  });

  test("Eingaben vor dem Verbindungsaufbau werden verworfen statt zu werfen", async () => {
    const ipad = new ControllerSession(server.url, freshHostId(), "egal", {});
    expect(() => ipad.sendInput({ type: "mouse-move", xNorm: 0.5, yNorm: 0.5 })).not.toThrow();
    expect(ipad.isInputChannelOpen()).toBe(false);
  });
});

describe("Host-Tastenzuordnung (nut-js)", () => {
  test("Buchstaben werden korrekt zugeordnet", () => {
    expect(resolveNutKeyName("a", "KeyA")).toBe("A");
    expect(resolveNutKeyName("Z", "KeyZ")).toBe("Z");
  });

  test("Ziffern landen NICHT auf F-Tasten (Regression: '1' wurde zu F1)", () => {
    // nut-js kennt Key["1"] nicht als Ziffer, sondern liefert über den
    // umgekehrten Enum-Zugriff "F1" (Wert 1). Ohne explizite Zuordnung tippte
    // eine "1" vom iPad also F1 auf dem Host.
    expect(resolveNutKeyName("1", "Digit1")).toBe("Num1");
    expect(resolveNutKeyName("0", "Digit0")).toBe("Num0");
    expect(resolveNutKeyName("5", "Digit5")).toBe("Num5");
  });

  test("Satz- und Sonderzeichen werden zugeordnet", () => {
    expect(resolveNutKeyName(".", "Period")).toBe("Period");
    expect(resolveNutKeyName(",", "Comma")).toBe("Comma");
    expect(resolveNutKeyName("-", "Minus")).toBe("Minus");
    expect(resolveNutKeyName(" ", "Space")).toBe("Space");
  });

  test("Sondertasten der iPad-Tastenleiste sind vollständig abgedeckt", () => {
    const pairs: Array<[string, string]> = [
      ["Enter", "Enter"],
      ["Escape", "Escape"],
      ["Backspace", "Backspace"],
      ["Tab", "Tab"],
      ["Delete", "Delete"],
      ["ArrowUp", "ArrowUp"],
      ["ArrowDown", "ArrowDown"],
      ["ArrowLeft", "ArrowLeft"],
      ["ArrowRight", "ArrowRight"],
      ["Home", "Home"],
      ["End", "End"],
      ["PageUp", "PageUp"],
      ["PageDown", "PageDown"],
    ];
    for (const [key, code] of pairs) {
      expect(resolveNutKeyName(key, code), `Taste ${key}`).not.toBeNull();
    }
  });

  test("Cmd+C vom iPad ergibt gültige Tasten für den Host", () => {
    const events = buildKeyEvents("c", "KeyC", { ...NO_MODIFIERS, meta: true });
    for (const evt of events) {
      if (evt.type !== "key-down" && evt.type !== "key-up") continue;
      expect(resolveNutKeyName(evt.key, evt.code), `Taste ${evt.key}`).not.toBeNull();
    }
    // Rechte/linke Variante egal, Hauptsache eine echte Meta-Taste.
    expect(resolveNutKeyName("Meta", "MetaLeft")).toBe("LeftSuper");
  });
});
