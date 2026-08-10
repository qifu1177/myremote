/**
 * Führt vom Controller empfangene Eingabe-Events auf dem Host-Rechner aus.
 * Nutzt @nut-tree-fork/nut-js für plattformübergreifende (macOS/Windows/Linux)
 * Maus- und Tastatursimulation.
 *
 * Hinweis macOS: Erfordert die Berechtigung "Bedienungshilfen" (Accessibility)
 * in Systemeinstellungen -> Datenschutz & Sicherheit -> Bedienungshilfen für
 * die myremote-App (bzw. den Terminal/Electron-Prozess im Dev-Modus).
 */
import type { RemoteInputEvent } from "@shared/types";
import { screen as electronScreen } from "electron";
// Die reine Namenszuordnung liegt in einem abhängigkeitsfreien Modul, damit
// sie ohne Electron/nut-js testbar ist (siehe tests/ipad-remote-control.test.ts).
// Wichtig: als statischer Import, damit der Bundler (electron-vite) das Modul
// mit in out/main/index.js aufnimmt — ein require() zur Laufzeit würde im Build
// auf eine nicht existierende Datei zeigen.
import { resolveNutKeyName } from "./key-map";

// nut-js wird lazy geladen, damit ein Fehlen des nativen Moduls (z.B. wenn
// Build-Tools fehlen) nicht sofort den ganzen Main-Prozess crasht — der
// Host-Modus meldet den Fehler dann nur beim ersten Eingabe-Event.
let nutModule: typeof import("@nut-tree-fork/nut-js") | null = null;
let loadError: Error | null = null;

async function loadNut() {
  if (nutModule || loadError) return;
  try {
    nutModule = await import("@nut-tree-fork/nut-js");
    // Bewegungen sofort ausführen (kein eingebautes "smooth movement" Delay)
    nutModule.mouse.config.mouseSpeed = 8000;
  } catch (err) {
    loadError = err as Error;
    console.error("[input-simulation] Konnte @nut-tree-fork/nut-js nicht laden:", err);
  }
}

function currentDisplaySizePx(): { width: number; height: number } {
  const display = electronScreen.getPrimaryDisplay();
  return { width: display.size.width, height: display.size.height };
}

function resolveNutKey(
  nut: typeof import("@nut-tree-fork/nut-js"),
  key: string,
  code: string,
): number | null {
  const name = resolveNutKeyName(key, code);
  if (!name) return null;
  const nutKey = (nut.Key as unknown as Record<string, number>)[name];
  return typeof nutKey === "number" ? nutKey : null;
}

export async function applyRemoteInputEvent(evt: RemoteInputEvent): Promise<void> {
  await loadNut();
  if (!nutModule) return; // still not available; silently drop
  const nut = nutModule;

  try {
    switch (evt.type) {
      case "mouse-move": {
        const { width, height } = currentDisplaySizePx();
        await nut.mouse.setPosition({
          x: Math.round(evt.xNorm * width),
          y: Math.round(evt.yNorm * height),
        });
        break;
      }
      case "mouse-down": {
        const btn =
          evt.button === "right"
            ? nut.Button.RIGHT
            : evt.button === "middle"
              ? nut.Button.MIDDLE
              : nut.Button.LEFT;
        await nut.mouse.pressButton(btn);
        break;
      }
      case "mouse-up": {
        const btn =
          evt.button === "right"
            ? nut.Button.RIGHT
            : evt.button === "middle"
              ? nut.Button.MIDDLE
              : nut.Button.LEFT;
        await nut.mouse.releaseButton(btn);
        break;
      }
      case "mouse-wheel": {
        if (evt.deltaY) {
          if (evt.deltaY > 0) await nut.mouse.scrollDown(Math.abs(Math.round(evt.deltaY)));
          else await nut.mouse.scrollUp(Math.abs(Math.round(evt.deltaY)));
        }
        if (evt.deltaX) {
          if (evt.deltaX > 0) await nut.mouse.scrollRight(Math.abs(Math.round(evt.deltaX)));
          else await nut.mouse.scrollLeft(Math.abs(Math.round(evt.deltaX)));
        }
        break;
      }
      case "key-down": {
        const key = resolveNutKey(nut, evt.key, evt.code);
        if (key !== null) await nut.keyboard.pressKey(key);
        break;
      }
      case "key-up": {
        const key = resolveNutKey(nut, evt.key, evt.code);
        if (key !== null) await nut.keyboard.releaseKey(key);
        break;
      }
    }
  } catch (err) {
    console.error("[input-simulation] Fehler beim Ausführen des Events:", evt, err);
  }
}
