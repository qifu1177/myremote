/**
 * Maus-Bedienung für den Client im **Desktop-Browser** (Mac/Windows/Linux).
 *
 * Der Mobile-Client wurde ursprünglich nur für Touch-Geräte gebaut. Ruft man
 * ihn in einem normalen Browser am Rechner auf, gibt es keine Touch-Events —
 * die Fernsteuerung blieb dort ohne Wirkung. Dieses Modul übersetzt echte
 * Maus-Ereignisse in dieselben `RemoteInputEvent`s (`src/shared/types.ts`),
 * die auch die Gesten-Engine erzeugt; Protokoll und Host bleiben unverändert.
 *
 * Anders als auf dem Touchgerät gibt es hier keinen virtuellen Cursor: Die
 * echte Mausposition wird direkt (absolut) auf den entfernten Bildschirm
 * abgebildet — inklusive Rücknahme von Zoom/Pan und Letterboxing.
 */
import type { RemoteInputEvent } from "@shared/types";
import { pointToNorm, type Size, type Viewport } from "./viewport";

/** Punkt in Container-Koordinaten (CSS-Pixel, Ursprung oben links). */
export interface MousePoint {
  x: number;
  y: number;
}

/** Die für uns relevanten Felder eines `WheelEvent`. */
export interface WheelDelta {
  deltaX: number;
  deltaY: number;
  /** 0 = Pixel, 1 = Zeilen, 2 = Seiten (wie im DOM). */
  deltaMode: number;
}

export interface MouseInputCallbacks {
  onInput: (evt: RemoteInputEvent) => void;
}

/** Pixel pro Rasterstufe eines klassischen Mausrads (Chrome/Safari). */
const PIXELS_PER_TICK = 100;
/** Zeilen pro Seite, für deltaMode = 2. */
const LINES_PER_PAGE = 24;

/**
 * `MouseEvent.button` -> Tastenname des Protokolls.
 * Zurück/Vorwärts (3/4) kennt das Protokoll nicht und wird verworfen.
 */
export function mouseButtonFromEvent(button: number): "left" | "right" | "middle" | null {
  switch (button) {
    case 0:
      return "left";
    case 1:
      return "middle";
    case 2:
      return "right";
    default:
      return null;
  }
}

/**
 * Übersetzt Maus-Ereignisse des Browsers in Eingabe-Events für den Host.
 *
 * Bewusst frei von DOM-Typen (nur einfache Punkte/Zahlen), damit die Logik
 * isoliert testbar bleibt — genau wie die Touch-Engine.
 */
export class MouseInputController {
  private container: Size = { width: 0, height: 0 };
  private videoAspect = 16 / 9;
  private viewport: Viewport = { scale: 1, offsetX: 0, offsetY: 0 };
  /** Nicht verbrauchte Bruchteile einer Rasterstufe. */
  private scrollRemainder = { x: 0, y: 0 };
  /** Tasten, die im Bild gedrückt wurden und noch nicht losgelassen sind. */
  private pressed = new Set<string>();

  constructor(private readonly callbacks: MouseInputCallbacks) {}

  setContainer(size: Size): void {
    this.container = size;
  }

  setVideoAspect(aspect: number): void {
    if (aspect > 0 && Number.isFinite(aspect)) this.videoAspect = aspect;
  }

  setViewport(viewport: Viewport): void {
    this.viewport = viewport;
  }

  onMove(point: MousePoint): void {
    this.callbacks.onInput({ type: "mouse-move", ...this.toNorm(point) });
  }

  onDown(point: MousePoint, button: number): void {
    const name = mouseButtonFromEvent(button);
    if (!name) return;
    const norm = this.toNorm(point);
    this.pressed.add(name);
    // Erst positionieren, dann drücken: Sonst klickt der Host an der zuletzt
    // gemeldeten Stelle (z.B. wenn der Klick ohne vorherige Bewegung kommt).
    this.callbacks.onInput({ type: "mouse-move", ...norm });
    this.callbacks.onInput({ type: "mouse-down", button: name, ...norm });
  }

  onUp(point: MousePoint, button: number): void {
    const name = mouseButtonFromEvent(button);
    if (!name) return;
    // `mouseup` wird am Fenster abgefangen, damit eine außerhalb des Bildes
    // losgelassene Taste nicht gedrückt hängen bleibt. Ein Loslassen ohne
    // vorheriges Drücken im Bild (z.B. Klick ins Chat-Fenster) gehört dem Host
    // aber nicht — sonst käme dort ein Geister-Klick an.
    if (!this.pressed.delete(name)) return;
    this.callbacks.onInput({ type: "mouse-up", button: name, ...this.toNorm(point) });
  }

  onWheel(delta: WheelDelta): void {
    const factor =
      delta.deltaMode === 1 ? 1 : delta.deltaMode === 2 ? LINES_PER_PAGE : 1 / PIXELS_PER_TICK;
    this.scrollRemainder.x += delta.deltaX * factor;
    this.scrollRemainder.y += delta.deltaY * factor;

    // Der Host erwartet ganzzahlige Ticks; Reste sammeln wir, damit auch das
    // feine Scrollen eines Trackpads nicht komplett verloren geht.
    const stepX = Math.trunc(this.scrollRemainder.x);
    const stepY = Math.trunc(this.scrollRemainder.y);
    if (stepX === 0 && stepY === 0) return;
    this.scrollRemainder.x -= stepX;
    this.scrollRemainder.y -= stepY;
    this.callbacks.onInput({ type: "mouse-wheel", deltaX: stepX, deltaY: stepY });
  }

  private toNorm(point: MousePoint): { xNorm: number; yNorm: number } {
    return pointToNorm(point, this.container, this.videoAspect, this.viewport);
  }
}
