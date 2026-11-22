import { Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import {
  BG_ROLES,
  checksForRole,
  guideChrome,
  type BgJurisdiction,
  type BgRole,
  type GuideCheck,
} from "@/lib/background-check-guide";
import { localePath } from "@/lib/locale-path";
import { START_DAYCARE_PTS } from "@/lib/start-daycare-hub";
import { useCopy } from "@/lib/use-copy";

function provinceName(code: string, locale: "en" | "fr"): string {
  const row = START_DAYCARE_PTS.find((item) => item.code === code);
  if (!row) return code;
  return locale === "fr" ? row.nameFr : row.nameEn;
}

export function BackgroundCheckOff({ locale }: { locale: "en" | "fr" }) {
  const copy = guideChrome(locale);
  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-3xl py-8">
        <p className="text-sm font-semibold text-primary">{copy.kicker}</p>
        <h1 className="mt-2 font-display text-3xl md:text-5xl">{copy.offTitle}</h1>
        <p className="mt-4 text-lg text-muted">{copy.offBody}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link to={localePath("/", locale)}>{copy.home}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to={localePath("/contact", locale)}>{copy.contact}</Link>
          </Button>
        </div>
      </main>
    </Shell>
  );
}

export function BackgroundCheckHub({ enabled }: { enabled: boolean }) {
  const { locale } = useCopy();
  const lang = locale === "fr" ? "fr" : "en";
  const copy = guideChrome(lang);
  if (!enabled) return <BackgroundCheckOff locale={lang} />;
  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-3xl py-8">
        <p className="text-sm font-semibold text-primary">{copy.kicker}</p>
        <h1 className="mt-2 font-display text-3xl md:text-5xl">{copy.hubTitle}</h1>
        <p className="mt-4 text-lg text-muted">{copy.hubWhat}</p>
        <p className="mt-2 text-muted">{copy.hubWhy}</p>
        <p className="mt-2 font-medium">{copy.hubNext}</p>
        <ul className="mt-6 divide-y divide-border">
          {START_DAYCARE_PTS.map((pt) => (
            <li key={pt.code}>
              <Link
                to={localePath(`/background-checks/${pt.code.toLowerCase()}`, lang)}
                className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
              >
                {lang === "fr" ? pt.nameFr : pt.nameEn}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm leading-6 text-muted">{copy.disclaimer}</p>
      </main>
    </Shell>
  );
}

function SourceList({ check, locale }: { check: GuideCheck; locale: "en" | "fr" }) {
  const copy = guideChrome(locale);
  return (
    <div className="mt-3 text-sm leading-6 text-muted">
      <p className="font-medium text-fg">{copy.sources}</p>
      <ul className="mt-1 space-y-1">
        {check.sources.map((source) => (
          <li key={`${source.label}-${source.asOf}`}>
            {source.href ? (
              <a className="underline-offset-4 hover:underline" href={source.href}>
                {source.label}
              </a>
            ) : (
              source.label
            )}
            {" · "}
            {copy.asOf} {source.asOf}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CheckCard({ check, locale }: { check: GuideCheck; locale: "en" | "fr" }) {
  const copy = guideChrome(locale);
  const fr = locale === "fr";
  return (
    <article className="rounded-xl bg-surface p-5 ring-1 ring-border">
      <h3 className="text-lg font-semibold">{fr ? check.titleFr : check.titleEn}</h3>
      {check.unconfirmed ? (
        <p className="mt-2 rounded-lg bg-warn/15 px-3 py-2 text-sm leading-6" role="note">
          <span className="font-semibold">{copy.unconfirmed}. </span>
          {fr ? check.unconfirmedFr : check.unconfirmedEn}
        </p>
      ) : null}
      <dl className="mt-4 space-y-3 text-sm leading-6">
        <div>
          <dt className="font-semibold">{copy.what}</dt>
          <dd className="text-muted">{fr ? check.whatFr : check.whatEn}</dd>
        </div>
        <div>
          <dt className="font-semibold">{copy.when}</dt>
          <dd className="text-muted">{fr ? check.whenFr : check.whenEn}</dd>
        </div>
        <div>
          <dt className="font-semibold">{copy.where}</dt>
          <dd className="text-muted">{fr ? check.whereFr : check.whereEn}</dd>
        </div>
        <div>
          <dt className="font-semibold">{copy.documents}</dt>
          <dd className="text-muted">{fr ? check.documentsFr : check.documentsEn}</dd>
        </div>
        <div>
          <dt className="font-semibold">{copy.cost}</dt>
          <dd className="text-muted">{fr ? check.costFr : check.costEn}</dd>
        </div>
        <div>
          <dt className="font-semibold">{copy.renewal}</dt>
          <dd className="text-muted">{fr ? check.renewalFr : check.renewalEn}</dd>
        </div>
        <div>
          <dt className="font-semibold">{copy.keeper}</dt>
          <dd className="text-muted">{fr ? check.keeperFr : check.keeperEn}</dd>
        </div>
      </dl>
      {check.links.length > 0 ? (
        <ul className="mt-4 space-y-1">
          {check.links.map((link) => (
            <li key={link.href}>
              <a className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline" href={link.href}>
                {fr ? link.labelFr : link.labelEn}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <SourceList check={check} locale={locale} />
    </article>
  );
}

function RoleSection({
  role,
  jurisdiction,
  locale,
}: {
  role: BgRole;
  jurisdiction: BgJurisdiction;
  locale: "en" | "fr";
}) {
  const copy = guideChrome(locale);
  const checks = checksForRole(jurisdiction, role);
  const note = jurisdiction.roleNotes[role];
  if (checks.length === 0 && !note) return null;
  return (
    <section className="mt-8" aria-labelledby={`bg-role-${role}`}>
      <h2 id={`bg-role-${role}`} className="font-display text-2xl">
        {copy.roleLabels[role]}
      </h2>
      {note ? <p className="mt-2 text-sm leading-6 text-muted">{locale === "fr" ? note.fr : note.en}</p> : null}
      <div className="mt-4 space-y-4">
        {checks.map((check) => (
          <CheckCard key={`${role}-${check.id}`} check={check} locale={locale} />
        ))}
      </div>
    </section>
  );
}

export function BackgroundCheckProvince({
  jurisdiction,
  enabled,
}: {
  jurisdiction: BgJurisdiction | null;
  enabled: boolean;
}) {
  const { locale } = useCopy();
  const lang = locale === "fr" ? "fr" : "en";
  const copy = guideChrome(lang);
  if (!enabled) return <BackgroundCheckOff locale={lang} />;
  if (!jurisdiction) {
    return (
      <Shell>
        <main className="ke-gutter mx-auto w-full max-w-lg py-10">
          <EmptyState title={copy.missing} action={copy.search} actionTo={localePath("/search", lang)} />
          <p className="mt-4">
            <Link to={localePath("/background-checks", lang)} className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">
              {copy.back}
            </Link>
          </p>
        </main>
      </Shell>
    );
  }
  const name = provinceName(jurisdiction.code, lang);
  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-3xl py-8">
        <p className="text-sm font-semibold text-primary">{copy.kicker}</p>
        <h1 className="mt-2 font-display text-3xl md:text-5xl">{name}</h1>
        <p className="mt-4 text-lg text-muted">{lang === "fr" ? jurisdiction.summaryFr : jurisdiction.summaryEn}</p>
        <p className="mt-2 text-muted">{copy.hubWhy}</p>
        <h2 className="mt-8 font-display text-2xl">{copy.rolesTitle}</h2>
        {BG_ROLES.map((role) => (
          <RoleSection key={role} role={role} jurisdiction={jurisdiction} locale={lang} />
        ))}
        <p className="mt-8 text-sm leading-6 text-muted">{copy.disclaimer}</p>
        <p className="mt-6">
          <Link
            to={localePath("/background-checks", lang)}
            className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
          >
            {copy.back}
          </Link>
        </p>
      </main>
    </Shell>
  );
}
