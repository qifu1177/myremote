/**
 * Ableitung der URL, unter der der **Mobile-Client** (iPad / iPhone /
 * Android-Phone) im Browser geöffnet wird.
 *
 * Der Signaling-Server liefert die mobile Web-App über denselben Port per
 * HTTP aus (siehe `src/signaling-server/static-http.js`). Aus der bereits
 * konfigurierten Signaling-URL (`ws://…`) lässt sich die Seiten-URL daher
 * direkt ableiten — der Nutzer muss nichts zusätzlich einstellen.
 */

/** `ws://host:8787` -> `http://host:8787/` (bzw. wss -> https). */
export function mobileClientBaseUrl(signalingUrl: string): string | null {
  try {
    const url = new URL(signalingUrl);
    const httpProtocol = url.protocol === "wss:" ? "https:" : "http:";
    return `${httpProtocol}//${url.host}/`;
  } catch {
    return null;
  }
}

/**
 * Ersetzt einen Loopback-Hostnamen ("localhost", 127.0.0.1, ::1) durch die
 * LAN-Adresse dieses Rechners.
 *
 * Grund: Der Standard der Signaling-URL ist "ws://localhost:8787". Ein daraus
 * gebildeter QR-Code ist auf einem iPad/iPhone wertlos, weil "localhost" dort
 * auf das Mobilgerät selbst zeigt. Der Signaling-Server lauscht ohnehin auf
 * allen Interfaces, es genügt also, die erreichbare Adresse anzuzeigen. Alle
 * anderen (bewusst gesetzten) Hostnamen bleiben unverändert.
 */
export function withReachableHost(signalingUrl: string, lanAddress: string | null): string {
  if (!lanAddress || !isLoopbackUrl(signalingUrl)) return signalingUrl;
  try {
    const url = new URL(signalingUrl);
    url.hostname = lanAddress;
    return url.toString().replace(/\/$/, "");
  } catch {
    return signalingUrl;
  }
}

/**
 * Vollständige Einladungs-URL inklusive Partner-ID. Das Passwort wird
 * bewusst **nicht** in den Link aufgenommen — es soll separat übermittelt
 * bzw. auf dem Gerät eingegeben werden.
 */
export function mobileClientInviteUrl(signalingUrl: string, hostId: string): string | null {
  const base = mobileClientBaseUrl(signalingUrl);
  if (!base) return null;
  const id = hostId.replace(/\s+/g, "");
  return id ? `${base}?id=${encodeURIComponent(id)}` : base;
}

/**
 * "localhost" ist vom Handy aus nicht erreichbar (es zeigt dort auf das
 * Gerät selbst). In diesem Fall zeigt die UI einen Hinweis, dass die
 * LAN-Adresse des Rechners eingetragen werden muss.
 */
export function isLoopbackUrl(signalingUrl: string): boolean {
  try {
    const { hostname } = new URL(signalingUrl);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}
