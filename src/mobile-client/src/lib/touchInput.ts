/**
 * Gesten-Engine für die Touch-Fernsteuerung (iPad / iPhone / Android-Phone).
 *
 * Sie übersetzt Finger-Gesten in die bereits existierenden
 * `RemoteInputEvent`s (`src/shared/types.ts`) — das Protokoll und der Host
 * bleiben dadurch unverändert (Open-Closed-Prinzip).
 *
 * Unterstützte Gesten
 * --------------------
 *  1 Finger tippen              -> Linksklick
 *  1 Finger doppelt tippen      -> Doppelklick
 *  1 Finger ziehen              -> Mauszeiger bewegen
 *                                  (Trackpad-Modus: relativ, Direkt-Modus: absolut)
 *  1 Finger lang drücken+ziehen -> Ziehen mit gedrückter linker Maustaste
 *  2 Finger tippen              -> Rechtsklick
 *  2 Finger ziehen              -> Scrollen
 *  2 Finger auf-/zuziehen       -> Lokal zoomen (Pinch, keine Übertragung)
 *
 * Die Engine ist bewusst frei von React/DOM-Typen: sie bekommt nur einfache
 * Punktlisten übergeben und ist damit isoliert testbar.
 */
import type { RemoteInputEvent } from "@shared/types";
import {
  clampViewport,
  pointToNorm,
  type Size,
  type Viewport,
  clamp,
  MAX_SCALE,
  MIN_SCALE,
} from "./viewport";

/** Ein Berührungspunkt in Container-Koordinaten (CSS-Pixel). */
export interface TouchPoint {
  id: number;
  x: number;
  y: number;
}

/** Zeigermodus: relativ wie ein Trackpad oder absolut per Antippen. */
export type PointerMode = "trackpad" | "direct";

export interface TouchInputConfig {
  /** Zeigermodus, zur Laufzeit umschaltbar. */
  mode: PointerMode;
  /** Empfindlichkeit im Trackpad-Modus (1 = 1:1 zur Fingerbewegung). */
  sensitivity: number;
  /** Scroll-Faktor für Zwei-Finger-Scrollen. */
  scrollSpeed: number;
  /** Scrollrichtung umkehren ("natürliches" Scrollen). */
  naturalScroll: boolean;
}

export const DEFAULT_TOUCH_CONFIG: TouchInputConfig = {
  mode: "trackpad",
  sensitivity: 1.6,
  scrollSpeed: 1,
  naturalScroll: true,
};

export interface TouchInputCallbacks {
  /** Ein fertiges Eingabe-Event für den Host. */
  onInput: (evt: RemoteInputEvent) => void;
  /** Lokale Zoom-/Pan-Änderung (wird nicht an den Host gesendet). */
  onViewportChange?: (viewport: Viewport) => void;
  /** Neue Position des virtuellen Cursors (normiert 0..1). */
  onCursorChange?: (cursor: { xNorm: number; yNorm: number }) => void;
  /** Ein Zustandswechsel, den die UI anzeigen kann (z.B. "Ziehen aktiv"). */
  onDragStateChange?: (dragging: boolean) => void;
  /** Kurzes haptisches/visuelles Feedback (z.B. bei Klick oder Long-Press). */
  onFeedback?: (kind: "click" | "rightclick" | "dragstart") => void;
}

const TAP_MOVE_THRESHOLD_PX = 10;
const TAP_MAX_DURATION_MS = 300;
const DOUBLE_TAP_WINDOW_MS = 320;
const LONG_PRESS_MS = 500;
const TWO_FINGER_MODE_THRESHOLD_PX = 8;

type Phase = "idle" | "one-finger" | "two-finger" | "dragging";

