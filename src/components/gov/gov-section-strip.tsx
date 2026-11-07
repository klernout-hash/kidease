import { govCopy } from "@/lib/gov/copy";
import { deskGroups } from "@/lib/gov/sections";

export function GovSectionStrip({ locale }: { locale: "en" | "fr" }) {
  const copy = govCopy(locale);
  const links = deskGroups(locale, copy, false).flatMap((group) => group.links);
  return (
    <nav className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label={copy.navLabel} data-ke="gov-section-strip">
      {links.map(([href, label]) => (
        <a key={`${href}-${label}`} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-surface px-3 text-sm font-medium ring-1 ring-border" href={href}>
          {label}
        </a>
      ))}
    </nav>
  );
}
