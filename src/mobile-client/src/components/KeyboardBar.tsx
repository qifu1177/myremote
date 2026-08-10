import { useEffect, useRef } from "react";
import type { RemoteInputEvent } from "@shared/types";
import {
  SPECIAL_KEYS,
  buildCharEvents,
  buildKeyEvents,
  modifierLabel,
  type ModifierKey,
  type ModifierState,
} from "../lib/keyboardInput";
import type { MobileTexts } from "../i18n";

interface KeyboardBarProps {
  visible: boolean;
  modifiers: ModifierState;
  onToggleModifier: (mod: ModifierKey) => void;
  onSend: (events: RemoteInputEvent[]) => void;
  /** Nach dem Senden eines Zeichens werden Sticky-Modifier zurückgesetzt. */
  onKeySent: () => void;
  hostIsMac: boolean;
  texts: MobileTexts;
  onHide: () => void;
}

const MODIFIERS: ModifierKey[] = ["ctrl", "shift", "alt", "meta"];

/**
 * Tastatur-Leiste über der Bildschirmtastatur.
 *
 * Zwei Bestandteile:
 *  1. Ein unsichtbares, fokussiertes Eingabefeld — nur dadurch öffnet sich auf
 *     iOS/Android überhaupt die Bildschirmtastatur. Eingetippte Zeichen werden
 *     abgefangen, in key-down/key-up übersetzt und das Feld sofort geleert.
 *  2. Eine Leiste mit Modifiern (sticky) und Sondertasten, die es auf der
 *     mobilen Tastatur nicht gibt (Esc, Tab, Pfeile, …).
 */
export function KeyboardBar({
  visible,
  modifiers,
  onToggleModifier,
  onSend,
  onKeySent,
  hostIsMac,
  texts,
  onHide,
}: KeyboardBarProps): JSX.Element | null {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (visible) inputRef.current?.focus();
    else inputRef.current?.blur();
  }, [visible]);

  if (!visible) return null;

  function sendChar(char: string): void {
    onSend(buildCharEvents(char, modifiers));
    onKeySent();
  }

  return (
    <div className="keyboard-bar">
      {/* Unsichtbares Feld: hält den Fokus, damit die Bildschirmtastatur
          geöffnet bleibt. Es wird nach jedem Zeichen wieder geleert. */}
      <input
        ref={inputRef}
        className="hidden-input"
        type="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-label={texts.keyboard}
        onChange={(e) => {
          const value = e.target.value;
          for (const char of value) sendChar(char);
          e.target.value = "";
        }}
        onKeyDown={(e) => {
          // Tasten, die kein Zeichen erzeugen (Enter, Backspace, Pfeile),
          // liefern kein onChange — daher hier direkt behandeln.
          if (e.key.length === 1) return;
          e.preventDefault();
          onSend(buildKeyEvents(e.key, e.code || e.key, modifiers));
          onKeySent();
        }}
      />

      <div className="key-row">
        {MODIFIERS.map((mod) => (
          <button
            key={mod}
            type="button"
            className={`key-btn modifier ${modifiers[mod] ? "active" : ""}`}
            aria-pressed={modifiers[mod]}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => onToggleModifier(mod)}
          >
            {modifierLabel(mod, hostIsMac)}
          </button>
        ))}
        <button type="button" className="key-btn hide-key" onPointerDown={(e) => e.preventDefault()} onClick={onHide}>
          ⌄
        </button>
      </div>

      <div className="key-row scrollable">
        {SPECIAL_KEYS.map((k) => (
          <button
            key={k.id}
            type="button"
            className="key-btn"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              onSend(buildKeyEvents(k.key, k.code, modifiers));
              onKeySent();
            }}
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}
