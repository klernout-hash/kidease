import { Link } from "@tanstack/react-router";
import { cityHubs } from "@/lib/city-hub-data";
import { useCopy } from "@/lib/use-copy";

export function CityHubLinks({ className }: { className?: string }) {
  const { t } = useCopy();
  const hubs = cityHubs();
  if (!hubs.length) return null;
  return (
    <nav aria-label={t("browseCities")} className={className}>
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">{t("browseCities")}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {hubs.map((hub) => (
          <li key={hub.slug}>
            <Link
              to="/daycare/city/$city"
              params={{ city: hub.slug }}
              className="inline-flex min-h-11 items-center rounded-full bg-surface px-3 text-sm font-medium ring-1 ring-border hover:bg-bg"
            >
              {hub.city}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
