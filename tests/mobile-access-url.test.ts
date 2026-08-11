/**
 * Regressionstests für die im Desktop-UI angezeigte Mobile-Zugangsadresse.
 *
 * Bug: QR-Code und Adresstext der Karte "Vom Tablet oder Handy steuern"
 * wurden direkt aus der Signaling-URL gebildet. Deren Standard ist
 * "ws://localhost:8787" — auf einem iPad/Smartphone zeigt "localhost" jedoch
 * auf das Gerät selbst, der gescannte QR-Code führte also ins Leere.
 * Erwartet wird stattdessen die LAN-Adresse dieses Rechners.
 */
import { describe, expect, test } from "vitest";
import { isLoopbackUrl, mobileClientInviteUrl, withReachableHost } from "@renderer/lib/mobileClientUrl";
import { pickLanAddress } from "../src/main/lan-address";
import type { NetworkInterfaceInfo } from "os";

/** Kürzel für einen Interface-Eintrag, wie ihn os.networkInterfaces() liefert. */
function iface(address: string, internal = false): NetworkInterfaceInfo {
  return {
    address,
    netmask: "255.255.255.0",
    family: "IPv4",
    mac: "00:00:00:00:00:00",
    internal,
    cidr: `${address}/24`,
  } as NetworkInterfaceInfo;
}

describe("pickLanAddress: Auswahl der im LAN erreichbaren Adresse", () => {
  test("nimmt die externe IPv4-Adresse statt der Loopback-Adresse", () => {
    expect(pickLanAddress({ lo0: [iface("127.0.0.1", true)], en0: [iface("192.168.1.20")] })).toBe("192.168.1.20");
  });

  test("bevorzugt 192.168.x vor 10.x (typisches Heim-/Büro-WLAN vor VPN)", () => {
    expect(pickLanAddress({ utun0: [iface("10.8.0.3")], en0: [iface("192.168.1.20")] })).toBe("192.168.1.20");
  });

  test("ignoriert Selbstzuweisung 169.254.x (kein DHCP-Lease, nicht erreichbar)", () => {
    expect(pickLanAddress({ en1: [iface("169.254.10.5")], en0: [iface("10.0.0.7")] })).toBe("10.0.0.7");
  });

  test("ohne Netzwerkverbindung gibt es keine Adresse", () => {
    expect(pickLanAddress({ lo0: [iface("127.0.0.1", true)] })).toBeNull();
  });
});

describe("withReachableHost: localhost wird durch die LAN-Adresse ersetzt", () => {
  test("Standard-URL localhost -> LAN-Adresse", () => {
    expect(withReachableHost("ws://localhost:8787", "192.168.1.20")).toBe("ws://192.168.1.20:8787");
  });

  test("127.0.0.1 wird ebenfalls ersetzt", () => {
    expect(withReachableHost("ws://127.0.0.1:8787", "192.168.1.20")).toBe("ws://192.168.1.20:8787");
  });

  test("bewusst gesetzter Hostname bleibt unangetastet", () => {
    expect(withReachableHost("ws://remote.example.com:8787", "192.168.1.20")).toBe("ws://remote.example.com:8787");
  });

  test("ohne bekannte LAN-Adresse bleibt die URL unverändert", () => {
    expect(withReachableHost("ws://localhost:8787", null)).toBe("ws://localhost:8787");
  });
});

describe("Einladungs-URL für den QR-Code", () => {
  test("QR-Ziel enthält die LAN-Adresse und die Host-ID, aber kein Passwort", () => {
    const url = mobileClientInviteUrl(withReachableHost("ws://localhost:8787", "192.168.1.20"), "482 913 607");
    expect(url).toBe("http://192.168.1.20:8787/?id=482913607");
  });

  test("Loopback-Hinweis entfällt, sobald eine LAN-Adresse bekannt ist", () => {
    expect(isLoopbackUrl(withReachableHost("ws://localhost:8787", "192.168.1.20"))).toBe(false);
    expect(isLoopbackUrl(withReachableHost("ws://localhost:8787", null))).toBe(true);
  });
});
