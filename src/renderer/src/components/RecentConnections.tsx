import { useState } from "react";
import { formatRelativeTime, type RecentConnection } from "../hooks/useRecentConnections";
import { useTranslation } from "../i18n";
import { CheckIcon, PencilIcon, StarIcon, TrashIcon, XIcon } from "./icons";

interface RecentConnectionsProps {
  recents: RecentConnection[];
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
}

type Tab = "history" | "favorites";

export function RecentConnections({
  recents,
  onSelect,
  onToggleFavorite,
  onRename,
  onRemove,
}: RecentConnectionsProps): JSX.Element {
  const t = useTranslation();
  const [tab, setTab] = useState<Tab>("history");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const visible = tab === "favorites" ? recents.filter((r) => r.favorite) : recents;
  const emptyText = tab === "favorites" ? t.recentConnections.emptyFavorites : t.recentConnections.empty;

  function startEdit(r: RecentConnection): void {
    setEditingId(r.id);
    setEditValue(r.name);
  }

  function commitEdit(): void {
    if (editingId) onRename(editingId, editValue);
    setEditingId(null);
  }

  function cancelEdit(): void {
    setEditingId(null);
  }

  function handleRemove(id: string): void {
    if (window.confirm(t.recentConnections.confirmDelete)) {
      onRemove(id);
    }
  }

  return (
    <div>
      <div className="recent-tabs">
        <button
          type="button"
          className={`recent-tab-btn ${tab === "history" ? "active" : ""}`}
          onClick={() => setTab("history")}
        >
          {t.recentConnections.tabHistory}
        </button>
        <button
          type="button"
          className={`recent-tab-btn ${tab === "favorites" ? "active" : ""}`}
          onClick={() => setTab("favorites")}
        >
          {t.recentConnections.tabFavorites}
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="empty-hint">{emptyText}</div>
      ) : (
        <div className="recent-list">
          {visible.map((r) => (
            <div className="recent-item" key={r.id} onClick={() => editingId !== r.id && onSelect(r.id)}>
              <button
                type="button"
                className="recent-favorite-btn"
                title={r.favorite ? t.recentConnections.removeFavorite : t.recentConnections.addFavorite}
                aria-label={r.favorite ? t.recentConnections.removeFavorite : t.recentConnections.addFavorite}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(r.id);
                }}
              >
                <StarIcon size={16} filled={r.favorite} />
              </button>

              <div className="recent-item-main">
                {editingId === r.id ? (
                  <input
                    autoFocus
                    className="recent-edit-input"
                    value={editValue}
                    placeholder={t.recentConnections.editPlaceholder}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                  />
                ) : (
                  <span className="recent-item-name">{r.name}</span>
                )}
                <span className="recent-item-id">{r.id}</span>
              </div>

              <span className="recent-item-time">{formatRelativeTime(r.lastConnectedAt, t.recentConnections)}</span>

              <div className="recent-item-actions" onClick={(e) => e.stopPropagation()}>
                {editingId === r.id ? (
                  <>
                    <button type="button" className="recent-action-btn" title={t.recentConnections.save} onClick={commitEdit}>
                      <CheckIcon size={14} />
                    </button>
                    <button type="button" className="recent-action-btn" title={t.recentConnections.cancel} onClick={cancelEdit}>
                      <XIcon size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="recent-action-btn"
                      title={t.recentConnections.edit}
                      aria-label={t.recentConnections.edit}
                      onClick={() => startEdit(r)}
                    >
                      <PencilIcon size={14} />
                    </button>
                    <button
                      type="button"
                      className="recent-action-btn"
                      title={t.recentConnections.delete}
                      aria-label={t.recentConnections.delete}
                      onClick={() => handleRemove(r.id)}
                    >
                      <TrashIcon size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
