/**
 * Dateiübertragung im Browser-Client (Handy/Tablet/Desktop-Browser).
 *
 * Bug: Übertragen war dort gar nicht möglich. `ControllerSession` konnte es
 * längst (siehe tests/file-transfer-session.test.ts), aber `RemoteScreen.tsx`
 * hat die Datei-Callbacks nie übergeben und hatte keine Bedienoberfläche
 * dafür — der Kanal `myremote-files` blieb also ungenutzt.
 *
 * Die Übertragungsmechanik selbst ist bereits end-to-end abgedeckt; hier wird
 * geprüft, was neu hinzukam: die Verdrahtung in RemoteScreen und die
 * Übersetzungen (laut CLAUDE.md muss ein Schlüssel in ALLEN Sprachen stehen —
 * ein vergessenes Locale fällt sonst erst dem Nutzer auf).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { textsFor, locales, type MobileTexts } from "@mobile/i18n";

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src/mobile-client/src");
const remoteScreen = readFileSync(resolve(srcDir, "components/RemoteScreen.tsx"), "utf8");

describe("Browser-Client: Datei-Verdrahtung in RemoteScreen", () => {
  // Genau diese vier Callbacks fehlten und damit die gesamte Empfangsseite.
  test.each(["onIncomingFile", "onIncomingFileProgress", "onFileReceived", "onFileAborted"])(
    "übergibt %s an die ControllerSession",
    (callback) => {
      expect(remoteScreen).toContain(`${callback}:`);
    },
  );

  test("nutzt den gemeinsamen Übertragungs-Hook der Desktop-App", () => {
    expect(remoteScreen).toContain("useFileTransfers");
  });

  test("zeigt ein Bedienfeld, über das Dateien gesendet werden können", () => {
    expect(remoteScreen).toContain("FilePanel");
    expect(remoteScreen).toContain("sendFiles");
  });
});

describe("Browser-Client: Übersetzungen der Dateiübertragung", () => {
  const fileKeys: (keyof MobileTexts)[] = [
    "files",
    "filesEmpty",
    "filesChoose",
    "filesSave",
    "filesSent",
    "filesWaitingForPeer",
  ];

  test.each(locales)("%s liefert für jeden Datei-Text etwas Lesbares", (locale) => {
    const texts = textsFor(locale);
    for (const key of fileKeys) {
      expect(typeof texts[key], `${locale}.${key}`).toBe("string");
      expect((texts[key] as string).length, `${locale}.${key}`).toBeGreaterThan(0);
    }
  });

  test.each(locales)("%s formatiert Fortschritt und Fehler", (locale) => {
    const texts = textsFor(locale);
    expect(texts.filesProgress(42)).toContain("42");
    expect(texts.filesFailed("unvollständig")).toContain("unvollständig");
  });

  test("alle Sprachen haben denselben Satz an Schlüsseln", () => {
    const reference = Object.keys(textsFor("de")).sort();
    for (const locale of locales) {
      expect(Object.keys(textsFor(locale)).sort(), locale).toEqual(reference);
    }
  });

  test("der Hinweis zum optionalen Passwort steht in allen Sprachen", () => {
    for (const locale of locales) {
      expect(textsFor(locale).passwordOptional.length, locale).toBeGreaterThan(0);
    }
  });
});
