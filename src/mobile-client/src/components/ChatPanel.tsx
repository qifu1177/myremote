import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@shared/types";
import type { MobileTexts } from "../i18n";

interface ChatPanelProps {
  /** Bisheriger Verlauf, chronologisch aufsteigend. */
  messages: ChatMessage[];
  /** Sendet den Text; wird nur mit nicht-leerem Text aufgerufen. */
  onSend: (text: string) => void;
  onClose: () => void;
  texts: MobileTexts;
}

function formatTime(sentAt: number): string {
  return new Date(sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Chat-Ansicht des Mobile-/Browser-Clients.
 *
 * Der Chat läuft — wie in der Desktop-App — über den Signaling-Kanal und ist
 * deshalb auch nutzbar, solange (noch) kein Bildschirm freigegeben ist.
 */
export function ChatPanel({ messages, onSend, onClose, texts }: ChatPanelProps): JSX.Element {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

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
    <section className="chat-panel" aria-label={texts.chat}>
      <header className="chat-panel-head">
        <span className="chat-panel-title">{texts.chat}</span>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {texts.close}
        </button>
      </header>
      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 ? (
          <p className="chat-empty">{texts.chatEmpty}</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`chat-message ${m.from === "controller" ? "own" : "other"}`}>
              <div className="chat-message-meta">
                {m.from === "controller" ? texts.chatYou : texts.chatPartner} · {formatTime(m.sentAt)}
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
          placeholder={texts.chatPlaceholder}
          aria-label={texts.chatPlaceholder}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={draft.trim().length === 0}>
          {texts.chatSend}
        </button>
      </form>
    </section>
  );
}
