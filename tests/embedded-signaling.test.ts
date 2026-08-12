/**
 * Tests für den im Main-Prozess eingebetteten Signaling-Server.
 *
 * Hintergrund (Bug): Die App zeigte beim Freigeben des Bildschirms
 * "Konnte keine Verbindung zum Signaling-Server (ws://localhost:8787)
 * herstellen.", weil der Server nur manuell per `npm run signaling` lief.
 * `startEmbeddedSignaling()` startet ihn jetzt zusammen mit der App.
 *
 * Getestet wird gegen den ECHTEN Server (`src/signaling-server/server.js`),
 * nicht gegen ein Mock — genau wie in tests/remote-access.test.ts.
 */
import { createRequire } from "node:module";
import WebSocket from "ws";
import { describe, expect, test } from "vitest";
import { startEmbeddedSignaling, type SignalingServerLike } from "../src/main/embedded-signaling";

const require_ = createRequire(import.meta.url);
const { createSignalingServer } = require_("../src/signaling-server/server.js") as {
  createSignalingServer: (options?: { quiet?: boolean }) => SignalingServerLike & {
    port: number;
  };
};

const createServer = (): SignalingServerLike => createSignalingServer({ quiet: true });

/** Öffnet eine WebSocket-Verbindung; true = Server erreichbar. */
function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const finish = (ok: boolean): void => {
      ws.removeAllListeners();
      ws.close();
      resolve(ok);
    };
    ws.on("open", () => finish(true));
    ws.on("error", () => finish(false));
  });
}

describe("startEmbeddedSignaling", () => {
  test("startet den Server, sodass die App ihn erreichen kann", async () => {
    // Port 0: freier Port vom Betriebssystem, damit der Test nicht mit einem
    // eventuell laufenden `npm run signaling` (Port 8787) kollidiert.
    const signaling = await startEmbeddedSignaling(createServer, 0);
    try {
      expect(signaling.mode).toBe("embedded");
      expect(signaling.port).toBeGreaterThan(0);
      await expect(canConnect(signaling.port)).resolves.toBe(true);
    } finally {
      await signaling.stop();
    }
  });

  test("stop() gibt den Port wieder frei", async () => {
    const signaling = await startEmbeddedSignaling(createServer, 0);
    const { port } = signaling;
    await signaling.stop();
    await expect(canConnect(port)).resolves.toBe(false);
  });

  test("belegter Port: vorhandener Server wird mitbenutzt statt Fehler zu werfen", async () => {
    // Simuliert den Fall "Nutzer hat `npm run signaling` bereits laufen".
    const external = createSignalingServer({ quiet: true });
    const port = await external.listen(0);
    try {
      const signaling = await startEmbeddedSignaling(createServer, port);
      expect(signaling.mode).toBe("external");
      expect(signaling.port).toBe(port);
      // Der fremde Server darf durch stop() nicht beendet werden.
      await signaling.stop();
      await expect(canConnect(port)).resolves.toBe(true);
    } finally {
      await external.close();
    }
  });
});
