import { useEffect, useState } from "react";
import type { AdminStatFilter } from "@/lib/admin-stat-filter";
import {
  ADMIN_FILTER_PROVINCES,
  deleteNamedFilter,
  readSavedFilters,
  saveNamedFilter,
  savedFilterId,
  savedFilterStorageKey,
  type AdminSavedFilter,
} from "@/lib/admin-saved-filters";
import { adminSavedFiltersFlag } from "@/lib/server/admin-saved-filters";

/** Save, name, and delete the admin list view that is open. */
export function AdminSavedFilters({
  tab,
  stat,
  province,
  docs,
  onApply,
}: {
  tab: string;
  stat?: AdminStatFilter;
  province?: string;
  docs: boolean;
  onApply: (filter: AdminSavedFilter) => void;
}) {
  const [on, setOn] = useState(true);
  const [rows, setRows] = useState<AdminSavedFilter[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    void adminSavedFiltersFlag()
      .then((enabled) => setOn(Boolean(enabled)))
      .catch(() => setOn(true));
    setRows(readSavedFilters(window.localStorage.getItem(savedFilterStorageKey())));
  }, []);

  function write(next: AdminSavedFilter[]) {
    setRows(next);
    window.localStorage.setItem(savedFilterStorageKey(), JSON.stringify(next));
  }

  if (!on) return null;
  return (
    <section className="mb-4 rounded-xl bg-surface px-4 py-3 ring-1 ring-border" data-ke="admin-saved-filters">
      <h2 className="text-sm font-medium">Saved filters</h2>
      <p className="mt-1 text-sm text-muted">Save this list, for example “Unclaimed in ON” or “Docs waiting”.</p>
      {rows.length ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-1">
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-full bg-bg px-3 text-sm ring-1 ring-border touch-manipulation"
                onClick={() => onApply(row)}
              >
                {row.name}
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center text-sm text-muted touch-manipulation"
                aria-label={`Delete ${row.name}`}
                onClick={() => write(deleteNamedFilter(rows, row.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">No saved filters yet.</p>
      )}
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const filter = {
            id: savedFilterId(name),
            name: name.trim(),
            tab,
            stat,
            province: province || undefined,
            docs,
          };
          const parsed = filter.name ? filter : null;
          if (!parsed) return;
          write(saveNamedFilter(rows, parsed));
          setName("");
        }}
      >
        <label className="text-sm">
          Name
          <input
            className="mt-1 h-11 rounded-md border border-border bg-bg px-3"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
          />
        </label>
        <label className="text-sm">
          Province
          <select
            className="mt-1 h-11 rounded-md border border-border bg-bg px-3"
            value={province || ""}
            onChange={(event) => onApply({ id: "draft", name: "draft", tab, stat, province: event.target.value || undefined, docs })}
          >
            <option value="">All provinces</option>
            {ADMIN_FILTER_PROVINCES.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={docs}
            onChange={(event) => onApply({ id: "draft", name: "draft", tab, stat, province, docs: event.target.checked })}
          />
          Docs waiting
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg touch-manipulation">
          Save filter
        </button>
      </form>
    </section>
  );
}
