import { useEffect, useRef, useState } from "react";
import type { ChatMessage, Role } from "@shared/types";
import { useTranslation } from "../i18n";

interface ChatPanelProps {
  /** Bisheriger Verlauf, chronologisch aufsteigend. */
  messages: ChatMessage[];
  /** Eigene Rolle — bestimmt, welche Nachrichten als "Du" dargestellt werden. */
  selfRole: Role;
  /** Sendet den Text; wird nur mit nicht-leerem Text aufgerufen. */
  onSend: (text: string) => void;
  /** false, wenn (noch) keine Gegenstelle erreichbar ist — Eingabe bleibt nutzbar. */
  disabled?: boolean;
}

function formatTime(sentAt: number): string {
  return new Date(sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Text-Chat zwischen Host und Controller. Die Nachrichten laufen über den
 * Signaling-Kanal, deshalb ist das Panel bewusst auch dann bedienbar, wenn
 * die Bildschirmverbindung noch nicht steht.
 */
export function ChatPanel({ messages, selfRole, onSend, disabled = false }: ChatPanelProps): JSX.Element {
  const t = useTranslation();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  // Immer die neueste Nachricht zeigen.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="chat-panel">
      <div className="chat-panel-title">{t.chat.title}</div>
      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">{t.chat.empty}</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`chat-message ${m.from === selfRole ? "own" : "other"}`}>
              <div className="chat-message-meta">
                {m.from === selfRole ? t.chat.you : t.chat.partner} · {formatTime(m.sentAt)}
              </div>
              <div className="chat-message-text">{m.text}</div>
            </div>
          ))
        )}
      </div>
      <form className="chat-composer" onSubmit={submit}>
        <input
          type="text"
          value={draft}
          placeholder={t.chat.placeholder}
          aria-label={t.chat.placeholder}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={disabled || draft.trim().length === 0}>
          {t.chat.send}
        </button>
      </form>
      {disabled && <div className="chat-hint">{t.chat.waitingForPeer}</div>}
    </div>
  );
}
