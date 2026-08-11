import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Zentrale Vitest-Konfiguration.
 *
 * Die Pfad-Aliase spiegeln exakt die Aliase der beiden bestehenden Builds
 * (`electron.vite.config.ts` und `src/mobile-client/vite.config.ts`) wider,
 * damit Tests dieselben Importpfade wie der Produktionscode nutzen können.
 */
const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@shared": resolve(rootDir, "src/shared"),
      "@renderer": resolve(rootDir, "src/renderer/src"),
      "@mobile": resolve(rootDir, "src/mobile-client/src"),
    },
  },
});
