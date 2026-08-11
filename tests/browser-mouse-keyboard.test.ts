import { beforeEach, describe, expect, it } from "vitest";
import type { RemoteInputEvent } from "@shared/types";
import { MouseInputController, mouseButtonFromEvent } from "@mobile/lib/mouseInput";
import { keyEventFromBrowser } from "@mobile/lib/keyboardInput";

/**
 * Fernsteuerung aus einem **Desktop-Browser** (Mac/Windows) heraus.
 *
 * Der Mobile-Client war ursprünglich rein für Touch gebaut: `RemoteScreen`
 * registrierte ausschließlich `touchstart/move/end`-Listener und die Tastatur
 * lief über ein verstecktes Eingabefeld für die Bildschirmtastatur. In einem
 * normalen Browser am Rechner gibt es aber weder Touch-Events noch eine
 * Bildschirmtastatur — Maus und physische Tastatur blieben deshalb wirkungslos.
 *
 * Diese Tests sichern die Übersetzung echter Maus-/Tastatur-Ereignisse in die
 * bestehenden `RemoteInputEvent`s ab (Protokoll und Host bleiben unverändert).
 */

/** Sammelt die erzeugten Events einer Controller-Instanz. */
function setup(): { ctrl: MouseInputController; events: RemoteInputEvent[] } {
  const events: RemoteInputEvent[] = [];
  const ctrl = new MouseInputController({ onInput: (e) => events.push(e) });
  // 1000x500-Container, Video 2:1 -> exakt formatfüllend, kein Letterboxing.
  ctrl.setContainer({ width: 1000, height: 500 });
  ctrl.setVideoAspect(2);
  return { ctrl, events };
}

describe("Maus-Bedienung im Browser", () => {
  let ctrl: MouseInputController;
  let events: RemoteInputEvent[];

  beforeEach(() => {
    ({ ctrl, events } = setup());
  });

  it("bildet die Tastennummern des Browsers auf die Protokoll-Namen ab", () => {
    expect(mouseButtonFromEvent(0)).toBe("left");
    expect(mouseButtonFromEvent(1)).toBe("middle");
    expect(mouseButtonFromEvent(2)).toBe("right");
    // Zurück/Vorwärts-Tasten kennt das Protokoll nicht.
    expect(mouseButtonFromEvent(3)).toBeNull();
    expect(mouseButtonFromEvent(4)).toBeNull();
  });

  it("überträgt eine Mausbewegung als absolute, normierte Position", () => {
    ctrl.onMove({ x: 250, y: 125 });
    expect(events).toEqual([{ type: "mouse-move", xNorm: 0.25, yNorm: 0.25 }]);
  });

  it("setzt den Zeiger vor dem Klick auf die Klickposition", () => {
    // Ohne vorheriges mouse-move würde der Host an der alten Position klicken.
    ctrl.onDown({ x: 500, y: 250 }, 0);
    expect(events).toEqual([
      { type: "mouse-move", xNorm: 0.5, yNorm: 0.5 },
      { type: "mouse-down", button: "left", xNorm: 0.5, yNorm: 0.5 },
    ]);
  });

  it("überträgt das Loslassen inklusive Taste", () => {
    ctrl.onUp({ x: 500, y: 250 }, 2);
    expect(events.at(-1)).toEqual({
      type: "mouse-up",
      button: "right",
      xNorm: 0.5,
      yNorm: 0.5,
    });
  });

  it("ignoriert Tasten, die das Protokoll nicht kennt", () => {
    ctrl.onDown({ x: 500, y: 250 }, 3);
    ctrl.onUp({ x: 500, y: 250 }, 3);
    expect(events).toEqual([]);
  });

  it("begrenzt Positionen außerhalb des Bildes auf 0..1", () => {
    ctrl.onMove({ x: -80, y: 900 });
    expect(events).toEqual([{ type: "mouse-move", xNorm: 0, yNorm: 1 }]);
  });

  it("rechnet die schwarzen Balken (Letterboxing) heraus", () => {
    // Video 1:1 in einem 1000x500-Container -> 500px breit, links/rechts je 250px Rand.
    ctrl.setVideoAspect(1);
    ctrl.onMove({ x: 250, y: 0 });
    expect(events).toEqual([{ type: "mouse-move", xNorm: 0, yNorm: 0 }]);
  });

  describe("Mausrad", () => {
    it("wandelt Pixel-Deltas in ganzzahlige Scroll-Ticks um", () => {
      // Eine Rasterstufe entspricht in Chrome/Safari ca. 100 Pixeln.
      ctrl.onWheel({ deltaX: 0, deltaY: 100, deltaMode: 0 });
      expect(events).toEqual([{ type: "mouse-wheel", deltaX: 0, deltaY: 1 }]);
    });

    it("sammelt Restbeträge, damit langsames Scrollen nicht verloren geht", () => {
      // Trackpads liefern viele winzige Deltas; einzeln gerundet wären sie 0.
      for (let i = 0; i < 4; i += 1) ctrl.onWheel({ deltaX: 0, deltaY: 30, deltaMode: 0 });
      expect(events).toEqual([{ type: "mouse-wheel", deltaX: 0, deltaY: 1 }]);
    });

    it("behält die Scrollrichtung bei", () => {
      ctrl.onWheel({ deltaX: -100, deltaY: -100, deltaMode: 0 });
      expect(events).toEqual([{ type: "mouse-wheel", deltaX: -1, deltaY: -1 }]);
    });

    it("versteht zeilenweises Scrollen (Firefox, deltaMode=1)", () => {
      ctrl.onWheel({ deltaX: 0, deltaY: 3, deltaMode: 1 });
      expect(events).toEqual([{ type: "mouse-wheel", deltaX: 0, deltaY: 3 }]);
    });
  });
});

describe("Physische Tastatur im Browser", () => {
  it("übersetzt ein keydown-Ereignis samt Modifiern", () => {
    expect(
      keyEventFromBrowser("key-down", {
        key: "a",
        code: "KeyA",
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
      }),
    ).toEqual({
      type: "key-down",
      key: "a",
      code: "KeyA",
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    });
  });

  it("überträgt gedrückte Modifier-Tasten unverändert (z.B. Cmd+C)", () => {
    expect(
      keyEventFromBrowser("key-up", {
        key: "c",
        code: "KeyC",
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: true,
      }),
    ).toEqual({
      type: "key-up",
      key: "c",
      code: "KeyC",
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: true,
    });
  });

  it("meldet die Modifier-Taste selbst ebenfalls als Tastendruck", () => {
    // Nur so hält der Host den Modifier für nachfolgende Tasten gedrückt.
    const evt = keyEventFromBrowser("key-down", {
      key: "Shift",
      code: "ShiftLeft",
      ctrlKey: false,
      shiftKey: true,
      altKey: false,
      metaKey: false,
    });
    expect(evt).toMatchObject({ type: "key-down", key: "Shift", code: "ShiftLeft", shiftKey: true });
  });

  it("füllt einen fehlenden code aus dem key auf", () => {
    // Manche Browser/Layouts liefern bei Sondertasten keinen code.
    const evt = keyEventFromBrowser("key-down", {
      key: "Enter",
      code: "",
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    });
    expect(evt).toMatchObject({ key: "Enter", code: "Enter" });
  });
});
