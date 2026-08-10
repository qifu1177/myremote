/**
 * Wiederverwendbarer Pill-Switch (An/Aus-Schalter), analog zum Design
 * (RemoteDesktopApp.html: switchStyle()). Ersetzt einfache Checkboxen in
 * den Einstellungs-Bereichen Sicherheit/Anzeige/Netzwerk.
 */
interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}

export function Switch({ checked, onChange, disabled, label }: SwitchProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? "on" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  );
}
