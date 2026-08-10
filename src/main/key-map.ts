/**
 * Abbildung von Browser-Tastenereignissen (`KeyboardEvent.key` / `.code`) auf
 * die Tastennamen des nut-js-`Key`-Enums.
 *
 * Bewusst ein eigenes, abhängigkeitsfreies Modul (kein Import von Electron
 * oder nut-js), damit die Zuordnung isoliert getestet werden kann.
 * `input-simulation.ts` schlägt hier nur den Namen nach und liest dann den
 * numerischen Wert aus `nut.Key`.
 *
 * Achtung Fallstricke des nut-js-Enums:
 *  - Es ist ein numerisches TypeScript-Enum, also auch *rückwärts* indizierbar:
 *    `Key["1"]` liefert nicht die Ziffer 1, sondern den Namen `"F1"` (Wert 1).
 *    Ein direkter Zugriff mit dem Zeichen als Schlüssel tippt daher F-Tasten
 *    statt Ziffern. Ziffern heißen im Enum `Num0`..`Num9`.
 *  - Satzzeichen haben Namen (`Period`, `Comma`, `Minus`, …) und sind über das
 *    Zeichen selbst nicht auffindbar.
 */

/** `KeyboardEvent.key` -> nut-js-Tastenname (für Tasten ohne Zeichen). */
const KEY_NAME_MAP: Record<string, string> = {
  Enter: "Return",
  Escape: "Escape",
  Backspace: "Backspace",
  Tab: "Tab",
  " ": "Space",
  Spacebar: "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Control: "LeftControl",
  Shift: "LeftShift",
  Alt: "LeftAlt",
  Meta: "LeftSuper",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  CapsLock: "CapsLock",
  NumLock: "NumLock",
  ScrollLock: "ScrollLock",
  Pause: "Pause",
  PrintScreen: "Print",
  ContextMenu: "Menu",
  AudioVolumeMute: "AudioMute",
  AudioVolumeDown: "AudioVolDown",
  AudioVolumeUp: "AudioVolUp",
};

/** Zeichen -> nut-js-Tastenname (Ziffern und Satzzeichen). */
const CHAR_NAME_MAP: Record<string, string> = {
  0: "Num0",
  1: "Num1",
  2: "Num2",
  3: "Num3",
  4: "Num4",
  5: "Num5",
  6: "Num6",
  7: "Num7",
  8: "Num8",
  9: "Num9",
  "-": "Minus",
  "=": "Equal",
  "[": "LeftBracket",
  "]": "RightBracket",
  "\\": "Backslash",
  ";": "Semicolon",
  "'": "Quote",
  ",": "Comma",
  ".": "Period",
  "/": "Slash",
  "`": "Grave",
};

/**
 * `KeyboardEvent.code` -> nut-js-Tastenname. Wird als Rückfallebene benutzt,
 * wenn `key` ein Zeichen ist, das über eine Umschalttaste erzeugt wurde
 * (z.B. "!" auf der Taste "1", oder "?" auf einer nicht-US-Belegung).
 */
function nameFromCode(code?: string): string | null {
  if (!code) return null;
  let match = /^Key([A-Z])$/.exec(code);
  if (match) return match[1];
  match = /^Digit(\d)$/.exec(code);
  if (match) return `Num${match[1]}`;
  match = /^Numpad(\d)$/.exec(code);
  if (match) return `NumPad${match[1]}`;
  match = /^F(\d{1,2})$/.exec(code);
  if (match) return code;
  const DIRECT: Record<string, string> = {
    Space: "Space",
    Minus: "Minus",
    Equal: "Equal",
    BracketLeft: "LeftBracket",
    BracketRight: "RightBracket",
    Backslash: "Backslash",
    Semicolon: "Semicolon",
    Quote: "Quote",
    Comma: "Comma",
    Period: "Period",
    Slash: "Slash",
    Backquote: "Grave",
    Enter: "Return",
    NumpadEnter: "Enter",
    Escape: "Escape",
    Backspace: "Backspace",
    Tab: "Tab",
    Delete: "Delete",
    Insert: "Insert",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    ControlLeft: "LeftControl",
    ControlRight: "RightControl",
    ShiftLeft: "LeftShift",
    ShiftRight: "RightShift",
    AltLeft: "LeftAlt",
    AltRight: "RightAlt",
    MetaLeft: "LeftSuper",
    MetaRight: "RightSuper",
    CapsLock: "CapsLock",
  };
  return DIRECT[code] || null;
}

/**
 * Ermittelt den nut-js-Tastennamen für ein Eingabe-Event.
 *
 * @param key  `KeyboardEvent.key`
 * @param code `KeyboardEvent.code`
 * @returns Tastenname aus dem nut-js-`Key`-Enum, oder null
 */
export function resolveNutKeyName(key: string, code?: string): string | null {
  if (typeof key === "string" && Object.prototype.hasOwnProperty.call(KEY_NAME_MAP, key)) {
    return KEY_NAME_MAP[key];
  }
  if (typeof key === "string" && key.length === 1) {
    if (Object.prototype.hasOwnProperty.call(CHAR_NAME_MAP, key)) return CHAR_NAME_MAP[key];
    if (/^[a-zA-Z]$/.test(key)) return key.toUpperCase();
    // Zeichen, die es ohne Umschalttaste nicht gibt ("!", "?", …):
    // über die physische Taste auflösen.
    return nameFromCode(code);
  }
  // F-Tasten und alles andere: Name des Enums direkt versuchen, sonst per code.
  if (typeof key === "string" && /^F\d{1,2}$/.test(key)) return key;
  return nameFromCode(code);
}
