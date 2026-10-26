import { useEffect, useState } from "react";
import { ViewAsButton } from "@/components/view-as-button";
import { searchViewAsTargets } from "@/lib/server/view-as-api";
import type { ViewAsTarget } from "@/lib/view-as-public";
import { useCopy } from "@/lib/use-copy";
import { useSessionDesks } from "@/components/desk-switcher";
import { canUseOperatorTools } from "@/lib/operator-tools";
import type { CopyKey } from "@/lib/copy";

const KIND_KEY: Record<ViewAsTarget["kind"], CopyKey> = {
  parent: "viewAsParent",
  daycare: "viewAsDaycare",
  staff: "viewAsStaff",
};

export function AdminViewAsPicker() {
  const { t } = useCopy();
  const { session } = useSessionDesks();
  const operator = canUseOperatorTools(session?.email);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ViewAsTarget[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const needle = query.trim();
    if (!operator || needle.length < 2) {
      setRows([]);
      setError("");
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchViewAsTargets({ data: needle })
        .then((found) => {
          if (!cancelled) {
            setRows(found);
            setError("");
          }
        })
        .catch(() => {
          if (!cancelled) {
            setRows([]);
            setError(t("viewAsFailed"));
          }
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [operator, query, t]);

  if (!operator) return null;

  return (
    <section className="mb-6 rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="view-as-picker">
      <h2 id="view-as-search-title" className="font-display text-2xl">
        {t("viewAsSearchLabel")}
      </h2>
      <p id="view-as-search-help" className="mt-1 text-sm text-muted">
        {t("viewAsSearchHelp")}
      </p>
      <label className="mt-4 block text-sm" htmlFor="view-as-search">
        <span className="sr-only">{t("viewAsSearchPlaceholder")}</span>
        <input
          id="view-as-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("viewAsSearchPlaceholder")}
          autoComplete="off"
          aria-labelledby="view-as-search-title"
          aria-describedby="view-as-search-help"
          className="mt-1 h-11 w-full rounded-full bg-surface px-4 text-sm ring-1 ring-border"
          data-ke="view-as-search"
        />
      </label>
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {query.trim().length >= 2 || rows.length > 0 ? (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl ring-1 ring-border">
          {query.trim().length >= 2 && rows.length === 0 && !error ? (
            <li className="p-4 text-sm text-muted">{t("viewAsEmpty")}</li>
          ) : null}
          {rows.map((row) => (
            <li key={row.userId} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-medium">{row.name?.trim() || "—"}</p>
                <p className="mt-1 text-sm">{row.email || "—"}</p>
                <p className="text-sm text-muted">
                  {t(KIND_KEY[row.kind])}
                  {row.city ? ` · ${row.city}` : ""}
                </p>
              </div>
              <ViewAsButton userId={row.userId} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
