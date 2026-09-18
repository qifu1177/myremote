/**
 * Regressionstests für "Verbindung weg": Nachdem eine Browser-Verbindung
 * bestand und der Browser geschlossen wurde, kam eine erneute Verbindung
 * nicht mehr zustande.
 *
 * Ursache war nicht der Controller, sondern die Host-Registrierung: Stirbt der
 * WebSocket des Hosts unbemerkt (Idle-Timeout eines Routers/Proxys, WLAN-
 * Wechsel, Standby), verschwindet der Host aus der Registry des Signaling-
 * Servers — die Host-App merkte davon nichts und meldete sich nie neu an.
 * Der nächste Browser-Versuch lief dann in "host-not-found".
 */
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { HostSession } from "@renderer/lib/hostSession";
import { ControllerSession } from "@renderer/lib/controllerSession";
import { FakeMediaStream, installFakeWebRtc } from "./helpers/fake-webrtc";

const require_ = createRequire(import.meta.url);
const { startSignalingServer } = require_("../src/signaling-server/server.js");

let server: Awaited<ReturnType<typeof startSignalingServer>>;
let restoreWebRtc: () => void;

beforeAll(async () => {
  server = await startSignalingServer({ port: 0, quiet: true });
  restoreWebRtc = installFakeWebRtc();
});

afterAll(async () => {
  restoreWebRtc();
  await server.close();
});

function waitUntil(check: () => boolean, label: string, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = (): void => {
      if (check()) return resolve();
      if (Date.now() > deadline) return reject(new Error(`Timeout: ${label}`));
      setTimeout(tick, 10);
    };
    tick();
  });
}

/** Trennt den Socket des Hosts serverseitig hart — wie ein Idle-Timeout. */
function killHostSocket(hostId: string): void {
  const host = server.hosts.get(hostId);
  if (!host) throw new Error(`Host ${hostId} ist nicht registriert`);
  host.ws.terminate();
}

describe("Host bleibt nach Verbindungsverlust erreichbar", () => {
  test("Host meldet den Verlust der Signaling-Verbindung nach oben", async () => {
    const hostId = "910000001";
    const closed: string[] = [];
    const host = new HostSession(server.url, hostId, "pw", {
      onSignalingClosed: () => closed.push("closed"),
    });
    await host.start(new FakeMediaStream() as unknown as MediaStream);
    await waitUntil(() => server.hosts.has(hostId), "Host registriert");

    killHostSocket(hostId);

    // Ohne diese Meldung kann die UI den Abriss weder anzeigen noch beheben.
    await waitUntil(() => closed.length > 0, "onSignalingClosed wurde gemeldet");
    host.stop();
  });

  test("erneutes Registrieren derselben ID wird angenommen (kein id-already-registered)", async () => {
    const hostId = "910000002";
    const errors: string[] = [];
    const host = new HostSession(server.url, hostId, "pw", { onError: (m) => errors.push(m) });
    await host.start(new FakeMediaStream() as unknown as MediaStream);
    await waitUntil(() => server.hosts.has(hostId), "Host registriert");

    // Karteileiche simulieren: Der alte Eintrag steht noch, der Host meldet
    // sich (nach einem Reconnect) mit derselben ID erneut an.
    const second = new HostSession(server.url, hostId, "pw", { onError: (m) => errors.push(m) });
    await second.start(new FakeMediaStream() as unknown as MediaStream);
    await new Promise((r) => setTimeout(r, 200));

    expect(errors).toEqual([]);
    expect(server.hosts.has(hostId)).toBe(true);
    host.stop();
    second.stop();
  });

  test("nach dem Abriss findet ein neuer Browser den Host wieder", async () => {
    const hostId = "910000003";
    const password = "pw";
    let restored = false;
    const host = new HostSession(server.url, hostId, password, {
      onSignalingRestored: () => (restored = true),
    });
    await host.start(new FakeMediaStream() as unknown as MediaStream);
    await waitUntil(() => server.hosts.has(hostId), "Host registriert");

    // 1. Browser verbindet sich und wird wieder geschlossen.
    let firstConnected = false;
    const first = new ControllerSession(server.url, hostId, password, {
      onConnected: () => (firstConnected = true),
    });
    await first.connect();
    await waitUntil(() => firstConnected, "erste Browser-Verbindung");
    first.disconnect();
    await waitUntil(() => host.chatPeerCount === 0, "erste Sitzung abgemeldet");

    // 2. Der Host verliert unbemerkt seine Signaling-Verbindung.
    killHostSocket(hostId);

    // 3. Der Host muss sich selbstständig wieder anmelden. Das geschieht nach
    //    einer kurzen Wartezeit (Backoff), deshalb großzügiges Zeitfenster.
    await waitUntil(() => restored, "Host hat sich neu registriert", 5000);
    expect(server.hosts.has(hostId)).toBe(true);

    // 4. Genau das ist der gemeldete Fehler: Der zweite Browser-Versuch.
    let secondConnected = false;
    const problems: string[] = [];
    const second = new ControllerSession(server.url, hostId, password, {
      onConnected: () => (secondConnected = true),
      onRejected: (reason) => problems.push(reason),
      onError: (message) => problems.push(message),
    });
    await second.connect();
    await waitUntil(() => secondConnected, `zweite Verbindung (Probleme: ${JSON.stringify(problems)})`);

    expect(problems).toEqual([]);
    second.disconnect();
    host.stop();
  });
});
