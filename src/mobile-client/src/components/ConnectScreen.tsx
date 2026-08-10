import { useEffect, useState } from "react";
import type { MobileSettings } from "../hooks/useMobileSettings";
import type { DeviceInfo } from "../hooks/useDeviceClass";
import { locales, localeLabels, type Locale, type MobileTexts } from "../i18n";
import type { RecentEntry } from "../hooks/useMobileSettings";

interface ConnectScreenProps {
  texts: MobileTexts;
  locale: Locale;
  onChangeLocale: (locale: Locale) => void;
  settings: MobileSettings;
  onUpdateSettings: (patch: Partial<MobileSettings>) => void;
  recents: RecentEntry[];
  onRemoveRecent: (hostId: string) => void;
  onClearRecents: () => void;
  prefill: { hostId: string; password: string };
  device: DeviceInfo;
  onConnect: (hostId: string, password: string) => void;
}

/** Formatiert eine ID als "482 913 607" (nur zur Anzeige/Eingabehilfe). */
function formatId(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 12);
  return digits.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
}

/**
 * Startbildschirm: Partner-ID + Passwort eingeben und verbinden.
 * Das Layout ist einspaltig auf dem Handy und zweispaltig ab Tablet-Breite
 * (siehe mobile.css) — die Komponente selbst bleibt layout-agnostisch.
 */
export function ConnectScreen({
  texts,
  locale,
  onChangeLocale,
  settings,
  onUpdateSettings,
  recents,
  onRemoveRecent,
  onClearRecents,
  prefill,
  device,
  onConnect,
}: ConnectScreenProps): JSX.Element {
  const [hostId, setHostId] = useState(prefill.hostId);
  const [password, setPassword] = useState(prefill.password);
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showGestures, setShowGestures] = useState(false);

  useEffect(() => {
    if (prefill.hostId) setHostId(formatId(prefill.hostId));
    if (prefill.password) setPassword(prefill.password);
  }, [prefill.hostId, prefill.password]);

  const canConnect = hostId.replace(/\s/g, "").length > 0 && password.length > 0;

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    if (!canConnect) return;
    onConnect(hostId.replace(/\s/g, ""), password);
  }

  return (
    <div className="connect-screen">
      <header className="connect-header">
        <div className="brand">
          <span className="brand-dot" aria-hidden="true" />
          <div>
            <h1 className="brand-title">{texts.appName}</h1>
            <p className="brand-tagline">{texts.tagline}</p>
          </div>
        </div>
        <select
          className="locale-select"
          value={locale}
          aria-label="Language"
          onChange={(e) => onChangeLocale(e.target.value as Locale)}
        >
          {locales.map((l) => (
            <option key={l} value={l}>
              {localeLabels[l]}
            </option>
          ))}
        </select>
      </header>

      <div className="connect-body">
        <form className="card connect-form" onSubmit={submit}>
          <label className="field">
            <span className="field-label">{texts.hostId}</span>
            <input
              className="field-input id-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="next"
              placeholder={texts.hostIdPlaceholder}
              value={hostId}
              onChange={(e) => setHostId(formatId(e.target.value))}
            />
          </label>

          <label className="field">
            <span className="field-label">{texts.password}</span>
            <div className="field-with-action">
              <input
                className="field-input"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="go"
                placeholder={texts.passwordPlaceholder}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="inline-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={texts.password}
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>
          </label>

          <button type="submit" className="btn btn-primary btn-lg" disabled={!canConnect}>
            {texts.connect}
          </button>

          <button type="button" className="link-btn" onClick={() => setShowAdvanced((v) => !v)}>
            {texts.advanced} {showAdvanced ? "▴" : "▾"}
          </button>

          {showAdvanced && (
            <div className="advanced-block">
              <label className="field">
                <span className="field-label">{texts.server}</span>
                <input
                  className="field-input"
                  type="url"
                  inputMode="url"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={settings.signalingUrl}
                  onChange={(e) => onUpdateSettings({ signalingUrl: e.target.value })}
                />
                <span className="field-hint">{texts.serverHint}</span>
              </label>

              <div className="field">
                <span className="field-label">{texts.settings}</span>
                <div className="segmented" role="group">
                  <button
                    type="button"
                    className={`segmented-item ${settings.mode === "trackpad" ? "active" : ""}`}
                    onClick={() => onUpdateSettings({ mode: "trackpad" })}
                  >
                    {texts.modeTrackpad}
                  </button>
                  <button
                    type="button"
                    className={`segmented-item ${settings.mode === "direct" ? "active" : ""}`}
                    onClick={() => onUpdateSettings({ mode: "direct" })}
                  >
                    {texts.modeDirect}
                  </button>
                </div>
                <span className="field-hint">{texts.modeHint}</span>
              </div>

              <label className="field">
                <span className="field-label">
                  {texts.sensitivity} · {settings.sensitivity.toFixed(1)}×
                </span>
                <input
                  className="range-input"
                  type="range"
                  min={0.5}
                  max={3}
                  step={0.1}
                  value={settings.sensitivity}
                  onChange={(e) => onUpdateSettings({ sensitivity: Number(e.target.value) })}
                />
              </label>

              <label className="switch-row">
                <span>{texts.naturalScroll}</span>
                <input
                  type="checkbox"
                  checked={settings.naturalScroll}
                  onChange={(e) => onUpdateSettings({ naturalScroll: e.target.checked })}
                />
              </label>
            </div>
          )}
        </form>

        <aside className="side-column">
          {recents.length > 0 && (
            <section className="card">
              <div className="card-head">
                <h2 className="card-title">{texts.recent}</h2>
                <button type="button" className="link-btn" onClick={onClearRecents}>
                  {texts.clearRecent}
                </button>
              </div>
              <ul className="recent-list">
                {recents.map((r) => (
                  <li key={r.hostId} className="recent-item">
                    <button type="button" className="recent-main" onClick={() => setHostId(formatId(r.hostId))}>
                      <span className="recent-id">{formatId(r.hostId)}</span>
                    </button>
                    <button
                      type="button"
                      className="inline-btn"
                      aria-label={texts.clearRecent}
                      onClick={() => onRemoveRecent(r.hostId)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <button type="button" className="card-head as-button" onClick={() => setShowGestures((v) => !v)}>
              <h2 className="card-title">{texts.gesturesTitle}</h2>
              <span aria-hidden="true">{showGestures || device.deviceClass !== "phone" ? "▴" : "▾"}</span>
            </button>
            {(showGestures || device.deviceClass !== "phone") && (
              <ul className="gesture-list">
                {texts.gestures.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            )}
          </section>

          {device.isIOS && <p className="install-hint">{texts.installHint}</p>}
        </aside>
      </div>
    </div>
  );
}
