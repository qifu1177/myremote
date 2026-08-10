/**
 * Tastatur-Unterstützung für den Mobile-Client.
 *
 * Auf Touch-Geräten gibt es keine echte Tastatur mit key-down/key-up-Semantik:
 * Die Bildschirmtastatur liefert Zeichen über ein unsichtbares Eingabefeld.
 * Dieses Modul übersetzt Zeichen und Sondertasten in die vom Host erwarteten
 * `key-down`/`key-up`-Events (`src/shared/types.ts`) — inklusive gehaltener
 * Modifier (Ctrl/Alt/Shift/Cmd), die auf dem Mobilgerät als "sticky keys"
 * bedient werden (antippen = aktiv bis zum nächsten Tastendruck).
 */
import type { RemoteInputEvent } from "@shared/types";

export type ModifierKey = "ctrl" | "shift" | "alt" | "meta";

export interface ModifierState {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

export const NO_MODIFIERS: ModifierState = { ctrl: false, shift: false, alt: false, meta: false };

/** Zuordnung Modifier -> `KeyboardEvent.key`/`code`, wie vom Host erwartet. */
const MODIFIER_KEYS: Record<ModifierKey, { key: string; code: string }> = {
  ctrl: { key: "Control", code: "ControlLeft" },
  shift: { key: "Shift", code: "ShiftLeft" },
  alt: { key: "Alt", code: "AltLeft" },
  meta: { key: "Meta", code: "MetaLeft" },
};

/** Sondertasten der Tastenleiste (Anzeigename + gesendeter key/code). */
export interface SpecialKeyDef {
  id: string;
  label: string;
  key: string;
  code: string;
}

export const SPECIAL_KEYS: SpecialKeyDef[] = [
  { id: "esc", label: "Esc", key: "Escape", code: "Escape" },
  { id: "tab", label: "Tab", key: "Tab", code: "Tab" },
  { id: "enter", label: "⏎", key: "Enter", code: "Enter" },
  { id: "backspace", label: "⌫", key: "Backspace", code: "Backspace" },
  { id: "delete", label: "Entf", key: "Delete", code: "Delete" },
  { id: "up", label: "↑", key: "ArrowUp", code: "ArrowUp" },
  { id: "down", label: "↓", key: "ArrowDown", code: "ArrowDown" },
  { id: "left", label: "←", key: "ArrowLeft", code: "ArrowLeft" },
  { id: "right", label: "→", key: "ArrowRight", code: "ArrowRight" },
  { id: "home", label: "Pos1", key: "Home", code: "Home" },
  { id: "end", label: "Ende", key: "End", code: "End" },
  { id: "pageup", label: "Bild↑", key: "PageUp", code: "PageUp" },
  { id: "pagedown", label: "Bild↓", key: "PageDown", code: "PageDown" },
];

/** `KeyboardEvent.code` für ein einzelnes Zeichen möglichst sinnvoll raten. */
export function codeForChar(char: string): string {
  if (/^[a-zA-Z]$/.test(char)) return `Key${char.toUpperCase()}`;
  if (/^[0-9]$/.test(char)) return `Digit${char}`;
  if (char === " ") return "Space";
  return "";
}

/**
 * Erzeugt die Event-Folge für einen Tastendruck inklusive der aktuell
 * gehaltenen Modifier: erst die Modifier drücken, dann die Taste, dann alles
 * in umgekehrter Reihenfolge loslassen.
 */
export function buildKeyEvents(
  key: string,
  code: string,
  modifiers: ModifierState,
): RemoteInputEvent[] {
  const active = (Object.keys(MODIFIER_KEYS) as ModifierKey[]).filter((m) => modifiers[m]);
  const flags = {
    ctrlKey: modifiers.ctrl,
    shiftKey: modifiers.shift,
    altKey: modifiers.alt,
    metaKey: modifiers.meta,
  };

  const events: RemoteInputEvent[] = [];
  for (const mod of active) {
    events.push({ type: "key-down", ...MODIFIER_KEYS[mod], ...flags });
  }
  events.push({ type: "key-down", key, code, ...flags });
  events.push({ type: "key-up", key, code, ...flags });
  for (const mod of [...active].reverse()) {
    events.push({ type: "key-up", ...MODIFIER_KEYS[mod], ...flags });
  }
  return events;
}

/** Wie {@link buildKeyEvents}, aber für ein eingetipptes Zeichen. */
export function buildCharEvents(char: string, modifiers: ModifierState): RemoteInputEvent[] {
  return buildKeyEvents(char, codeForChar(char), modifiers);
}

/** Beschriftung eines Modifiers, plattformabhängig (macOS vs. Windows). */
export function modifierLabel(mod: ModifierKey, hostIsMac: boolean): string {
  switch (mod) {
    case "ctrl":
      return "Ctrl";
    case "shift":
      return "Shift";
    case "alt":
      return hostIsMac ? "⌥" : "Alt";
    case "meta":
      return hostIsMac ? "⌘" : "Win";
  }
}
