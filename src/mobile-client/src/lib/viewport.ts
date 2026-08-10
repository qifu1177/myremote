/**
 * Geometrie-Helfer für die Remote-Ansicht auf Touch-Geräten.
 *
 * Das Remote-Bild wird als <video> mit `object-fit: contain` in einem
 * Container dargestellt (Letterboxing) und zusätzlich per CSS-Transform
 * gezoomt/verschoben (Pinch-Zoom). Damit ein Fingertipp auf die korrekte
 * Stelle des entfernten Bildschirms abgebildet wird, müssen beide Effekte
 * zurückgerechnet werden.
 */

/** Zoom-/Pan-Zustand der Remote-Ansicht (rein lokal, wird nicht übertragen). */
export interface Viewport {
  /** 1 = eingepasst, >1 = hineingezoomt */
  scale: number;
  /** Verschiebung in CSS-Pixeln, relativ zur Container-Mitte */
  offsetX: number;
  offsetY: number;
}

export const IDENTITY_VIEWPORT: Viewport = { scale: 1, offsetX: 0, offsetY: 0 };

export const MIN_SCALE = 1;
export const MAX_SCALE = 6;

export interface Size {
  width: number;
  height: number;
}

/**
 * Rechteck (in Container-Koordinaten), das das Video bei `object-fit: contain`
 * tatsächlich einnimmt — ohne Zoom/Pan.
 */
export function contentRect(container: Size, videoAspect: number): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  if (!container.width || !container.height || !videoAspect || !Number.isFinite(videoAspect)) {
    return { left: 0, top: 0, width: container.width, height: container.height };
  }
  const containerAspect = container.width / container.height;
  if (containerAspect > videoAspect) {
    // Container ist breiter als das Video -> links/rechts schwarze Balken
    const width = container.height * videoAspect;
    return { left: (container.width - width) / 2, top: 0, width, height: container.height };
  }
  const height = container.width / videoAspect;
  return { left: 0, top: (container.height - height) / 2, width: container.width, height };
}

/** Begrenzt einen Wert auf [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Verhindert, dass beim Verschieben (Pan) leere Ränder sichtbar werden:
 * Der Versatz wird auf den maximal sinnvollen Wert für die aktuelle
 * Zoomstufe begrenzt.
 */
export function clampViewport(viewport: Viewport, container: Size): Viewport {
  const scale = clamp(viewport.scale, MIN_SCALE, MAX_SCALE);
  const maxX = (container.width * (scale - 1)) / 2;
  const maxY = (container.height * (scale - 1)) / 2;
  return {
    scale,
    offsetX: clamp(viewport.offsetX, -maxX, maxX),
    offsetY: clamp(viewport.offsetY, -maxY, maxY),
  };
}

/**
 * Bildet einen Punkt in Container-Koordinaten (CSS-Pixel, Ursprung oben links)
 * auf normierte Remote-Koordinaten (0..1) ab — inklusive Rücknahme von
 * Zoom/Pan und Letterboxing.
 */
export function pointToNorm(
  point: { x: number; y: number },
  container: Size,
  videoAspect: number,
  viewport: Viewport,
): { xNorm: number; yNorm: number } {
  // 1. Zoom/Pan zurückrechnen (transform-origin: center)
  const cx = point.x - container.width / 2;
  const cy = point.y - container.height / 2;
  const ux = (cx - viewport.offsetX) / viewport.scale + container.width / 2;
  const uy = (cy - viewport.offsetY) / viewport.scale + container.height / 2;

  // 2. Letterboxing zurückrechnen
  const rect = contentRect(container, videoAspect);
  if (!rect.width || !rect.height) return { xNorm: 0, yNorm: 0 };
  return {
    xNorm: clamp((ux - rect.left) / rect.width, 0, 1),
    yNorm: clamp((uy - rect.top) / rect.height, 0, 1),
  };
}

/**
 * Umkehrung von {@link pointToNorm}: Position des virtuellen Cursors in
 * Container-Koordinaten, um ihn als Overlay einzeichnen zu können.
 */
export function normToPoint(
  norm: { xNorm: number; yNorm: number },
  container: Size,
  videoAspect: number,
  viewport: Viewport,
): { x: number; y: number } {
  const rect = contentRect(container, videoAspect);
  const ux = rect.left + norm.xNorm * rect.width;
  const uy = rect.top + norm.yNorm * rect.height;
  const cx = (ux - container.width / 2) * viewport.scale + viewport.offsetX;
  const cy = (uy - container.height / 2) * viewport.scale + viewport.offsetY;
  return { x: cx + container.width / 2, y: cy + container.height / 2 };
}
