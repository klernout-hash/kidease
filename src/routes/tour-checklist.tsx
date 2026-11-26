import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FeelBanner } from "@/components/building-photo";
import { Shell } from "@/components/shell";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";
import { MARKETING_PAGE_SEO, pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/tour-checklist")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO.tourChecklist),
  component: TourChecklist,
});

const TOUR_DONE_KEY = "ke-tour-checklist";

export function TourChecklist() {
  const { t, locale } = useCopy();
  const items = ["tourQ1", "tourQ2", "tourQ3", "tourQ4", "tourQ5", "tourQ6"] as const;
  // G1: parents tick items off during the tour. Kept on this device only.
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TOUR_DONE_KEY) ?? "[]");
      if (Array.isArray(saved)) setDone(saved.filter((v): v is string => typeof v === "string"));
    } catch {
      /* private mode */
    }
  }, []);
  function toggle(key: string, on: boolean) {
    const next = on ? [...new Set([...done, key])] : done.filter((v) => v !== key);
    setDone(next);
    try {
      localStorage.setItem(TOUR_DONE_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
  }
  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-2xl py-12">
        <p className="text-sm font-semibold tracking-wide text-primary">{t("bookTour")}</p>
        <h1 className="mt-2 text-4xl">{t("tourChecklist")}</h1>
        <p className="mt-4 text-muted">{t("tourChecklistLead")}</p>
        <FeelBanner src="/photos/playroom.jpg" className="mt-8" />
        <ol className="mt-8 space-y-4" data-ke="tour-checklist">
          {items.map((key) => (
            <li key={key} className="rounded-xl bg-surface ring-1 ring-border">
              <label className="flex min-h-11 cursor-pointer items-start gap-3 p-4">
                <input
                  type="checkbox"
                  className="mt-0.5 size-6 shrink-0 accent-[var(--color-primary)]"
                  checked={done.includes(key)}
                  onChange={(e) => toggle(key, e.target.checked)}
                />
                <span className={done.includes(key) ? "text-muted line-through" : undefined}>{t(key)}</span>
              </label>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-sm">
          <Link to={localePath("/benefits", locale)} className="inline-flex min-h-11 items-center font-medium text-primary hover:underline">
            {t("benefitsTab")}
          </Link>
        </p>
      </main>
    </Shell>
  );
}
