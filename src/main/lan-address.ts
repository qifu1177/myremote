/**
 * Ermittlung der LAN-Adresse dieses Rechners.
 *
 * Hintergrund: Der QR-Code / die Einladungs-URL für den Mobile-Client wird aus
 * der konfigurierten Signaling-URL abgeleitet. Deren Standard ist
 * "ws://localhost:8787" — auf einem iPad/iPhone zeigt "localhost" jedoch auf
 * das Gerät selbst, der gescannte Link führt also ins Leere. Der
 * Signaling-Server lauscht auf allen Interfaces, daher genügt es, in der UI
 * die tatsächliche LAN-Adresse statt "localhost" anzuzeigen.
 *
 * `os` ist nur im Main-Prozess verfügbar, deshalb liegt die Ermittlung hier
 * und wird über AppInfo (IPC) an den Renderer gereicht.
 */
import { networkInterfaces, type NetworkInterfaceInfo } from "os";

/** Reihenfolge der bevorzugten privaten IPv4-Bereiche (RFC 1918). */
function privateRangeRank(address: string): number {
  if (address.startsWith("192.168.")) return 0;
  if (/^10\./.test(address)) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2;
  return -1;
}

/**
 * Wählt aus den Netzwerk-Interfaces die Adresse aus, unter der der Rechner im
 * lokalen Netz am wahrscheinlichsten erreichbar ist. Exportiert (mit
 * injizierbaren Interfaces), damit die Auswahl testbar ist.
 */
export function pickLanAddress(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>): string | null {
  const candidates: { address: string; rank: number }[] = [];
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      // Node <18 liefert family als "IPv4", neuere Versionen teils als 4.
      const isIpv4 = entry.family === "IPv4" || (entry.family as unknown as number) === 4;
      if (!isIpv4 || entry.internal) continue;
      // 169.254.x.x (APIPA) entsteht ohne DHCP-Lease und ist praktisch nie erreichbar.
      if (entry.address.startsWith("169.254.")) continue;
      const rank = privateRangeRank(entry.address);
      if (rank < 0) continue;
      candidates.push({ address: entry.address, rank });
    }
  }
  candidates.sort((a, b) => a.rank - b.rank);
  return candidates[0]?.address ?? null;
}

/** LAN-Adresse dieses Rechners, oder null wenn keine gefunden wurde. */
export function detectLanAddress(): string | null {
  return pickLanAddress(networkInterfaces());
}
