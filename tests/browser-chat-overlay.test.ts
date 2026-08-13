/**
 * Regressionstest für den Chat auf der Verbindungsmaske des Browser-Clients.
 *
 * Bug: Ein Klick auf „Chat öffnen" blieb wirkungslos — das Overlay wurde zwar
 * gerendert, war aber nicht zu sehen. Ursache war die CSS-Kaskade: Das
 * Element trägt beide Klassen (`chat-overlay connect-chat-overlay`).
 * `.connect-chat-overlay { position: fixed }` und
 * `.chat-overlay { position: absolute }` haben dieselbe Spezifität, und die
 * `.chat-overlay`-Regel steht später in der Datei — also gewann `absolute`.
 * Das Overlay wurde dadurch am Inhaltsanfang des scrollenden
 * `.connect-screen` positioniert und lag bei gescrollter Seite ausserhalb des
 * sichtbaren Bereichs.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const cssPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/mobile-client/src/styles/mobile.css",
);
const css = readFileSync(cssPath, "utf8");

interface Rule {
  selector: string;
  body: string;
  /** Position in der Datei — entscheidet bei gleicher Spezifität. */
  order: number;
}

/** Sehr einfacher Regel-Scanner: reicht für die flachen Regeln dieser Datei. */
function parseRules(source: string): Rule[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  let order = 0;
  while ((match = re.exec(withoutComments)) !== null) {
    const selector = match[1].trim();
    // Verschachtelte At-Regeln (@media …) tragen hier keinen Selektor.
    if (selector.startsWith("@") || selector === "") continue;
    rules.push({ selector, body: match[2], order: order++ });
  }
  return rules;
}

/** Spezifität eines reinen Klassen-/Element-Selektors als (a, b, c)-Tripel. */
function specificity(selector: string): number {
  const ids = (selector.match(/#[\w-]+/g) || []).length;
  const classes = (selector.match(/\.[\w-]+/g) || []).length;
  const elements = (selector.match(/(^|[\s>+~])[a-z]+/gi) || []).length;
  return ids * 10000 + classes * 100 + elements;
}

/** true, wenn der (Klassen-)Selektor auf ein Element mit diesen Klassen passt. */
function matchesClasses(selector: string, classes: string[]): boolean {
  // Nur einfache Selektoren aus aneinandergereihten Klassen berücksichtigen.
  if (!/^(\.[\w-]+)+$/.test(selector)) return false;
  const required = selector.split(".").filter(Boolean);
  return required.every((c) => classes.includes(c));
}

/** Der Wert einer Eigenschaft, der sich für ein Element tatsächlich durchsetzt. */
function winningValue(classes: string[], property: string): string | null {
  const candidates = parseRules(css)
    .filter((rule) =>
      rule.selector
        .split(",")
        .some((part) => matchesClasses(part.trim(), classes)),
    )
    .map((rule) => {
      const declaration = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "i").exec(rule.body);
      return declaration ? { value: declaration[1].trim(), rule } : null;
    })
    .filter((x): x is { value: string; rule: Rule } => x !== null);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const bySpecificity = specificity(a.rule.selector) - specificity(b.rule.selector);
    return bySpecificity !== 0 ? bySpecificity : a.rule.order - b.rule.order;
  });
  return candidates[candidates.length - 1].value;
}

describe("Chat-Overlay auf der Verbindungsmaske (Browser-Client)", () => {
  // So setzt ConnectScreen.tsx die Klassen: className="chat-overlay connect-chat-overlay"
  const connectOverlay = ["chat-overlay", "connect-chat-overlay"];

  test("liegt fix im Sichtfeld — sonst ist es nach dem Klick unsichtbar (Kern des Bugs)", () => {
    expect(winningValue(connectOverlay, "position")).toBe("fixed");
  });

  test("deckt weiterhin den ganzen sichtbaren Bereich ab", () => {
    expect(winningValue(connectOverlay, "inset")).toBe("0");
  });

  test("liegt über dem restlichen Inhalt der Verbindungsmaske", () => {
    const zIndex = winningValue(connectOverlay, "z-index");
    expect(Number(zIndex)).toBeGreaterThan(0);
  });

  test("das Overlay der laufenden Sitzung bleibt absolut in der Bühne", () => {
    // Dort ist `absolute` richtig: Es soll nur das Videobild überdecken.
    expect(winningValue(["chat-overlay"], "position")).toBe("absolute");
  });
});
