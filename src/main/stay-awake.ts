/**
 * Hält den Rechner wach, solange ein Bildschirm freigegeben wird.
 *
 * Hintergrund (Bug): Steuerte man den Mac längere Zeit nicht, endete die
 * Verbindung von selbst. Ursache ist keine Zeitschaltung in der App, sondern
 * macOS: Die Leerlaufzeit zählt nur über PHYSISCHE Eingaben — die per
 * DataChannel simulierten Maus-/Tastatur-Events (nut-js) zählen dort nicht mit.
 * Nach `displaysleep` (Standard 10 min) schaltet der Bildschirm ab, powerd gibt
 * daraufhin seine Assertion "Prevent sleep while display is on" frei und das
 * System schläft ein. Dabei sterben WebSocket UND RTCPeerConnection; einen
 * automatischen Reconnect gibt es nicht (siehe README, "Bekannte
 * Einschränkungen"), die Sitzung ist damit endgültig weg.
 *
 * Bewusst frei von Electron-Importen und mit injizierter Blocker-API (wie
 * embedded-signaling.ts), damit die Logik ohne Electron testbar ist.
 */

/** Ausschnitt aus Electrons `powerSaveBlocker`, den wir tatsächlich nutzen. */
export interface PowerSaveBlockerLike {
  start(type: "prevent-display-sleep" | "prevent-app-suspension"): number;
  stop(id: number): void;
  isStarted(id: number): boolean;
}

export interface StayAwake {
  /** true = Rechner wachhalten (Freigabe läuft), false = Sperre freigeben. */
  set(active: boolean): void;
  readonly active: boolean;
}

export function createStayAwake(blocker: PowerSaveBlockerLike): StayAwake {
  let id: number | null = null;

  return {
    set(active: boolean): void {
      if (active) {
        // Idempotent: Ein zweiter Aufruf (React-StrictMode mountet den Effekt
        // in der Entwicklung doppelt) darf keine zweite Sperre anlegen —
        // deren ID wäre unerreichbar und der Mac schliefe nie wieder ein.
        if (id === null || !blocker.isStarted(id)) {
          // "prevent-display-sleep" statt "prevent-app-suspension": Letzteres
          // hält nur das System wach, der Bildschirm ginge trotzdem aus — und
          // ohne aktiven Bildschirm liefert macOS keine echten Frames mehr,
          // der Controller sähe nur noch ein schwarzes Bild.
          id = blocker.start("prevent-display-sleep");
        }
        return;
      }
      if (id === null) return;
      if (blocker.isStarted(id)) blocker.stop(id);
      id = null;
    },
    get active(): boolean {
      return id !== null && blocker.isStarted(id);
    },
  };
}
