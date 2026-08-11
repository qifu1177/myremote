/**
 * Abbildung normierter Fernsteuerungs-Koordinaten (0..1 des freigegebenen
 * Bildes) auf globale Bildschirmkoordinaten.
 *
 * Bewusst ein eigenes, abhängigkeitsfreies Modul (kein Electron, kein nut-js),
 * damit die Rechnung isoliert testbar ist — `input-simulation.ts` nutzt sie
 * nur noch mit den echten Display-Daten.
 */

/** Die für uns relevanten Felder eines Electron-`Display`. */
export interface DisplayLike {
  id: number | string;
  bounds: { x: number; y: number };
  size: { width: number; height: number };
}

export interface GlobalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Wählt den freigegebenen Bildschirm anhand seiner ID. Ist keine ID gesetzt
 * oder existiert sie nicht mehr (Monitor abgezogen), gilt der primäre.
 */
export function pickDisplay<T extends DisplayLike>(
  displays: readonly T[],
  displayId: string | null,
  primary: T,
): T {
  if (!displayId) return primary;
  return displays.find((d) => String(d.id) === displayId) ?? primary;
}

/** Ursprung + Größe eines Displays in globalen Koordinaten. */
export function displayRect(display: DisplayLike): GlobalRect {
  return {
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.size.width,
    height: display.size.height,
  };
}

/**
 * Normierte Koordinaten in einen globalen Punkt umrechnen. Der Ursprung des
 * Displays MUSS addiert werden: Ohne ihn landen Eingaben bei mehreren
 * Monitoren immer auf dem primären Bildschirm.
 */
export function normToGlobalPoint(
  norm: { xNorm: number; yNorm: number },
  rect: GlobalRect,
): { x: number; y: number } {
  return {
    x: Math.round(rect.x + norm.xNorm * rect.width),
    y: Math.round(rect.y + norm.yNorm * rect.height),
  };
}
