import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  deleteSavedSearch,
  getSearchAlertPrefs,
  listSavedSearches,
  listSearchAlertNotices,
  markSearchAlertRead,
  saveSearchAlertPrefs,
  updateSavedSearch,
} from "@/lib/server/saved-searches";
import {
  AGE_BANDS,
  activeFilterCount,
  stashSavedSearchToApply,
  type AgeBand,
  type SavedSearch,
  type SearchAlertNotice,
  type SearchAlertPrefs,
} from "@/lib/saved-search";
import { useCopy } from "@/lib/use-copy";
import { clampRadiusKm } from "@/lib/proximity";

export function SavedSearchesPanel() {
  const { t } = useCopy();
  const navigate = useNavigate();
  const [searches, setSearches] = useState<SavedSearch[] | null>(null);
  const [prefs, setPrefs] = useState<SearchAlertPrefs>({ emailEnabled: true, inAppEnabled: true, updatedAt: null });
  const [notices, setNotices] = useState<SearchAlertNotice[]>([]);
  const [editing, setEditing] = useState<SavedSearch | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);

  async function load() {
    const [list, pref, inbox] = await Promise.all([
      listSavedSearches(),
      getSearchAlertPrefs(),
      listSearchAlertNotices(),
    ]);
    setSearches(list);
    setPrefs(pref);
    setNotices(inbox);
  }

  useEffect(() => {
    void load().catch(() => {
      setSearches([]);
    });
  }, []);

  function openSearch(search: SavedSearch) {
    stashSavedSearchToApply(search);
    void navigate({ to: "/search", search: { q: search.centerLabel } });
  }

  return (
    <div className="mt-6 space-y-8">
      <section>
        <h2 className="font-display text-2xl">{t("alertPrefs")}</h2>
        <p className="mt-1 text-sm text-muted">{t("alertPrefsLead")}</p>
        <div className="mt-3 space-y-2 rounded-xl bg-surface p-4 ring-1 ring-border">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={prefs.emailEnabled}
              onChange={(e) => setPrefs((cur) => ({ ...cur, emailEnabled: e.target.checked }))}
            />
            <span>{t("alertEmail")}</span>
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={prefs.inAppEnabled}
              onChange={(e) => setPrefs((cur) => ({ ...cur, inAppEnabled: e.target.checked }))}
            />
            <span>{t("alertInApp")}</span>
          </label>
          <p className="text-xs text-subtle">{t("alertPushOff")}</p>
          <Button
            size="sm"
            disabled={savingPrefs}
            onClick={() => {
              setSavingPrefs(true);
              void saveSearchAlertPrefs({ data: { emailEnabled: prefs.emailEnabled, inAppEnabled: prefs.inAppEnabled } })
                .then((next) => {
                  setPrefs(next);
                  toast.success(t("alertPrefsSaved"));
                })
                .catch((err) => toast.error(err instanceof Error ? err.message : t("alertPrefs")))
                .finally(() => setSavingPrefs(false));
            }}
          >
            {t("save")}
          </Button>
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl">{t("savedSearches")}</h2>
        {searches === null ? (
          <div className="mt-3 space-y-2" aria-hidden="true">
            <div className="ke-skel h-20 w-full rounded-xl" />
            <div className="ke-skel h-20 w-full rounded-xl" />
          </div>
        ) : searches.length === 0 ? (
          <div className="mt-3 rounded-xl bg-surface ring-1 ring-border">
            <EmptyState title={t("noSavedSearches")} body={t("noSavedSearchesLead")} action={t("emptyFindCare")} actionTo="/search" />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
            {searches.map((search) => {
              const extra = activeFilterCount(search.filters, search.ageBand);
              const editingThis = editing?.id === search.id;
              return (
                <li key={search.id} className="p-4">
                  {editingThis ? (
                    <SavedSearchEditor
                      search={editing}
                      onCancel={() => setEditing(null)}
                      onSaved={(next) => {
                        setSearches((cur) => (cur ?? []).map((s) => (s.id === next.id ? next : s)));
                        setEditing(null);
                        toast.success(t("savedSearchUpdated"));
                      }}
                    />
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{search.name}</p>
                          <p className="text-sm text-muted">
                            {search.centerLabel} · {search.radiusKm} km
                            {search.ageBand !== "any" ? ` · ${t(search.ageBand)}` : ` · ${t("anyAge")}`}
                            {extra ? ` · ${extra} ${t("filters").toLowerCase()}` : ""}
                          </p>
                          <p className="mt-1 text-xs text-subtle">
                            {search.alertsEnabled ? t("searchAlertsOn") : t("searchAlertsOff")}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="secondary" onClick={() => openSearch(search)}>
                            {t("runSavedSearch")}
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setEditing(search)}>
                            {t("editSavedSearch")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger"
                            onClick={() => {
                              void deleteSavedSearch({ data: { id: search.id } })
                                .then(() => {
                                  setSearches((cur) => (cur ?? []).filter((s) => s.id !== search.id));
                                  toast.success(t("savedSearchDeleted"));
                                })
                                .catch((err) => toast.error(err instanceof Error ? err.message : t("deleteSavedSearch")));
                            }}
                          >
                            {t("deleteSavedSearch")}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl">{t("alertNotices")}</h2>
          {notices.some((n) => !n.readAt) ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void markSearchAlertRead({ data: { all: true } })
                  .then(() => setNotices((cur) => cur.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))))
                  .catch(() => undefined);
              }}
            >
              {t("markAlertsRead")}
            </Button>
          ) : null}
        </div>
        {notices.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t("noAlertNotices")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
            {notices.map((n) => (
              <li key={n.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className={n.readAt ? "text-sm text-muted" : "text-sm font-medium"}>
                    {n.kind === "vacancy_reconfirmed" ? t("alertVacancy") : t("alertNewCentre")}
                  </p>
                  <p className="font-medium">{n.title}</p>
                  {n.body ? <p className="text-sm text-muted">{n.body}</p> : null}
                </div>
                {n.daycareId ? (
                  <Button size="sm" variant="secondary" asChild>
                    <Link to="/search">{t("emptyFindCare")}</Link>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SavedSearchEditor({
  search,
  onCancel,
  onSaved,
}: {
  search: SavedSearch;
  onCancel: () => void;
  onSaved: (next: SavedSearch) => void;
}) {
  const { t } = useCopy();
  const [name, setName] = useState(search.name);
  const [radiusKm, setRadiusKm] = useState(search.radiusKm);
  const [ageBand, setAgeBand] = useState<AgeBand>(search.ageBand);
  const [alertsEnabled, setAlertsEnabled] = useState(search.alertsEnabled);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void updateSavedSearch({
          data: { id: search.id, name, radiusKm: clampRadiusKm(radiusKm), ageBand, alertsEnabled },
        })
          .then(onSaved)
          .catch((err) => toast.error(err instanceof Error ? err.message : t("editSavedSearch")))
          .finally(() => setBusy(false));
      }}
    >
      <label className="block text-sm">
        <span className="font-medium">{t("saveSearchName")}</span>
        <input
          className="ke-input mt-1 w-full"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">{t("searchAlertRadius")}</span>
        <input
          type="number"
          min={1}
          max={50}
          className="ke-input mt-1 w-24"
          value={radiusKm}
          onChange={(e) => setRadiusKm(Number(e.target.value))}
        />
        <span className="ml-2 text-muted">{t("km")}</span>
      </label>
      <div className="flex flex-wrap gap-2">
        {AGE_BANDS.map((band) => (
          <button
            key={band}
            type="button"
            onClick={() => setAgeBand(band)}
            className={
              ageBand === band
                ? "min-h-11 rounded-full bg-fg px-3 py-1.5 text-sm text-bg ring-1 ring-fg"
                : "min-h-11 rounded-full px-3 py-1.5 text-sm ring-1 ring-border"
            }
          >
            {band === "any" ? t("anyAge") : t(band)}
          </button>
        ))}
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={alertsEnabled}
          onChange={(e) => setAlertsEnabled(e.target.checked)}
        />
        {alertsEnabled ? t("searchAlertsOn") : t("searchAlertsOff")}
      </label>
      <p className="text-xs text-subtle">{search.centerLabel}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy || !name.trim()}>
          {t("save")}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
          {t("back")}
        </Button>
      </div>
    </form>
  );
}
