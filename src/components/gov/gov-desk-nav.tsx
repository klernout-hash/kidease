import { deskGroups } from "@/lib/gov/sections";
import { govCopy } from "@/lib/gov/copy";
import type { GovLocale } from "@/lib/gov/aggregate";

/** Real government pages. Province scope stays on the desk. Public listings are a separate link. */
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
  const copy = govCopy(locale);
  const fr = locale === "fr";
  const links = deskGroups(locale, copy, pathname === "/gov" || pathname === "/fr/gov").flatMap((group) => group.links);
  const browse = fr ? "/fr/search" : "/search";
  return (
    <nav className="mt-4" data-ke="gov-desk-nav" aria-label={fr ? "Pages du bureau" : "Government desk pages"}>
      <p className="text-sm text-muted" data-ke="gov-scope">
        {province ? `${copy.province}: ${province}` : null}
        {province && orgName ? " · " : null}
        {orgName ? `${copy.org}: ${orgName}` : null}
      </p>
      <div className="mt-2 hidden flex-wrap gap-2 lg:flex">
        <GovLinks links={links} pathname={pathname} />
        <a className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-primary" href={browse} data-ke="gov-browse-public">
          {fr ? "Voir les fiches publiques" : "Browse public listings"}
        </a>
      </div>
      <details className="mt-2 lg:hidden">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-base font-semibold">
          {fr ? "Pages du bureau" : "Desk pages"}
        </summary>
        <div className="mt-2 flex flex-col gap-1">
          <GovLinks links={links} pathname={pathname} />
          <a className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-primary" href={browse} data-ke="gov-browse-public">
            {fr ? "Voir les fiches publiques" : "Browse public listings"}
          </a>
        </div>
      </details>
    </nav>
  );
}

function GovLinks({ links, pathname }: { links: Array<[string, string]>; pathname: string }) {
  return (
    <>
      {links.map(([href, label]) => {
        const path = href.split("#")[0] || href;
        const current = path === pathname;
        return (
          <a
            key={`${href}-${label}`}
            href={href}
            aria-current={current ? "page" : undefined}
            className={
              current
                ? "inline-flex min-h-11 items-center rounded-full bg-surface px-3 text-sm font-semibold ring-1 ring-border"
                : "inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-muted"
            }
          >
            {label}
          </a>
        );
      })}
    </>
  );
}
