/**
 * Kurzlebige Sicherung der laufenden Sitzung des Browser-Clients.
 *
 * Hintergrund: Partner-ID und Passwort lagen bisher ausschließlich im
 * React-State. Ein Neuladen der Seite (F5, Wischgeste, Wiederherstellen eines
 * Tabs durch iOS Safari) verwarf sie — die Verbindung war danach weg und
 * musste von Hand neu aufgebaut werden.
 *
 * Bewusst `sessionStorage` statt `localStorage`: Der Eintrag überlebt ein
 * Neuladen, ist auf den Tab beschränkt und verschwindet beim Schließen. Ein
 * später frisch geöffneter Tab verbindet sich also nicht ungefragt erneut,
 * und das Passwort bleibt nicht dauerhaft gespeichert.
 */

const SESSION_KEY = "mydesk-mobile:session";

export interface StoredSession {
  hostId: string;
  password: string;
}

/** Liest die gesicherte Sitzung; `null`, wenn keine (gültige) vorliegt. */
export function loadStoredSession(): StoredSession | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed?.hostId !== "string" || typeof parsed?.password !== "string") return null;
    if (!parsed.hostId || !parsed.password) return null;
    return { hostId: parsed.hostId, password: parsed.password };
  } catch {
    return null;
  }
}

/** Sichert die laufende Sitzung, damit sie ein Neuladen übersteht. */
export function storeSession(session: StoredSession): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* privater Modus / Speicher voll: dann eben ohne Wiederherstellung */
  }
}

/** Verwirft die gesicherte Sitzung (bewusstes Trennen durch den Nutzer). */
export function clearStoredSession(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignorieren */
  }
}
