import { useEffect, useState } from "react";
import { useTranslation } from "../i18n";
import { EyeIcon, EyeOffIcon } from "./icons";

interface ConnectCardProps {
  onConnect: (hostId: string, password: string) => void;
  connecting: boolean;
  error: string | null;
  initialHostId?: string;
}

export function ConnectCard({ onConnect, connecting, error, initialHostId }: ConnectCardProps): JSX.Element {
  const t = useTranslation();
  const [hostId, setHostId] = useState(initialHostId ?? "");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);

  useEffect(() => {
    if (initialHostId) setHostId(initialHostId);
  }, [initialHostId]);

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    // Das Passwort darf leer bleiben: Gibt der Host ohne Passwort frei
    // (Settings -> Sicherheit), genügt die Partner-ID.
    if (!hostId.trim()) return;
    onConnect(hostId.trim(), password.trim());
  }

  return (
    <div className="card">
      <div className="card-label">{t.connectCard.title}</div>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="hostId">{t.connectCard.partnerId}</label>
          <input
            id="hostId"
            placeholder={t.connectCard.partnerIdPlaceholder}
            value={hostId}
            onChange={(e) => setHostId(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="password">{t.connectCard.password}</label>
          <div className="field-with-action">
            <input
              id="password"
              type={passwordVisible ? "text" : "password"}
              placeholder={t.connectCard.passwordPlaceholder}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
            <button
              type="button"
              className="field-action-btn"
              title={passwordVisible ? t.connectCard.hidePassword : t.connectCard.showPassword}
              onClick={() => setPasswordVisible((v) => !v)}
            >
              {passwordVisible ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
            </button>
          </div>
          <div className="card-hint">{t.connectCard.passwordOptional}</div>
        </div>
        <div className="connect-actions">
          <button type="submit" className="btn btn-primary btn-block" disabled={connecting}>
            {connecting ? t.connectCard.connecting : t.connectCard.connect}
          </button>
        </div>
      </form>
      {error && <div className="error-text">{error}</div>}
      <div className="card-hint">{t.connectCard.hint}</div>
    </div>
  );
}
