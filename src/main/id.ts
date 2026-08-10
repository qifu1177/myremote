/** Erzeugt zufällige Host-ID (9 Ziffern, wie in der Design-Vorlage "482 913 607") und ein Passwort. */
import { randomInt } from "crypto";

export function generateHostId(): string {
  let digits = "";
  for (let i = 0; i < 9; i++) digits += randomInt(0, 10).toString();
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
}

const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne verwechselbare Zeichen (I, O, 0, 1)

export function generateHostPassword(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[randomInt(0, PASSWORD_ALPHABET.length)];
  }
  return out;
}
