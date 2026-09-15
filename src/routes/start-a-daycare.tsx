import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  Building2,
  ClipboardCheck,
  FileCheck,
  MapPin,
  MessageCircle,
  Search,
  Shield,
  Wallet,
} from "lucide-react";
import { ChipButton } from "@/components/chip";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { canadaFallbackUrl } from "@/lib/province-registry";
import { MARKETING_PAGE_SEO, pageSeoHead } from "@/lib/page-seo";
import {
  filterStartDaycarePts,
  startDaycarePt,
  type StartDaycarePt,
} from "@/lib/start-daycare-hub";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";

export const Route = createFileRoute("/start-a-daycare")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO.startADaycare),
  component: StartADaycarePage,
});

const STEPS: Array<{ icon: typeof MapPin; title: CopyKey; body: CopyKey }> = [
  { icon: MapPin, title: "startDaycareStep1T", body: "startDaycareStep1" },
  { icon: Building2, title: "startDaycareStep2T", body: "startDaycareStep2" },
  { icon: Shield, title: "startDaycareStep3T", body: "startDaycareStep3" },
  { icon: ClipboardCheck, title: "startDaycareStep4T", body: "startDaycareStep4" },
  { icon: Wallet, title: "startDaycareStep5T", body: "startDaycareStep5" },
  { icon: FileCheck, title: "startDaycareStep6T", body: "startDaycareStep6" },
  { icon: BadgeCheck, title: "startDaycareStep7T", body: "startDaycareStep7" },
];

const KIDEASE_HELPS: Array<{ icon: typeof BadgeCheck; key: CopyKey }> = [
  { icon: BadgeCheck, key: "startDaycareKidEase1" },
  { icon: MessageCircle, key: "startDaycareKidEase2" },
  { icon: Wallet, key: "startDaycareKidEase3" },
];

function Ctas() {
  const { t } = useCopy();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Button asChild size="lg">
        <Link to="/claim" hash="enroll">
          {t("enrollToday")}
        </Link>
      </Button>
      <Button asChild size="lg" variant="secondary">
        <Link to="/claim">{t("startDaycareClaimExisting")}</Link>
      </Button>
    </div>
  );
}

function OfficialLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
    >
      {children}
      <ArrowUpRight className="size-3.5" aria-hidden />
    </a>
  );
}

function ProvincePanel({ pt, locale }: { pt: StartDaycarePt; locale: string }) {
  const { t } = useCopy();
  const fr = locale === "fr";
  return (
    <article className="mt-5 rounded-2xl bg-surface p-5 ring-1 ring-border md:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{pt.code}</p>
      <h3 className="mt-1 text-2xl font-semibold">{fr ? pt.nameFr : pt.nameEn}</h3>
      <p className="mt-2 text-xs text-subtle">{t("startDaycareReviewed")}</p>
      <p className="mt-3 text-sm leading-6 text-muted">{t("startDaycareProgramsChange")}</p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <section>
          <h4 className="text-lg font-semibold">{t("startDaycareLicensingT")}</h4>
          <p className="mt-2 text-sm leading-6 text-fg">{fr ? pt.licensingWhoFr : pt.licensingWhoEn}</p>
          <p className="mt-2 text-sm leading-6 text-muted">{fr ? pt.licensingFirstFr : pt.licensingFirstEn}</p>
          <p className="mt-3 text-sm">
            <OfficialLink href={pt.licensingUrl}>{t("startDaycareOfficialLink")}</OfficialLink>
          </p>
        </section>
        <section>
          <h4 className="text-lg font-semibold">{t("startDaycareFundingT")}</h4>
          <p className="mt-2 text-sm leading-6 text-muted">{fr ? pt.fundingFr : pt.fundingEn}</p>
          {pt.competitive ? <p className="mt-2 text-sm font-medium text-fg">{t("startDaycareCompetitive")}</p> : null}
          <p className="mt-3 text-sm">
            <OfficialLink href={pt.fundingUrl}>{t("startDaycareOfficialLink")}</OfficialLink>
          </p>
        </section>
      </div>
    </article>
  );
}

