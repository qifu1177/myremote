import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Eigenständiger Vite-Build für den **Mobile-Client** (iPad / iPhone /
 * Android-Phone).
 *
 * Der Mobile-Client ist bewusst eine reine Web-App (PWA): Sie läuft in
 * Mobile-Safari bzw. Chrome für Android, benötigt also keinen App-Store und
 * kein natives Projekt. Fachlich ist sie ein *Controller* im Sinne des
 * bestehenden Protokolls (`src/shared/types.ts`) und verwendet exakt dieselbe
 * `ControllerSession` wie die Desktop-App — der Host (Mac/Windows) muss dafür
 * nicht angepasst werden (Open-Closed-Prinzip).
 *
 * Build:  npm run build:mobile   -> dist/mobile
 * Dev:    npm run dev:mobile     -> Vite-Dev-Server (im LAN erreichbar)
 * Der Signaling-Server liefert dist/mobile zusätzlich per HTTP aus, sodass
 * Handy/Tablet und Signaling über dieselbe Adresse/Port erreichbar sind.
 */
export default defineConfig(({ command }) => {
  // Wichtig: Vite löst die React-Pakete über die "development"/"production"-
  // Exportbedingung auf, die aus NODE_ENV abgeleitet wird. Ist beim Aufruf
  // von `npm run build:mobile` in der Shell NODE_ENV=development gesetzt
  // (z.B. in Entwickler-/CI-Umgebungen), landet sonst das React-*Development*-
  // Bundle im Produktions-Build. Folge: React.StrictMode mountet doppelt und
  // der Client öffnet zwei WebSocket-Verbindungen statt einer.
  // Für einen Build erzwingen wir deshalb plattformunabhängig "production"
  // (statt NODE_ENV im npm-Script zu setzen, was unter Windows scheitert).
  if (command === "build" && process.env.NODE_ENV !== "production") {
    process.env.NODE_ENV = "production";
  }

  return {
    root: __dirname,
    base: "./",
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "../shared"),
        // Wiederverwendung der bereits erprobten Controller-/Signaling-Logik
        // der Desktop-App (reiner Browser-Code, keine Electron-Abhängigkeit).
        "@renderer": resolve(__dirname, "../renderer/src"),
        "@mobile": resolve(__dirname, "src"),
      },
    },
    plugins: [react()],
    server: {
      // 0.0.0.0, damit der Dev-Server vom Handy/Tablet im selben WLAN
      // erreichbar ist (http://<LAN-IP>:5180).
      host: true,
      port: 5180,
    },
    build: {
      outDir: resolve(__dirname, "../../dist/mobile"),
      emptyOutDir: true,
      target: "es2019",
    },
  };
});
