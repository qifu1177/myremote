/**
 * Setzt den im Dev-Modus angezeigten App-Namen auf "mydesk".
 *
 * Hintergrund: macOS nimmt den Namen für die Menüleiste (das Menü oben links
 * neben dem Apfel) und für das Dock NICHT aus `app.setName()`, sondern aus
 * `CFBundleName` des App-Bundles. `npm run dev` startet das ungepackte Bundle
 * node_modules/electron/dist/Electron.app — deshalb stand dort bisher
 * "Electron", obwohl src/main/index.ts app.setName("mydesk") aufruft.
 * Nachgemessen: Auch ein selbst gebautes Menü ändert daran nichts, der Titel
 * des ersten Menüs kommt immer aus dem Bundle.
 *
 * Der gepackte Build ist davon nicht betroffen: electron-builder.yml setzt
 * productName und CFBundleName bereits auf "mydesk".
 *
 * Das Umschreiben der Info.plist macht die Code-Signatur des Bundles ungültig;
 * auf Apple Silicon startet die App danach gar nicht mehr ("killed: 9").
 * Deshalb wird anschließend ad-hoc neu signiert.
 *
 * Läuft als postinstall, weil `npm install` das Bundle jedes Mal frisch
 * auspackt. Fehler sind bewusst nie fatal: Klappt etwas nicht, heißt die App
 * im Dev-Modus eben weiter "Electron" — die Installation soll daran nicht
 * scheitern.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_NAME = "mydesk";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const appBundle = join(projectRoot, "node_modules/electron/dist/Electron.app");
const plist = join(appBundle, "Contents/Info.plist");

// Nur macOS liest den Namen aus dem Bundle; unter Windows/Linux gibt es weder
// Info.plist noch dieses Problem.
if (process.platform !== "darwin" || !existsSync(plist)) {
  process.exit(0);
}

function plistBuddy(command) {
  return execFileSync("/usr/libexec/PlistBuddy", ["-c", command, plist], { encoding: "utf8" }).trim();
}

try {
  // Schon umbenannt (z.B. zweiter postinstall-Lauf)? Dann nichts tun — ein
  // erneutes Signieren wäre unnötige Arbeit.
  if (plistBuddy("Print :CFBundleName") === APP_NAME) {
    process.exit(0);
  }

  plistBuddy(`Set :CFBundleName ${APP_NAME}`);
  plistBuddy(`Set :CFBundleDisplayName ${APP_NAME}`);
  execFileSync("codesign", ["--force", "--sign", "-", appBundle], { stdio: "ignore" });

  console.log(`[dev-app-name] Dev-Modus zeigt jetzt "${APP_NAME}" statt "Electron".`);
} catch (err) {
  console.warn(`[dev-app-name] übersprungen: ${err.message}`);
}