export function StartADaycarePage() {
  const { t, locale } = useCopy();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const filtered = useMemo(() => filterStartDaycarePts(query), [query]);
  const pt = startDaycarePt(selected);

  return (
    <Shell bare>
      <main className="ke-gutter mx-auto max-w-3xl py-12 md:py-16">
        <p className="text-sm font-semibold tracking-wide text-primary">{t("startADaycare")}</p>
        <h1 className="mt-2 text-4xl md:text-5xl">{t("startDaycareTitle")}</h1>

        <aside
          className="mt-6 rounded-2xl bg-primary p-5 text-primary-fg shadow-card ring-1 ring-primary md:p-6"
          aria-labelledby="start-daycare-honesty"
        >
          <h2 id="start-daycare-honesty" className="text-xl font-semibold md:text-2xl">
            {t("startDaycareHonestyT")}
          </h2>
          <p className="mt-3 text-sm leading-6 md:text-base">{t("startDaycareHonesty")}</p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 md:text-base">
            <li>{t("startDaycareNotLicence1")}</li>
            <li>{t("startDaycareNotLicence2")}</li>
            <li>{t("startDaycareNotLicence3")}</li>
          </ul>
          <p className="mt-4 text-sm leading-6 md:text-base">{t("startDaycareIntro")}</p>
        </aside>

        <p className="mt-6 text-lg text-muted">{t("startDaycareHero")}</p>
        <p className="mt-3 text-sm text-muted">{t("startDaycareEnrollLead")}</p>
        <div className="mt-6">
          <Ctas />
        </div>

        <section className="mt-10 rounded-xl bg-surface p-5 ring-1 ring-border">
          <h2 className="text-lg font-semibold">{t("startDaycareOfficialT")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{t("startDaycareOfficial")}</p>
          <p className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <OfficialLink href={canadaFallbackUrl()}>{t("startDaycareCanadaElcc")}</OfficialLink>
            <Link to="/verify" className="font-medium text-primary underline-offset-4 hover:underline">
              {t("verifyListings")}
            </Link>
            <Link to="/daycare-requirements" className="font-medium text-primary underline-offset-4 hover:underline">
              {t("daycareRequirements")}
            </Link>
          </p>
        </section>

        <h2 className="mt-12 text-2xl">{t("startDaycareStepsT")}</h2>
        <ol className="mt-5 space-y-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3 rounded-xl bg-surface p-4 ring-1 ring-border">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <step.icon className="size-4" aria-hidden />
              </span>
              <div>
                <h3 className="text-base font-semibold">
                  <span className="mr-2 text-primary">{index + 1}.</span>
                  {t(step.title)}
                </h3>
                <p className="mt-1 text-sm leading-6 text-muted">{t(step.body)}</p>
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-12" aria-labelledby="start-daycare-finder">
          <h2 id="start-daycare-finder" className="text-2xl">
            {t("startDaycareFinderT")}
          </h2>
          <p className="mt-2 text-sm text-muted">{t("startDaycareFinderHint")}</p>
          <label className="mt-5 block">
            <span className="sr-only">{t("startDaycareFinderPh")}</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("startDaycareFinderPh")}
                autoComplete="off"
                className="h-12 w-full rounded-full bg-surface pl-11 pr-5 shadow-card ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
              />
            </span>
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            {filtered.map((item) => (
              <ChipButton
                key={item.code}
                on={selected === item.code}
                onClick={() => setSelected(item.code)}
                aria-pressed={selected === item.code}
              >
                {locale === "fr" ? item.nameFr : item.nameEn}
              </ChipButton>
            ))}
          </div>
          {filtered.length === 0 ? <p className="mt-4 text-sm text-muted">{t("startDaycareNoMatch")}</p> : null}
          {pt ? <ProvincePanel pt={pt} locale={locale} /> : <p className="mt-5 text-sm text-muted">{t("startDaycareSelectPt")}</p>}
        </section>

        <h2 className="mt-12 text-2xl">{t("startDaycareGrantsT")}</h2>
        <p className="mt-3 text-sm leading-6 text-muted">{t("startDaycareGrants")}</p>

        <h2 className="mt-12 text-2xl">{t("startDaycareKidEaseT")}</h2>
        <ul className="mt-5 space-y-3">
          {KIDEASE_HELPS.map((item) => (
            <li key={item.key} className="flex gap-3 rounded-xl bg-surface p-4 ring-1 ring-border">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <item.icon className="size-4" aria-hidden />
              </span>
              <p className="text-sm leading-relaxed">{t(item.key)}</p>
            </li>
          ))}
        </ul>

        <div className="mt-10">
          <Ctas />
        </div>
        <p className="mt-3 text-sm text-muted">{t("startDaycareEnrollLead")}</p>
      </main>
      <SiteFooter />
    </Shell>
  );
}
