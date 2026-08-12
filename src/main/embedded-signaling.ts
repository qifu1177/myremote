/**
 * Startet den Signaling-Server zusammen mit der App.
 *
 * Hintergrund: Ohne laufenden Signaling-Server scheitert jede Freigabe mit
 * "Konnte keine Verbindung zum Signaling-Server (ws://localhost:8787)
 * herstellen." Bisher musste der Server dafür in einem zweiten Terminal per
 * `npm run signaling` gestartet werden — für Nutzer der fertigen App war das
 * gar nicht möglich. Die App bringt ihn deshalb selbst mit.
 *
 * Bewusst frei von Electron-Importen und mit injizierter Server-Fabrik, damit
 * die Logik (inkl. "Port schon belegt") ohne Electron testbar ist.
 */

/** Der von `createSignalingServer()` gelieferte Server (siehe src/signaling-server/server.js). */
export interface SignalingServerLike {
  listen(port?: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

export interface EmbeddedSignaling {
  /** "embedded" = von uns gestartet, "external" = es lief bereits einer auf dem Port. */
  readonly mode: "embedded" | "external";
  readonly port: number;
  /** Beendet nur einen selbst gestarteten Server. */
  stop(): Promise<void>;
}

/** Standardport von `npm run signaling` bzw. "ws://localhost:8787". */
export const DEFAULT_SIGNALING_PORT = 8787;

/**
 * Lädt `src/signaling-server/server.js` zur Laufzeit.
 *
 * Bewusst kein statischer Import: Der Server ist CommonJS und löst den Ordner
 * des Mobile-Clients über sein eigenes `__dirname` auf — würde der Bundler ihn
 * in out/main/index.js hineinziehen, zeigte dieser Pfad ins Leere. `__dirname`
 * ist hier out/main; der Server liegt sowohl im Projekt als auch im gepackten
 * app.asar zwei Ebenen darüber (siehe "files" in electron-builder.yml).
 */
export function loadSignalingServerFactory(): () => SignalingServerLike {
  const { createRequire } = require("module") as typeof import("module");
  const { join } = require("path") as typeof import("path");
  const requireFromMain = createRequire(join(__dirname, "index.js"));
  const { createSignalingServer } = requireFromMain(
    join(__dirname, "../../src/signaling-server/server.js"),
  ) as { createSignalingServer: (options?: { quiet?: boolean }) => SignalingServerLike };
  return () => createSignalingServer();
}

function isPortInUse(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | null)?.code === "EADDRINUSE";
}

/**
 * @param createServer Fabrik für eine Server-Instanz (`createSignalingServer`).
 * @param port Port, auf dem gelauscht werden soll.
 */
export async function startEmbeddedSignaling(
  createServer: () => SignalingServerLike,
  port: number = DEFAULT_SIGNALING_PORT,
): Promise<EmbeddedSignaling> {
  const server = createServer();
  try {
    const boundPort = await server.listen(port);
    return {
      mode: "embedded",
      port: boundPort,
      stop: () => server.close(),
    };
  } catch (err) {
    if (!isPortInUse(err)) throw err;
    // Auf dem Port läuft bereits ein Signaling-Server (z.B. `npm run signaling`
    // oder eine zweite App-Instanz). Den nutzen wir mit — und beenden ihn beim
    // Schließen der App natürlich nicht.
    await server.close();
    return { mode: "external", port, stop: async () => {} };
  }
}
