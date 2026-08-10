import { useState } from "react";
import { useAddressBook } from "../hooks/useAddressBook";
import { useTranslation } from "../i18n";
import { ArrowRightIcon, CheckIcon, PencilIcon, TrashIcon, XIcon } from "../components/icons";

interface AddressBookPageProps {
  onConnect: (hostId: string) => void;
}

/**
 * Adressbuch-Ansicht (dritter Sidebar-Punkt im Design, im Code bislang
 * nicht vorhanden). Zeigt ein persistiertes lokales Adressbuch mit Suche,
 * Hinzufügen/Bearbeiten/Löschen und direktem Verbinden je Kontakt.
 *
 * Anders als im statischen Design gibt es hier (noch) keinen echten
 * Online/Offline-Status vom Server - Einträge werden daher unter "Team"
 * gruppiert dargestellt (Favoriten laufen bereits über die eigene
 * Favoriten-Funktion in RecentConnections/ConnectPage).
 */
export function AddressBookPage({ onConnect }: AddressBookPageProps): JSX.Element {
  const t = useTranslation();
  const { entries, addEntry, renameEntry, removeEntry } = useAddressBook();
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newName, setNewName] = useState("");
  const [newId, setNewId] = useState("");

  const query = search.trim().toLowerCase();
  const filtered = entries.filter(
    (e) => !query || e.name.toLowerCase().includes(query) || e.hostId.includes(query),
  );

  function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function startEdit(id: string, name: string): void {
    setEditingId(id);
    setEditValue(name);
  }

  function commitEdit(): void {
    if (editingId) renameEntry(editingId, editValue);
    setEditingId(null);
  }

  function handleRemove(id: string): void {
    if (window.confirm(t.addressBook.confirmDelete)) removeEntry(id);
  }

  function handleAdd(e: React.FormEvent): void {
    e.preventDefault();
    if (!newId.trim()) return;
    addEntry(newName, newId);
    setNewName("");
    setNewId("");
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{t.addressBook.title}</h1>
        <p className="page-subtitle">{t.addressBook.subtitle}</p>
      </div>

      <input
        className="address-book-search"
        style={{
          width: "100%",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: "10px 14px",
          color: "var(--text-primary)",
          fontSize: 14,
          outline: "none",
        }}
        placeholder={t.addressBook.searchPlaceholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {filtered.length === 0 ? (
        <div className="empty-hint">{t.addressBook.empty}</div>
      ) : (
        <div className="address-group">
          <div className="address-group-title">{t.addressBook.groupTeam}</div>
          {filtered.map((entry) => (
            <div className="address-item" key={entry.id}>
              <div className="address-avatar">{initials(entry.name)}</div>
              <div className="address-item-main">
                {editingId === entry.id ? (
                  <input
                    autoFocus
                    className="address-edit-input"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                ) : (
                  <span className="address-item-name">{entry.name}</span>
                )}
                <span className="address-item-id">{entry.hostId}</span>
              </div>

              <div className="recent-item-actions">
                {editingId === entry.id ? (
                  <>
                    <button type="button" className="recent-action-btn" title={t.addressBook.save} onClick={commitEdit}>
                      <CheckIcon size={14} />
                    </button>
                    <button
                      type="button"
                      className="recent-action-btn"
                      title={t.addressBook.cancel}
                      onClick={() => setEditingId(null)}
                    >
                      <XIcon size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="recent-action-btn"
                      title={t.addressBook.edit}
                      onClick={() => startEdit(entry.id, entry.name)}
                    >
                      <PencilIcon size={14} />
                    </button>
                    <button
                      type="button"
                      className="recent-action-btn"
                      title={t.addressBook.delete}
                      onClick={() => handleRemove(entry.id)}
                    >
                      <TrashIcon size={14} />
                    </button>
                    <button
                      type="button"
                      className="id-copy-btn"
                      title={t.addressBook.connect}
                      onClick={() => onConnect(entry.hostId)}
                    >
                      <ArrowRightIcon size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <form className="address-add-form" onSubmit={handleAdd}>
        <input
          placeholder={t.addressBook.namePlaceholder}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <input
          placeholder={t.addressBook.idPlaceholder}
          value={newId}
          onChange={(e) => setNewId(e.target.value)}
        />
        <button type="submit" className="btn btn-primary">
          {t.addressBook.add}
        </button>
      </form>
    </>
  );
}
