import { GOV_MENU, govMenuHref } from "@/lib/gov/menu";
import type { GovLocale } from "@/lib/gov/aggregate";

/** Five desk pages. The same row on every government screen. */
export function GovDeskNav({
  locale,
  pathname,
  province,
  orgName,
}: {
  locale: GovLocale;
  pathname: string;
  province?: string;
  orgName?: string;
}) {
  const fr = locale === "fr";
  const browse = fr ? "/fr/search" : "/search";
  return (
    <nav className="mt-4" data-ke="gov-desk-nav" aria-label={fr ? "Pages du bureau" : "Government desk pages"}>
      <p className="text-sm text-muted" data-ke="gov-scope">
        {province ? `${fr ? "Province" : "Province"}: ${province}` : null}
        {province && orgName ? " · " : null}
        {orgName || null}
      </p>
      <div className="mt-2 flex gap-2 overflow-x-auto">
        {GOV_MENU.map((item) => {
          const href = govMenuHref(locale, item.id);
          const current = pathname === href;
          return (
            <a
              key={item.id}
              href={href}
              aria-current={current ? "page" : undefined}
              data-ke="gov-task"
              className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold"
            >
              {fr ? item.fr : item.en}
            </a>
          );
        })}
        <a className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-primary" href={browse} data-ke="gov-browse-public">
          {fr ? "Voir les fiches publiques" : "Browse public listings"}
        </a>
      </div>
    </nav>
  );
}
