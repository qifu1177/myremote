/**
 * Auswertung der macOS-Datenschutzberechtigungen für den Host-Modus.
 *
 * Ohne "Bildschirmaufnahme" liefert macOS zwar einen Stream, aber nur ein
 * Ersatzbild (Schreibtischhintergrund/Fensterrahmen) — im Browser des
 * Controllers erscheint dann scheinbar "der falsche Bildschirm". Ohne
 * "Bedienungshilfen" werden Maus-/Tastatur-Events stillschweigend verworfen,
 * die Fernsteuerung wirkt wie eingefroren.
 *
 * Reine Logik ohne DOM/Electron, damit sie isoliert testbar ist.
 */
import type { PermissionStatus } from "@shared/types";

/** Fehlende Berechtigung, für die die UI einen Hinweis + Button zeigt. */
export type MissingPermission = "screen" | "accessibility";

/** true, sobald der Bildschirm wirklich aufgenommen werden darf. */
export function isScreenCaptureAllowed(status: PermissionStatus): boolean {
  return status.screen === "granted";
}

/**
 * Welche Berechtigungen fehlen? Reihenfolge = Anzeigereihenfolge: Ohne
 * Bildschirmaufnahme ist die Freigabe komplett wertlos, deshalb zuerst.
 */
export function missingPermissions(status: PermissionStatus): MissingPermission[] {
  const missing: MissingPermission[] = [];
  if (!isScreenCaptureAllowed(status)) missing.push("screen");
  if (!status.accessibility) missing.push("accessibility");
  return missing;
}

/** true, wenn Freigabe + Fernsteuerung uneingeschränkt möglich sind. */
export function allPermissionsGranted(status: PermissionStatus): boolean {
  return missingPermissions(status).length === 0;
}
