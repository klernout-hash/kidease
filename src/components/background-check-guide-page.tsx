import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { SearchableAccordion, type SearchableAccordionItem } from "@/components/searchable-accordion";
import { searchTextMatches } from "@/lib/search-text";
import {
  BG_ROLES,
  checksForRole,
  guideChrome,
  type BgJurisdiction,
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

function ProvincePicker({ locale, current }: { locale: "en" | "fr"; current?: string }) {
  const copy = guideChrome(locale);
  const navigate = useNavigate();
  return (
    <label className="block text-sm font-medium">
      {copy.pickerLabel}
      <select
        className="ke-input mt-1 min-h-11 w-full"
        value={current ?? ""}
        onChange={(event) => {
          const code = event.target.value;
          if (!code) return;
          void navigate({ href: localePath(`/background-checks/${code.toLowerCase()}`, locale) });
        }}
      >
        {current ? null : <option value="">{copy.hubNext}</option>}
        {START_DAYCARE_PTS.map((pt) => (
          <option key={pt.code} value={pt.code}>
            {locale === "fr" ? pt.nameFr : pt.nameEn}
          </option>
        ))}
      </select>
    </label>
  );
}

export function BackgroundCheckHub({ enabled }: { enabled: boolean }) {
  const { locale } = useCopy();
  const lang = locale === "fr" ? "fr" : "en";
  const copy = guideChrome(lang);
  const [query, setQuery] = useState("");
  if (!enabled) return <BackgroundCheckOff locale={lang} />;
  const provinces = START_DAYCARE_PTS.filter((pt) =>
    searchTextMatches(query, `${pt.nameEn} ${pt.nameFr} ${pt.code} ${pt.aliases.join(" ")}`),
  );
  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-3xl py-8 pb-28">
        <p className="text-sm font-semibold text-primary">{copy.kicker}</p>
        <h1 className="mt-2 font-display text-3xl md:text-5xl">{copy.hubTitle}</h1>
        <p className="mt-4 text-lg text-muted">{copy.hubWhat}</p>
        <p className="mt-2 text-muted">{copy.hubWhy}</p>
        <label className="mt-6 block text-sm font-medium">
          {copy.searchLabel}
          <input
            className="ke-input mt-1 min-h-11 w-full"
            type="search"
            value={query}
            placeholder={copy.searchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
            autoComplete="off"
          />
        </label>
        <div className="mt-4">
          <ProvincePicker locale={lang} />
        </div>
        {provinces.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-muted" role="status">{copy.noMatches}</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {provinces.map((pt) => (
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
        )}
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
    <div>
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
    </div>
  );
}

function checkSearchText(check: GuideCheck): string {
  return [
    check.titleEn,
    check.titleFr,
    check.whatEn,
    check.whatFr,
    check.whenEn,
    check.whenFr,
    check.whereEn,
    check.whereFr,
    check.documentsEn,
    check.documentsFr,
    check.costEn,
    check.costFr,
    check.renewalEn,
    check.renewalFr,
    check.keeperEn,
    check.keeperFr,
    check.unconfirmedEn || "",
    check.unconfirmedFr || "",
  ].join("\n");
}

function guideItems(jurisdiction: BgJurisdiction, locale: "en" | "fr"): SearchableAccordionItem[] {
  const copy = guideChrome(locale);
  const fr = locale === "fr";
  const items: SearchableAccordionItem[] = [];
  for (const role of BG_ROLES) {
    const checks = checksForRole(jurisdiction, role);
    const note = jurisdiction.roleNotes[role];
    const roleLabel = copy.roleLabels[role];
    if (note) {
      const body = fr ? note.fr : note.en;
      items.push({
        id: `${jurisdiction.code}-${role}-note`,
        title: roleLabel,
        searchText: `${roleLabel}\n${note.en}\n${note.fr}`,
        content: <p className="text-muted">{body}</p>,
      });
    }
    for (const check of checks) {
      const title = fr ? check.titleFr : check.titleEn;
      items.push({
        id: `${role}-${check.id}`,
        title: `${roleLabel} · ${title}`,
        searchText: `${roleLabel}\n${checkSearchText(check)}`,
        content: <CheckCard check={check} locale={locale} />,
      });
    }
  }
  return items;
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
      <main className="ke-gutter mx-auto w-full max-w-3xl py-8 pb-28">
        <p className="text-sm font-semibold text-primary">{copy.kicker}</p>
        <h1 className="mt-2 font-display text-3xl md:text-5xl">{name}</h1>
        <p className="mt-4 text-lg text-muted">{lang === "fr" ? jurisdiction.summaryFr : jurisdiction.summaryEn}</p>
        <p className="mt-2 text-muted">{copy.hubWhy}</p>
        <div className="mt-6">
          <SearchableAccordion
            items={guideItems(jurisdiction, lang)}
            label={copy.searchLabel}
            placeholder={copy.searchPlaceholder}
            empty={copy.noMatches}
          >
            <ProvincePicker locale={lang} current={jurisdiction.code} />
          </SearchableAccordion>
        </div>
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
