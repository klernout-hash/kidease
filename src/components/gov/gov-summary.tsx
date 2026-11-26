import { GOV_GROUPS, govGroupPages, govPageHref, govPageTitle, type GovLeaf } from "@/lib/gov/desk";

export type GovSummaryItem = { leaf: GovLeaf; state: string; label: string; value: number | null; tone: string | null };

type L = "en" | "fr";
const tx = (locale: L, en: string, fr: string) => (locale === "fr" ? fr : en);

const TONE: Record<string, string> = {
  bad: "ring-2 ring-red-600/60",
  warn: "ring-2 ring-amber-500/60",
};

/** Summary first: one number per section, then a plain menu to every page. */
export function GovSummary({ locale, items }: { locale: L; items: GovSummaryItem[] }) {
  return (
    <section className="mt-2" data-ke="gov-summary">
      <h2 className="font-display text-xl">{tx(locale, "Today at a glance", "Aujourd’hui en bref")}</h2>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4" data-ke="gov-summary-tiles">
        {items.map((item) => {
          const live = item.state === "live";
          return (
            <li key={item.leaf}>
              <a
                href={govPageHref(locale, item.leaf)}
                className={`flex min-h-24 flex-col justify-between rounded-xl bg-surface p-3 touch-manipulation hover:bg-surface-2 ${(live && item.tone && TONE[item.tone]) || "ring-1 ring-border"}`}
                data-ke="gov-summary-tile"
                data-leaf={item.leaf}
              >
                <span className="text-sm font-medium">{govPageTitle(item.leaf, locale)}</span>
                <span className="font-display text-2xl">{live && item.value !== null ? item.value : "—"}</span>
                <span className="text-xs text-muted">
                  {live ? item.label : item.state === "off" ? tx(locale, "Turned off", "Désactivé") : tx(locale, "Not connected yet", "Pas encore relié")}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      <nav className="mt-6 grid gap-4 sm:grid-cols-2" aria-label={tx(locale, "All desk pages", "Toutes les pages du bureau")} data-ke="gov-summary-menu">
        {GOV_GROUPS.filter((group) => group.id !== "overview").map((group) => (
          <div key={group.id}>
            <h3 className="text-sm font-semibold">{locale === "fr" ? group.fr : group.en}</h3>
            <ul className="mt-1 flex flex-wrap gap-x-4">
              {govGroupPages(group.id).map((page) => (
                <li key={page.leaf}>
                  <a className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline" href={govPageHref(locale, page.leaf)}>
                    {locale === "fr" ? page.fr : page.en}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </section>
  );
}
