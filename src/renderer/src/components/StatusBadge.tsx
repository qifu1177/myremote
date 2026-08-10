type Status = "idle" | "live" | "error";

export function StatusBadge({ status, children }: { status: Status; children: React.ReactNode }): JSX.Element {
  return (
    <span className={`status-badge ${status !== "idle" ? status : ""}`}>
      <span className="dot" />
      {children}
    </span>
  );
}
