import { describe, expect, it } from "vitest";
import type { PermissionStatus } from "@shared/types";
import { allPermissionsGranted, isScreenCaptureAllowed, missingPermissions } from "@renderer/lib/permissions";
import {
  displayRect,
  normToGlobalPoint,
  pickDisplay,
  type DisplayLike,
} from "../src/main/display-mapping";

/**
 * Zwei gemeldete UI-Fehler:
 *
 * 1. "Wenn Mac nicht aktiviert wird, kann die Steuerung durch Browser nicht
 *    funktionieren" — die macOS-Berechtigungen (Bedienungshilfen für Maus/
 *    Tastatur, Bildschirmaufnahme für das Bild) fehlten und die UI meldete
 *    das weder verlässlich noch bot sie einen Weg, sie zu erteilen.
 * 2. "Teilweise wird der falsche Screen im Browser angezeigt" — bei mehreren
 *    Monitoren wurde die Eingabe immer auf den *primären* Bildschirm
 *    gerechnet, unabhängig davon, welcher Bildschirm freigegeben war.
 */

function status(patch: Partial<PermissionStatus> = {}): PermissionStatus {
  return { accessibility: true, screen: "granted", ...patch };
}

describe("macOS-Berechtigungen für den Host-Modus", () => {
  it("erlaubt die Aufnahme nur bei ausdrücklich erteiltem Recht", () => {
    expect(isScreenCaptureAllowed(status({ screen: "granted" }))).toBe(true);
    // "not-determined" bedeutet: macOS liefert bislang nur ein Ersatzbild.
    expect(isScreenCaptureAllowed(status({ screen: "not-determined" }))).toBe(false);
    expect(isScreenCaptureAllowed(status({ screen: "denied" }))).toBe(false);
    expect(isScreenCaptureAllowed(status({ screen: "unknown" }))).toBe(false);
  });

  it("meldet keine fehlende Berechtigung, wenn alles erteilt ist", () => {
    expect(missingPermissions(status())).toEqual([]);
    expect(allPermissionsGranted(status())).toBe(true);
  });

  it("meldet die fehlende Bedienungshilfen-Berechtigung (Steuerung tot)", () => {
    const s = status({ accessibility: false });
    expect(missingPermissions(s)).toEqual(["accessibility"]);
    expect(allPermissionsGranted(s)).toBe(false);
  });

  it("meldet die fehlende Bildschirmaufnahme (falsches Bild im Browser)", () => {
    expect(missingPermissions(status({ screen: "denied" }))).toEqual(["screen"]);
  });

  it("nennt bei beiden fehlenden Rechten die Bildaufnahme zuerst", () => {
    // Ohne Bild ist die Freigabe komplett wertlos, daher hat sie Vorrang.
    expect(missingPermissions(status({ accessibility: false, screen: "denied" }))).toEqual([
      "screen",
      "accessibility",
    ]);
  });
});

describe("Eingaben landen auf dem freigegebenen Bildschirm", () => {
  const primary: DisplayLike = { id: 1, bounds: { x: 0, y: 0 }, size: { width: 1920, height: 1080 } };
  // Zweiter Monitor rechts daneben, andere Auflösung.
  const secondary: DisplayLike = { id: 2, bounds: { x: 1920, y: 0 }, size: { width: 2560, height: 1440 } };
  const displays = [primary, secondary];

  it("wählt ohne gesetzte ID den primären Bildschirm", () => {
    expect(pickDisplay(displays, null, primary)).toBe(primary);
  });

  it("wählt den freigegebenen Bildschirm anhand seiner ID", () => {
    // desktopCapturer liefert display_id als String — der Vergleich muss das aushalten.
    expect(pickDisplay(displays, "2", primary)).toBe(secondary);
  });

  it("fällt auf den primären Bildschirm zurück, wenn der Monitor weg ist", () => {
    expect(pickDisplay(displays, "99", primary)).toBe(primary);
  });

  it("bildet die Bildmitte auf die Mitte des primären Bildschirms ab", () => {
    expect(normToGlobalPoint({ xNorm: 0.5, yNorm: 0.5 }, displayRect(primary))).toEqual({
      x: 960,
      y: 540,
    });
  });

  it("addiert den Ursprung des zweiten Monitors", () => {
    // Genau das war der Fehler: ohne bounds.x landete der Klick auf dem
    // primären Bildschirm statt auf dem freigegebenen.
    expect(normToGlobalPoint({ xNorm: 0.5, yNorm: 0.5 }, displayRect(secondary))).toEqual({
      x: 1920 + 1280,
      y: 720,
    });
  });

  it("bildet die Ecken des zweiten Monitors exakt ab", () => {
    const rect = displayRect(secondary);
    expect(normToGlobalPoint({ xNorm: 0, yNorm: 0 }, rect)).toEqual({ x: 1920, y: 0 });
    expect(normToGlobalPoint({ xNorm: 1, yNorm: 1 }, rect)).toEqual({ x: 4480, y: 1440 });
  });

  it("liefert ganzzahlige Koordinaten", () => {
    const point = normToGlobalPoint({ xNorm: 1 / 3, yNorm: 1 / 3 }, displayRect(primary));
    expect(Number.isInteger(point.x)).toBe(true);
    expect(Number.isInteger(point.y)).toBe(true);
  });
});
