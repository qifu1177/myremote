import type { ChatMessage, Role } from "@shared/types";

/**
 * Erzeugt eine Chat-Nachricht mit eindeutiger ID und Sendezeitpunkt.
 * Bewusst als eigenes Modul, damit Host- und Controller-Seite exakt dasselbe
 * Format erzeugen.
 */
export function createChatMessage(from: Role, text: string): ChatMessage {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    from,
    text,
    sentAt: Date.now(),
  };
}
