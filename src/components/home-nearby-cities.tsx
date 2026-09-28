import { Link } from "@tanstack/react-router";
import type { PopularHomeCity } from "@/lib/home-popular-cities";
import { useCopy } from "@/lib/use-copy";

/** Quiet text links. Render nothing when location is unknown. */
export function HomeNearbyCities({ cities }: { cities: PopularHomeCity[] }) {
  const { t } = useCopy();
  if (!cities.length) return null;
  return (
    <nav aria-label={t("nearbyCities")} data-ke="hero-nearby-cities" className="text-sm text-muted">
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {cities.map((city) => (
          <li key={city.slug}>
            <Link
              to="/daycare/city/$city"
              params={{ city: city.slug }}
              className="inline-flex min-h-11 items-center underline-offset-4 hover:text-fg hover:underline"
            >
              {city.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
