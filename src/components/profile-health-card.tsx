import { Link } from "@tanstack/react-router";
import { CircleAlert, CircleCheck, CircleX, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { HEALTHY_PHOTO_COUNT, type HealthCheck, type HealthCheckId, type ProfileHealth } from "@/lib/profile-health";

type Locale = "en" | "fr";

/** Where a daycare fixes each item on its own desk. */
const FIX_DESK: Record<HealthCheckId, string> = {
  licence: "licence",
  licence_file: "licence",
  licence_expiry: "licence",
  screening: "screening",
  photos: "listings",
  fees: "listings",
  ages: "listings",
  hours: "hours",
  contact: "listings",
};

const COPY = {
  en: {
    score: "Profile health",
    ready: "Ready",
    almost: "Almost there",
    needs: "Needs work",
    todo: "To do",
    done: "Done",
    fix: "Fix",
    why: `Complete listings show up in more searches. Parents filter by fees and ages, and Best match ranks listings with ages and up-to-date open spots higher. Aim for every item green and ${HEALTHY_PHOTO_COUNT} or more photos.`,
    allGreen: "Every item is done. Parents see a complete listing.",
  },
  fr: {
    score: "Santé de la fiche",
    ready: "Prête",
    almost: "Presque",
    needs: "À compléter",
    todo: "À faire",
    done: "Fait",
    fix: "Corriger",
    why: `Une fiche complète apparaît dans plus de recherches. Les parents filtrent par frais et par âge, et le meilleur résultat place plus haut les fiches avec les âges et des places à jour. Visez tout en vert et au moins ${HEALTHY_PHOTO_COUNT} photos.`,
    allGreen: "Tout est fait. Les parents voient une fiche complète.",
  },
} as const;

export function bandLabel(health: ProfileHealth, locale: Locale): string {
  const c = COPY[locale];
  return health.band === "ready" ? c.ready : health.band === "almost" ? c.almost : c.needs;
}

const RING_COLOR = { ready: "var(--color-ok)", almost: "var(--color-warn)", needs_work: "var(--color-danger)" } as const;

export function HealthRing({ health, locale, size = 56 }: { health: ProfileHealth; locale: Locale; size?: number }) {
  const r = size / 2 - 4;
  const circ = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, health.score)) / 100) * circ;
  return (
    <div className="flex shrink-0 flex-col items-center" data-ke="health-ring" data-ke-score={health.score} data-ke-band={health.band}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${COPY[locale].score} ${health.score}%`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border)" strokeWidth="5" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={RING_COLOR[health.band]}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-current text-[15px] font-semibold tabular-nums">
          {health.score}%
        </text>
      </svg>
      <span
        className={cn(
          "mt-0.5 text-xs font-medium",
          health.band === "ready" ? "text-ok" : health.band === "almost" ? "text-warn" : "text-danger",
        )}
      >
        {bandLabel(health, locale)}
      </span>
    </div>
  );
}

function CheckIcon({ check }: { check: HealthCheck }) {
  if (check.state === "good") return <CircleCheck className="size-4 shrink-0 text-ok" aria-hidden="true" />;
  if (check.state === "warn") return <CircleAlert className="size-4 shrink-0 text-warn" aria-hidden="true" />;
  return <CircleX className="size-4 shrink-0 text-danger" aria-hidden="true" />;
}

/** Green / amber / red checklist. Admin reads it at a glance; a daycare gets a Fix link on each red or amber row. */
export function HealthChecklist({
  health,
  locale,
  fixLinks = false,
}: {
  health: ProfileHealth;
  locale: Locale;
  fixLinks?: boolean;
}) {
  const c = COPY[locale];
  const open = health.checks.filter((check) => check.state !== "good");
  const done = health.checks.filter((check) => check.state === "good");
  if (!fixLinks) {
    return (
      <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2" data-ke="health-checklist">
        {[...open, ...done].map((check) => (
          <li
            key={check.id}
            className={cn(
              "flex min-w-0 items-center gap-1.5",
              check.state === "good" ? "text-ok" : check.state === "warn" ? "text-warn" : "font-medium text-danger",
            )}
            data-ke-health-check={check.id}
            data-ke-health-state={check.state}
          >
            <CheckIcon check={check} />
            <span className="truncate">{check.label[locale]}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="space-y-3" data-ke="health-checklist">
      {open.length ? (
        <div>
          <p className="text-xs font-medium text-danger">{c.todo}</p>
          <ul className="mt-1.5 overflow-hidden rounded-xl ring-1 ring-danger/30">
            {open.map((check) => (
              <li key={check.id} className="border-t border-danger/20 first:border-t-0" data-ke-health-check={check.id} data-ke-health-state={check.state}>
                <Link
                  to="/provider"
                  search={{ desk: FIX_DESK[check.id] } as never}
                  className="flex min-h-11 items-center gap-2 bg-danger/5 px-3 text-sm hover:bg-danger/10"
                >
                  <CheckIcon check={check} />
                  <span className={cn("min-w-0 flex-1", check.state === "missing" ? "font-medium text-danger" : "text-warn")}>
                    {check.label[locale]}
                  </span>
                  <span className="text-xs font-medium text-danger">{c.fix}</span>
                  <ChevronRight className="size-4 text-danger" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-ok">{c.allGreen}</p>
      )}
      {done.length ? (
        <div>
          <p className="text-xs font-medium text-ok">{c.done}</p>
          <ul className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 text-sm text-ok sm:grid-cols-2">
            {done.map((check) => (
              <li key={check.id} className="flex min-w-0 items-center gap-1.5" data-ke-health-check={check.id} data-ke-health-state="good">
                <CheckIcon check={check} />
                <span className="truncate">{check.label[locale]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** The daycare's own copy of the card Admin sees. */
export function ProfileHealthCard({ health, locale }: { health: ProfileHealth; locale: Locale }) {
  const c = COPY[locale];
  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-border sm:p-5" data-ke="profile-health-card" aria-labelledby="profile-health-title">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="profile-health-title" className="font-display text-lg tracking-tight">
            {c.score}
          </h2>
          <p className="mt-1 text-sm leading-5 text-muted">{c.why}</p>
        </div>
        <HealthRing health={health} locale={locale} />
      </div>
      <div className="mt-4">
        <HealthChecklist health={health} locale={locale} fixLinks />
      </div>
    </section>
  );
}
