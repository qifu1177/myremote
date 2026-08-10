/**
 * Kleine Laufzeit-Metriken des Signaling-Servers.
 *
 * Zweck: Verbindungen zählbar machen, damit sich Fehler wie "der Client
 * öffnet zwei WebSocket-Verbindungen statt einer" (React-StrictMode-
 * Doppelmount) automatisiert nachweisen lassen — siehe
 * `scripts/test-mobile-strictmode.mjs`.
 *
 * Bewusst ein eigenes Modul (statt Zähler direkt in server.js), damit sowohl
 * der WebSocket-Teil (server.js) als auch der HTTP-Teil (static-http.js,
 * Endpoint `/health`) darauf zugreifen können, ohne dass eines der beiden
 * Module das andere kennen muss.
 */

const metrics = {
  /** Aktuell offene WebSocket-Verbindungen (Hosts + Controller). */
  openConnections: 0,
  /** Seit Serverstart insgesamt angenommene WebSocket-Verbindungen. */
  totalConnections: 0,
  /** Aktuell registrierte Hosts. */
  hosts: 0,
  /** Aktuell verbundene Controller-Sessions (über alle Hosts). */
  controllerSessions: 0,
  /** Seit Serverstart insgesamt akzeptierte `join`-Anfragen. */
  totalJoins: 0,
};

function onConnectionOpened() {
  metrics.openConnections += 1;
  metrics.totalConnections += 1;
}

function onConnectionClosed() {
  metrics.openConnections = Math.max(0, metrics.openConnections - 1);
}

function onJoinAccepted() {
  metrics.totalJoins += 1;
}

/** Von server.js gesetzt: aktuelle Host-/Controller-Zahlen aus der Registry. */
function setSessionCounts(hosts, controllerSessions) {
  metrics.hosts = hosts;
  metrics.controllerSessions = controllerSessions;
}

function snapshot() {
  return { ...metrics };
}

/** Nur für Tests: alle Zähler zurücksetzen. */
function reset() {
  metrics.openConnections = 0;
  metrics.totalConnections = 0;
  metrics.hosts = 0;
  metrics.controllerSessions = 0;
  metrics.totalJoins = 0;
}

module.exports = {
  onConnectionOpened,
  onConnectionClosed,
  onJoinAccepted,
  setSessionCounts,
  snapshot,
  reset,
};