function distance(a: TouchPoint, b: TouchPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function centroid(points: TouchPoint[]): { x: number; y: number } {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/**
 * Zustandsautomat für Touch-Gesten. Pro Remote-Ansicht wird eine Instanz
 * erzeugt; Container-Größe, Video-Seitenverhältnis und Viewport werden von
 * außen aktuell gehalten.
 */
export class TouchInputController {
  private phase: Phase = "idle";
  private config: TouchInputConfig;

  private container: Size = { width: 0, height: 0 };
  private videoAspect = 16 / 9;
  private viewport: Viewport = { scale: 1, offsetX: 0, offsetY: 0 };

  /** Virtueller Mauszeiger (normiert), Startwert: Bildschirmmitte. */
  private cursor = { xNorm: 0.5, yNorm: 0.5 };

  private startPoint: TouchPoint | null = null;
  private lastPoint: TouchPoint | null = null;
  private startTime = 0;
  private moved = false;
  private lastTapTime = 0;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;

  private twoFingerMode: "undecided" | "scroll" | "zoom" = "undecided";
  private twoFingerStartDistance = 0;
  private twoFingerStartScale = 1;
  private twoFingerLastCentroid: { x: number; y: number } | null = null;
  private twoFingerMaxMove = 0;
  private twoFingerStartTime = 0;
  private scrollRemainder = { x: 0, y: 0 };

  constructor(
    private callbacks: TouchInputCallbacks,
    config: Partial<TouchInputConfig> = {},
  ) {
    this.config = { ...DEFAULT_TOUCH_CONFIG, ...config };
  }

  // -- Konfiguration / Umgebung ------------------------------------------

  setConfig(config: Partial<TouchInputConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): TouchInputConfig {
    return this.config;
  }

  setContainer(size: Size): void {
    this.container = size;
  }

  setVideoAspect(aspect: number): void {
    if (aspect > 0 && Number.isFinite(aspect)) this.videoAspect = aspect;
  }

  setViewport(viewport: Viewport): void {
    this.viewport = viewport;
  }

  getViewport(): Viewport {
    return this.viewport;
  }

  getCursor(): { xNorm: number; yNorm: number } {
    return this.cursor;
  }

  /** Setzt Zoom/Pan zurück (Button "Zoom zurücksetzen"). */
  resetViewport(): void {
    this.updateViewport({ scale: 1, offsetX: 0, offsetY: 0 });
  }

  // -- Touch-Ereignisse ---------------------------------------------------

  onTouchStart(points: TouchPoint[]): void {
    this.cancelLongPress();

    if (points.length === 1) {
      const p = points[0];
      this.phase = "one-finger";
      this.startPoint = p;
      this.lastPoint = p;
      this.startTime = Date.now();
      this.moved = false;

      if (this.config.mode === "direct") {
        // Absoluter Modus: Der Zeiger springt sofort unter den Finger.
        this.moveCursorTo(p);
      }

      this.longPressTimer = setTimeout(() => this.beginDrag(), LONG_PRESS_MS);
      return;
    }

    if (points.length >= 2) {
      // Wechsel von 1 auf 2 Finger: laufendes Ziehen sauber beenden.
      if (this.phase === "dragging") this.endDrag();
      this.phase = "two-finger";
      this.twoFingerMode = "undecided";
      this.twoFingerStartDistance = distance(points[0], points[1]);
      this.twoFingerStartScale = this.viewport.scale;
      this.twoFingerLastCentroid = centroid(points.slice(0, 2));
      this.twoFingerMaxMove = 0;
      this.twoFingerStartTime = Date.now();
      this.scrollRemainder = { x: 0, y: 0 };
    }
  }

  onTouchMove(points: TouchPoint[]): void {
    if (this.phase === "two-finger" && points.length >= 2) {
      this.handleTwoFingerMove(points);
      return;
    }

    if (points.length !== 1) return;
    const p = points[0];

    if (this.phase === "one-finger" || this.phase === "dragging") {
      const start = this.startPoint;
      if (start && !this.moved && Math.hypot(p.x - start.x, p.y - start.y) > TAP_MOVE_THRESHOLD_PX) {
        this.moved = true;
        this.cancelLongPress();
      }
      if (this.moved || this.phase === "dragging") {
        if (this.config.mode === "direct") {
          this.moveCursorTo(p);
        } else {
          const last = this.lastPoint ?? p;
          this.moveCursorBy(p.x - last.x, p.y - last.y);
        }
      }
      this.lastPoint = p;
    }
  }

  onTouchEnd(remaining: TouchPoint[]): void {
    this.cancelLongPress();

    if (this.phase === "two-finger") {
      // Kurzes Antippen mit zwei Fingern ohne nennenswerte Bewegung = Rechtsklick.
      const duration = Date.now() - this.twoFingerStartTime;
      if (this.twoFingerMode === "undecided" && duration < TAP_MAX_DURATION_MS && this.twoFingerMaxMove < TAP_MOVE_THRESHOLD_PX) {
        this.click("right");
      }
      this.phase = remaining.length > 0 ? "one-finger" : "idle";
      if (remaining.length > 0) {
        // Verbleibenden Finger als neuen Ausgangspunkt übernehmen, ohne dass
        // dabei ein ungewollter Zeigersprung entsteht.
        this.startPoint = remaining[0];
        this.lastPoint = remaining[0];
        this.startTime = Date.now();
        this.moved = true;
      }
      return;
    }

    if (this.phase === "dragging") {
      this.endDrag();
      this.phase = "idle";
      return;
    }

    if (this.phase === "one-finger") {
      const duration = Date.now() - this.startTime;
      if (!this.moved && duration < TAP_MAX_DURATION_MS) {
        const now = Date.now();
        // Jeder Tap sendet genau EINEN Klick. Ein Doppeltipp ergibt damit zwei
        // schnell aufeinanderfolgende Klicks, die das Betriebssystem des Hosts
        // selbst als Doppelklick erkennt. Einen zusätzlichen dritten Klick zu
        // senden, würde stattdessen als Dreifachklick gewertet (markiert z.B.
        // eine ganze Zeile) — deshalb bewusst nur ein Klick pro Tap.
        this.click("left");
        this.lastTapTime = now - this.lastTapTime < DOUBLE_TAP_WINDOW_MS ? 0 : now;
      }
      this.phase = "idle";
    }
  }

  /** Abbruch (z.B. eingehender Anruf, Geste vom System übernommen). */
  onTouchCancel(): void {
    this.cancelLongPress();
    if (this.phase === "dragging") this.endDrag();
    this.phase = "idle";
  }

  // -- Öffentliche Aktionen (Buttons in der UI) ---------------------------

  /** Klick an der aktuellen Zeigerposition, z.B. über die Button-Leiste. */
  click(button: "left" | "right" | "middle"): void {
    this.callbacks.onInput({ type: "mouse-move", ...this.cursor });
    this.callbacks.onInput({ type: "mouse-down", button, ...this.cursor });
    this.callbacks.onInput({ type: "mouse-up", button, ...this.cursor });
    this.callbacks.onFeedback?.(button === "right" ? "rightclick" : "click");
  }

  /** Ziehen manuell starten/beenden (Button "Ziehen"). */
  toggleDrag(): boolean {
    if (this.phase === "dragging") {
      this.endDrag();
      this.phase = "idle";
      return false;
    }
    this.beginDrag();
    return true;
  }

  isDragging(): boolean {
    return this.phase === "dragging";
  }

  /** Räumt laufende Timer auf (beim Verlassen der Ansicht). */
  dispose(): void {
    this.cancelLongPress();
    if (this.phase === "dragging") this.endDrag();
    this.phase = "idle";
  }

  // -- intern -------------------------------------------------------------

  private handleTwoFingerMove(points: TouchPoint[]): void {
    const [a, b] = points;
    const dist = distance(a, b);
    const center = centroid([a, b]);
    const last = this.twoFingerLastCentroid ?? center;
    const centroidDelta = Math.hypot(center.x - last.x, center.y - last.y);
    const distDelta = Math.abs(dist - this.twoFingerStartDistance);
    this.twoFingerMaxMove = Math.max(this.twoFingerMaxMove, centroidDelta, distDelta);

    if (this.twoFingerMode === "undecided") {
      // Erst wenn eine der beiden Bewegungen deutlich genug ist, legen wir
      // die Geste fest — danach bleibt sie stabil (kein Flackern).
      if (distDelta > TWO_FINGER_MODE_THRESHOLD_PX && distDelta > centroidDelta) {
        this.twoFingerMode = "zoom";
      } else if (centroidDelta > TWO_FINGER_MODE_THRESHOLD_PX) {
        this.twoFingerMode = "scroll";
      }
    }

    if (this.twoFingerMode === "zoom" && this.twoFingerStartDistance > 0) {
      const scale = clamp((dist / this.twoFingerStartDistance) * this.twoFingerStartScale, MIN_SCALE, MAX_SCALE);
      this.updateViewport({ ...this.viewport, scale });
    } else if (this.twoFingerMode === "scroll") {
      const dirY = this.config.naturalScroll ? -1 : 1;
      const rawX = (center.x - last.x) * this.config.scrollSpeed * 0.15 * dirY;
      const rawY = (center.y - last.y) * this.config.scrollSpeed * 0.15 * dirY;
      // Der Host erwartet ganzzahlige "Ticks"; Reste sammeln wir, damit auch
      // langsames Scrollen nicht verloren geht.
      this.scrollRemainder.x += rawX;
      this.scrollRemainder.y += rawY;
      const stepX = Math.trunc(this.scrollRemainder.x);
      const stepY = Math.trunc(this.scrollRemainder.y);
      if (stepX !== 0 || stepY !== 0) {
        this.scrollRemainder.x -= stepX;
        this.scrollRemainder.y -= stepY;
        this.callbacks.onInput({ type: "mouse-wheel", deltaX: stepX, deltaY: stepY });
      }
    }

    this.twoFingerLastCentroid = center;
  }

  private beginDrag(): void {
    if (this.phase === "dragging") return;
    this.phase = "dragging";
    this.callbacks.onInput({ type: "mouse-move", ...this.cursor });
    this.callbacks.onInput({ type: "mouse-down", button: "left", ...this.cursor });
    this.callbacks.onDragStateChange?.(true);
    this.callbacks.onFeedback?.("dragstart");
  }

  private endDrag(): void {
    this.callbacks.onInput({ type: "mouse-up", button: "left", ...this.cursor });
    this.callbacks.onDragStateChange?.(false);
  }

  private moveCursorTo(point: TouchPoint): void {
    const norm = pointToNorm(point, this.container, this.videoAspect, this.viewport);
    this.setCursor(norm);
  }

  private moveCursorBy(dxPx: number, dyPx: number): void {
    // Relativbewegung: Die Fingerbewegung in Container-Pixeln wird über die
    // dargestellte Bildgröße auf normierte Remote-Koordinaten umgerechnet.
    // Bei Zoom wird die Bewegung feiner, was präzises Zielen ermöglicht.
    const factor = this.config.sensitivity / this.viewport.scale;
    const width = this.container.width || 1;
    const height = this.container.height || 1;
    this.setCursor({
      xNorm: clamp(this.cursor.xNorm + (dxPx * factor) / width, 0, 1),
      yNorm: clamp(this.cursor.yNorm + (dyPx * factor) / height, 0, 1),
    });
  }

  private setCursor(norm: { xNorm: number; yNorm: number }): void {
    this.cursor = norm;
    this.callbacks.onCursorChange?.(norm);
    this.callbacks.onInput({ type: "mouse-move", ...norm });
  }

  private updateViewport(next: Viewport): void {
    this.viewport = clampViewport(next, this.container);
    this.callbacks.onViewportChange?.(this.viewport);
  }

  private cancelLongPress(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }
}
