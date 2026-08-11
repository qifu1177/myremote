import { describe, expect, it } from "vitest";
import { DATA_CHANNEL_LABEL, IPC_CHANNELS } from "@shared/types";
import type { Role } from "@shared/types";

/**
 * Smoke-Test: stellt sicher, dass das Test-Setup (Vitest + Pfad-Aliase)
 * grundsätzlich funktioniert.
 */
describe("smoke", () => {
  it("führt Tests aus", () => {
    expect(true).toBe(true);
  });

  it("löst den @shared-Alias auf", () => {
    expect(DATA_CHANNEL_LABEL).toBe("myremote-input");
    expect(typeof IPC_CHANNELS).toBe("object");
    const role: Role = "host";
    expect(role).toBe("host");
  });
});
