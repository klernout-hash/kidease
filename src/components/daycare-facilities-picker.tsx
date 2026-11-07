import { useMemo, useState } from "react";
import {
  Accessibility,
  Baby,
  BookOpen,
  Car,
  Droplets,
  Moon,
  Palette,
  Search,
  Shapes,
  Sun,
  Thermometer,
  Trees,
  Umbrella,
  type LucideIcon,
} from "lucide-react";
import { amenityLabel } from "@/lib/amenities";
import { CheckRow } from "@/components/switch-row";
import {
  FACILITY_CATEGORIES,
  categoryLabel,
  facilityById,
  facilitySummary,
  filterFacilities,
  type FacilityCategory,
} from "@/lib/daycare-facilities";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  toys: Shapes,
  books: BookOpen,
  "art-materials": Palette,
  sensory: Baby,
  "indoor-play": Shapes,
  yard: Trees,
  shade: Umbrella,
  outdoor: Trees,
  "nap-area": Moon,
  "changing-station": Baby,
  "child-toilets": Baby,
  handwashing: Droplets,
  heating: Thermometer,
  cooling: Thermometer,
  "stroller-storage": Baby,
  "dropoff-parking": Car,
  "step-free": Accessibility,
  "wide-opening": Accessibility,
  "accessible-washroom": Accessibility,
  "visual-supports": Sun,
  "quiet-space": Moon,
};

