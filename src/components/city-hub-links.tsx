import { Link } from "@tanstack/react-router";
import { cityHubs } from "@/lib/city-hub-data";
import { cityHubChipLabel, cityHubDefBySlug } from "@/lib/city-hubs";
import type { CopyKey } from "@/lib/copy";
import { useCopy } from "@/lib/use-copy";

export function CityHubLinks({
  className,
  headingKey = "browseCities",
}: {
  className?: string;
  headingKey?: CopyKey;
}) {
  const { t, locale } = useCopy();
  const hubs = cityHubs();
  if (!hubs.length) return null;
  return (
    <nav aria-label={t(headingKey)} className={className}>
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">{t(headingKey)}</p>
      <ul className="mt-2 flex flex-nowrap gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] lg:flex-wrap lg:overflow-visible [&::-webkit-scrollbar]:hidden">
        {hubs.map((hub) => {
          const def = cityHubDefBySlug(hub.slug);
          return (
            <li key={hub.slug} className="shrink-0">
              <Link
                to="/daycare/city/$city"
                params={{ city: hub.slug }}
                className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full bg-surface px-3 text-sm font-medium ring-1 ring-border hover:bg-bg"
              >
                {def ? cityHubChipLabel(def, locale) : hub.city}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
