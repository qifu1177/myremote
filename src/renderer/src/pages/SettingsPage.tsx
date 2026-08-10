import { useState } from "react";
import type { AppInfo } from "@shared/types";
import { locales, useLanguage } from "../i18n";
import type { Locale } from "../i18n";
import type { AppSettings, StreamQuality } from "../hooks/useAppSettings";
import { Switch } from "../components/Switch";

interface SettingsPageProps {
  signalingUrl: string;
  onChangeSignalingUrl: (url: string) => void;
  appInfo: AppInfo | null;
  settings: AppSettings;
  onUpdateSecurity: (patch: Partial<AppSettings["security"]>) => void;
  onUpdateDisplay: (patch: Partial<AppSettings["display"]>) => void;
  onUpdateNetwork: (patch: Partial<AppSettings["network"]>) => void;
}

type SettingsSection = "general" | "security" | "display" | "language" | "network";

export function SettingsPage({
  signalingUrl,
  onChangeSignalingUrl,
  appInfo,
  settings,
  onUpdateSecurity,
  onUpdateDisplay,
  onUpdateNetwork,
}: SettingsPageProps): JSX.Element {
  const { locale, setLocale, t } = useLanguage();
  const [section, setSection] = useState<SettingsSection>("general");

  const navItems: { key: SettingsSection; label: string }[] = [
    { key: "general", label: t.settingsPage.navGeneral },
    { key: "security", label: t.settingsPage.navSecurity },
    { key: "display", label: t.settingsPage.navDisplay },
    { key: "language", label: t.settingsPage.navLanguage },
    { key: "network", label: t.settingsPage.navNetwork },
  ];

  const qualityOptions: { key: StreamQuality; title: string; hint: string }[] = [
    { key: "best", title: t.settingsPage.qualityBest, hint: t.settingsPage.qualityBestHint },
    { key: "balanced", title: t.settingsPage.qualityBalanced, hint: t.settingsPage.qualityBalancedHint },
    { key: "fast", title: t.settingsPage.qualityFast, hint: t.settingsPage.qualityFastHint },
  ];

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{t.settingsPage.title}</h1>
        <p className="page-subtitle">{t.settingsPage.subtitle}</p>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`settings-nav-item ${section === item.key ? "active" : ""}`}
              onClick={() => setSection(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {section === "general" && (
            <div className="card" style={{ maxWidth: 480 }}>
              <div className="card-label">{t.settingsPage.signalingServer}</div>
              <div className="field">
                <label htmlFor="signalingUrl">{t.settingsPage.websocketUrl}</label>
                <input
                  id="signalingUrl"
                  value={signalingUrl}
                  onChange={(e) => onChangeSignalingUrl(e.target.value)}
                  placeholder="ws://localhost:8787"
                />
              </div>
              <div className="card-hint">
                {t.settingsPage.signalingHintPrefix} <code>ws://localhost:8787</code>{" "}
                {t.settingsPage.signalingHintSuffix} <code>ws://192.168.1.20:8787</code>.
              </div>
            </div>
          )}

          {section === "general" && (
            <div className="card" style={{ maxWidth: 480, marginTop: 20 }}>
              <div className="card-label">{t.settingsPage.systemInfo}</div>
              <div className="card-hint" style={{ marginTop: 0 }}>
                {t.settingsPage.platform(appInfo?.platform ?? "…")}
              </div>
            </div>
          )}

          {section === "security" && (
            <div className="card" style={{ maxWidth: 480 }}>
              <div className="card-label">{t.settingsPage.securityTitle}</div>
              <div className="switch-row">
                <div>
                  <div className="switch-row-label">{t.settingsPage.randomPasswordOnStart}</div>
                  <div className="switch-row-hint">{t.settingsPage.randomPasswordOnStartHint}</div>
                </div>
                <Switch
                  checked={settings.security.randomPasswordOnStart}
                  onChange={(next) => onUpdateSecurity({ randomPasswordOnStart: next })}
                  label={t.settingsPage.randomPasswordOnStart}
                />
              </div>
              <div className="switch-row">
                <div>
                  <div className="switch-row-label">{t.settingsPage.confirmEachConnection}</div>
                  <div className="switch-row-hint">{t.settingsPage.confirmEachConnectionHint}</div>
                </div>
                <Switch
                  checked={settings.security.confirmEachConnection}
                  onChange={(next) => onUpdateSecurity({ confirmEachConnection: next })}
                  label={t.settingsPage.confirmEachConnection}
                />
              </div>
              <div className="switch-row">
                <div>
                  <div className="switch-row-label">{t.settingsPage.twoFactor}</div>
                  <div className="switch-row-hint">{t.settingsPage.twoFactorHint}</div>
                </div>
                <Switch checked={false} onChange={() => {}} disabled label={t.settingsPage.twoFactor} />
              </div>
            </div>
          )}

          {section === "display" && (
            <div className="card" style={{ maxWidth: 480 }}>
              <div className="card-label">{t.settingsPage.displayTitle}</div>
              <div className="quality-options">
                {qualityOptions.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    className={`quality-option ${settings.display.quality === opt.key ? "active" : ""}`}
                    onClick={() => onUpdateDisplay({ quality: opt.key })}
                  >
                    <div className="quality-option-title">{opt.title}</div>
                    <div className="quality-option-hint">{opt.hint}</div>
                  </button>
                ))}
              </div>
              <div className="switch-row" style={{ marginTop: 8 }}>
                <div className="switch-row-label">{t.settingsPage.showRemoteCursor}</div>
                <Switch
                  checked={settings.display.showRemoteCursor}
                  onChange={(next) => onUpdateDisplay({ showRemoteCursor: next })}
                  label={t.settingsPage.showRemoteCursor}
                />
              </div>
              <div className="switch-row">
                <div className="switch-row-label">{t.settingsPage.fitToWindow}</div>
                <Switch
                  checked={settings.display.fitToWindow}
                  onChange={(next) => onUpdateDisplay({ fitToWindow: next })}
                  label={t.settingsPage.fitToWindow}
                />
              </div>
            </div>
          )}

          {section === "language" && (
            <div className="card" style={{ maxWidth: 480 }}>
              <div className="card-label">{t.settingsPage.language}</div>
              <div className="field">
                <label htmlFor="locale">{t.settingsPage.language}</label>
                <select id="locale" value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
                  {locales.map((l) => (
                    <option key={l} value={l}>
                      {t.languages[l]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="card-hint" style={{ marginTop: 0 }}>
                {t.settingsPage.languageHint}
              </div>
            </div>
          )}

          {section === "network" && (
            <div className="card" style={{ maxWidth: 480 }}>
              <div className="card-label">{t.settingsPage.networkTitle}</div>
              <div className="switch-row-hint" style={{ marginBottom: 14 }}>
                {t.settingsPage.relayServerHint}
              </div>
              <div className="switch-row">
                <div>
                  <div className="switch-row-label">{t.settingsPage.directIpAccess}</div>
                  <div className="switch-row-hint">{t.settingsPage.directIpAccessHint}</div>
                </div>
                <Switch
                  checked={settings.network.directIpAccess}
                  onChange={(next) => onUpdateNetwork({ directIpAccess: next })}
                  label={t.settingsPage.directIpAccess}
                />
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label htmlFor="networkPort">{t.settingsPage.port}</label>
                <input
                  id="networkPort"
                  value={settings.network.port}
                  onChange={(e) => onUpdateNetwork({ port: e.target.value })}
                  placeholder="8787"
                />
              </div>
              <div className="card-hint" style={{ marginTop: 0 }}>
                {t.settingsPage.networkHint}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
