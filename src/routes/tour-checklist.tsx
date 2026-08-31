import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/tour-checklist")({ component: TourChecklist });

export function TourChecklist() {
  const { t } = useCopy();
  const items = ["tourQ1", "tourQ2", "tourQ3", "tourQ4", "tourQ5", "tourQ6"] as const;
  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-2xl py-12">
        <p className="text-sm font-semibold tracking-wide text-primary">{t("bookTour")}</p>
        <h1 className="mt-2 text-4xl">{t("tourChecklist")}</h1>
        <p className="mt-4 text-muted">{t("tourChecklistLead")}</p>
        <ol className="mt-8 space-y-4">
          {items.map((key, i) => (
            <li key={key} className="flex gap-3 rounded-xl bg-surface p-4 ring-1 ring-border">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {i + 1}
              </span>
              <p>{t(key)}</p>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-sm">
          <Link to="/benefits" className="font-medium text-primary hover:underline">
            {t("benefitsTab")}
          </Link>
        </p>
      </main>
      <SiteFooter />
    </Shell>
  );
}
