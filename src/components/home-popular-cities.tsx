import type { PopularHomeCity } from "@/lib/home-popular-cities";

export function HomePopularCities({
  cities,
  label,
  onSelect,
}: {
  cities: PopularHomeCity[];
  label: string;
  onSelect: (query: string) => void;
}) {
  if (!cities.length) return null;
  return (
    <nav aria-label={label} className="mt-3 max-w-md text-sm text-muted" data-ke="hero-popular-cities">
      <p className="flex flex-nowrap items-baseline gap-x-1 overflow-x-auto whitespace-nowrap pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:whitespace-normal [&::-webkit-scrollbar]:hidden">
        <span className="shrink-0">{label}:</span>
        {cities.map((city, index) => (
          <span key={city.slug} className="shrink-0">
            {index > 0 ? <span aria-hidden="true"> · </span> : null}
            <button
              type="button"
              className="underline-offset-4 hover:text-fg hover:underline"
              onClick={() => onSelect(city.q)}
            >
              {city.label}
            </button>
          </span>
        ))}
      </p>
    </nav>
  );
}