export function DaycareFacilitiesPicker({
  scope,
  selected,
  onToggle,
  locale,
}: {
  scope: "centre" | "room";
  selected: readonly string[];
  onToggle: (id: string, on: boolean) => void;
  locale: string;
}) {
  const fr = locale === "fr";
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FacilityCategory | "all">("all");
  const rows = useMemo(() => filterFacilities({ scope, category, query }), [scope, category, query]);
  const summary = facilitySummary(selected, locale);
  const title = scope === "room" ? (fr ? "Dans cette pièce" : "In this room") : fr ? "Commodités" : "Amenities";
  const lead =
    scope === "room"
      ? fr
        ? "Ces choix restent sur cette pièce. Ils ne s'ajoutent pas à la liste du centre."
        : "These stay on this room. They are not added to the centre list."
      : fr
        ? "Cochez seulement ce que le centre offre. Rien n'est présumé. Les repas sont sur la page Repas. Ceci est déclaré par le centre, pas une certification."
        : "Tick only what this centre offers. Nothing is assumed. Meals stay on the Meals page. This is reported by the centre, not a certification.";

  return (
    <section data-ke="facility-picker" data-scope={scope} aria-label={title} className="space-y-3">
      <div>
        <h2 className="font-display text-2xl font-bold">{title}</h2>
        <p className="mt-1 text-sm text-muted">{lead}</p>
      </div>
      {scope === "centre" ? (
        <div className="rounded-2xl bg-surface px-4 py-3 shadow-card ring-1 ring-border" data-ke="facility-summary">
          {summary.labels.length ? (
            <p className="text-sm font-medium">
              {summary.labels.join(", ")}
              {summary.more ? <span className="text-muted"> +{summary.more}</span> : null}
            </p>
          ) : (
            <p className="text-sm text-muted">{fr ? "Aucune commodité cochée." : "No facilities selected."}</p>
          )}
        </div>
      ) : null}
      <label className="block text-sm font-medium">
        <span className="sr-only">{fr ? "Chercher une commodité" : "Search facilities"}</span>
        <span className="flex h-11 items-center gap-2 rounded-full border border-border bg-surface px-3">
          <Search className="size-4 shrink-0 text-muted" aria-hidden />
          <input
            data-ke="facility-search"
            value={query}
            placeholder={fr ? "Chercher" : "Search"}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
            className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none"
          />
        </span>
      </label>
      <div className="sticky top-14 z-20 -mx-1 flex gap-2 overflow-x-auto bg-bg/95 px-1 py-2" data-ke="facility-categories">
        <Chip on={category === "all"} label={fr ? "Tout" : "All"} onClick={() => setCategory("all")} />
        {FACILITY_CATEGORIES.map((id) => (
          <Chip key={id} on={category === id} label={categoryLabel(id, locale)} onClick={() => setCategory(id)} />
        ))}
      </div>
      {rows.length ? (
        <ul className="divide-y divide-border">
          {rows.map((item) => {
            const on = selected.includes(item.id);
            const Icon = ICONS[item.id] ?? Shapes;
            return (
              <li key={item.id} data-ke="facility-row" data-facility={item.id} data-on={on ? "yes" : "no"}>
                <div className="flex items-center gap-3">
                  <Icon className="size-5 shrink-0 text-muted" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <CheckRow
                      id={`facility-${scope}-${item.id}`}
                      locale={locale}
                      label={locale === "fr" ? item.fr : item.en}
                      checked={on}
                      onCheckedChange={(next) => onToggle(item.id, next)}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted" data-ke="facility-empty">
          {fr ? "Aucune commodité ne correspond." : "No facilities match."}
        </p>
      )}
    </section>
  );
}

function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      data-ke="facility-chip"
      aria-pressed={on}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        on ? "bg-primary text-primary-fg" : "bg-surface text-fg ring-1 ring-border",
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

const HIDDEN_FROM_PARENTS = new Set([
  "meals",
  "licensed",
  "home",
  "group-home",
  "nursery",
  "in-school",
  "ten-a-day",
  "funded",
  "unfunded",
  "for-profit",
  "nonprofit",
  "preschool",
  "school-age",
  "french",
  "ymca",
  "subsidy",
  "sliding-scale",
  "sibling-discount",
  "fob",
  "nut-free",
  "allergen-free",
]);

export function FacilityPublicList({ amenities, locale }: { amenities: string; locale: string }) {
  const [open, setOpen] = useState(false);
  const keys = amenities.split(",").map((part) => part.trim()).filter(Boolean);
  const selected = keys.map((id) => facilityById(id)).filter((item) => item != null);
  const legacy = keys.filter((id) => !facilityById(id) && !HIDDEN_FROM_PARENTS.has(id));
  const fr = locale === "fr";
  if (!selected.length && !legacy.length) {
    return (
      <section data-ke="facility-public" data-listed="no">
        <h2 className="font-display text-2xl">{fr ? "Commodités" : "Facilities"}</h2>
        <p className="mt-2 text-sm text-muted">
          {fr ? "Ce centre n'a pas encore ajouté ses commodités." : "This centre has not added facilities yet."}
        </p>
      </section>
    );
  }
  const previewLabels = [
    ...selected.map((item) => (locale === "fr" ? item.fr : item.en)),
    ...legacy.map((id) => amenityLabel(id, locale)),
  ];
  const preview = previewLabels.slice(0, 3);
  const more = previewLabels.length - preview.length;
  const shown = open ? selected : selected.slice(0, 3);
  const groups = FACILITY_CATEGORIES.map((category) => ({
    category,
    items: shown.filter((item) => item.category === category),
  })).filter((group) => group.items.length);
  return (
    <section data-ke="facility-public" data-listed="yes" data-provider-reported="true">
      <h2 className="font-display text-2xl">{fr ? "Commodités" : "Facilities"}</h2>
      <p className="mt-1 text-sm text-muted">{fr ? "Déclaré par le centre." : "Provider reported."}</p>
      {open ? (
        <div className="mt-3 space-y-4">
          {groups.map((group) => (
            <div key={group.category}>
              <h3 className="text-sm font-semibold">{categoryLabel(group.category, locale)}</h3>
              <ul className="mt-1 space-y-1">
                {group.items.map((item) => (
                  <li key={item.id} className="ke-chip-meta" data-ke="facility-public-item">
                    {locale === "fr" ? item.fr : item.en}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm" data-ke="facility-public-preview">
          {preview.join(", ")}
          {more ? ` +${more}` : ""}
        </p>
      )}
      {open && legacy.length ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">{fr ? "Aussi indiqué" : "Also listed"}</h3>
          <ul className="mt-1 space-y-1">
            {legacy.map((id) => (
              <li key={id}>{amenityLabel(id, locale)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {more > 0 ? (
        <button
          type="button"
          className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
          data-ke="facility-show-all"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? (fr ? "Montrer moins" : "Show less") : fr ? "Tout montrer" : "Show all"}
        </button>
      ) : null}
    </section>
  );
}
