import { useTranslation } from "../i18n";
import { BookIcon, MonitorIcon, SettingsIcon } from "./icons";

export type Page = "connect" | "addressbook" | "settings";

interface SidebarProps {
  active: Page;
  onNavigate: (page: Page) => void;
}

export function Sidebar({ active, onNavigate }: SidebarProps): JSX.Element {
  const t = useTranslation();

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        <button
          className={`sidebar-nav-btn ${active === "connect" ? "active" : ""}`}
          title={t.sidebar.connect}
          onClick={() => onNavigate("connect")}
        >
          <MonitorIcon size={19} />
        </button>
        <button
          className={`sidebar-nav-btn ${active === "addressbook" ? "active" : ""}`}
          title={t.sidebar.addressBook}
          onClick={() => onNavigate("addressbook")}
        >
          <BookIcon size={19} />
        </button>
        <button
          className={`sidebar-nav-btn ${active === "settings" ? "active" : ""}`}
          title={t.sidebar.settings}
          onClick={() => onNavigate("settings")}
        >
          <SettingsIcon size={19} />
        </button>
      </nav>
    </aside>
  );
}
