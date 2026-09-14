import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { FeelBanner } from "@/components/building-photo";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";
import { MARKETING_PAGE_SEO, pageSeoHead } from "@/lib/page-seo";
import {
  AB_ESTIMATOR_HREF,
  AB_FEES_HREF,
  AB_SUBSIDY_HREF,
  BC_ACCB_HREF,
  BC_ESTIMATOR_HREF,
  BC_MFS_HREF,
  BENEFITS_PERIOD_EN,
  BENEFITS_PERIOD_FR,
  BENEFITS_REVIEWED_LABEL_EN,
  BENEFITS_REVIEWED_LABEL_FR,
  CCB,
  CDB,
  CWELCC_HREF,
  MB_SEE_HREF,
  MB_SUBSIDY_HREF,
  MB_ZERO_FEE_EFFECTIVE_EN,
  MB_ZERO_FEE_EFFECTIVE_FR,
  ON_CMSM_HREF,
  ON_SUBSIDY_HREF,
  moneyEn,
  moneyFr,
} from "@/lib/benefits-facts";

export const Route = createFileRoute("/benefits")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO.benefits),
  component: BenefitsPage,
});

type ExtraLink = { href: string; labelEn: string; labelFr: string };

const PROGRAMS: {
  key: string;
  title: CopyKey;
  body: CopyKey;
  href: string;
  extras?: ExtraLink[];
  highlight?: boolean;
}[] = [
  {
    key: "mb",
    title: "benefitsMbT",
    body: "benefitsMb",
    href: MB_SUBSIDY_HREF,
    highlight: true,
    extras: [{ href: MB_SEE_HREF, labelEn: "Manitoba fee estimator (SEE)", labelFr: "Estimateur de frais du Manitoba (SEE)" }],
  },
  {
    key: "ab",
    title: "benefitsAbT",
    body: "benefitsAb",
    href: AB_SUBSIDY_HREF,
    extras: [
      { href: AB_FEES_HREF, labelEn: "Affordability / reduced parent fees", labelFr: "Abordabilité / frais parentaux réduits" },
      { href: AB_ESTIMATOR_HREF, labelEn: "Alberta subsidy estimator", labelFr: "Estimateur de subvention de l’Alberta" },
    ],
  },
  {
    key: "on",
    title: "benefitsOnT",
    body: "benefitsOn",
    href: ON_SUBSIDY_HREF,
    extras: [{ href: ON_CMSM_HREF, labelEn: "Find your CMSM or DSSAB", labelFr: "Trouver votre CMSM ou DSSAB" }],
  },
  {
    key: "bc",
    title: "benefitsBcT",
    body: "benefitsBc",
    href: BC_ACCB_HREF,
    extras: [
      { href: BC_MFS_HREF, labelEn: "My Family Services", labelFr: "My Family Services" },
      { href: BC_ESTIMATOR_HREF, labelEn: "Official ACCB estimator", labelFr: "Estimateur officiel de la PGEA" },
    ],
  },
  { key: "qc", title: "benefitsQcT", body: "benefitsQc", href: "https://www.revenuquebec.ca/en/citizens/tax-credits/tax-credit-for-childcare-expenses/" },
  { key: "sk", title: "benefitsSkT", body: "benefitsSk", href: "https://www.saskatchewan.ca/residents/family-and-social-support/child-care" },
  { key: "ns", title: "benefitsNsT", body: "benefitsNs", href: "https://childcarenovascotia.ca/families/child-care-subsidy" },
  {
    key: "nb",
    title: "benefitsNbT",
    body: "benefitsNb",
    href: "https://www2.gnb.ca/content/gnb/en/corporate/promo/investing-in-early-learning-and-child-care/information-for-families/guide.html",
  },
  {
    key: "pe",
    title: "benefitsPeT",
    body: "benefitsPe",
    href: "https://www.princeedwardisland.ca/en/information/social-development-and-seniors/help-for-child-care-expenses",
  },
  { key: "nl", title: "benefitsNlT", body: "benefitsNl", href: "https://www.gov.nl.ca/education/childcare/childcaresubsidy/" },
  { key: "yt", title: "benefitsYtT", body: "benefitsYt", href: "https://yukon.ca/en/universal-child-care" },
  { key: "nt", title: "benefitsNtT", body: "benefitsNt", href: "https://www.ece.gov.nt.ca/en/average-10-day-child-care" },
  { key: "nu", title: "benefitsNuT", body: "benefitsNu", href: "https://www.gov.nu.ca/en/education-and-schools/10_day-child-care" },
];

function OfficialLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary">
      {children}
      <ArrowUpRight className="size-4 shrink-0" />
    </a>
  );
}

export function BenefitsPage() {
  const { t, locale } = useCopy();
  const fr = locale === "fr";
  const money = fr ? moneyFr : moneyEn;
  const period = fr ? BENEFITS_PERIOD_FR : BENEFITS_PERIOD_EN;
  const reviewed = fr ? BENEFITS_REVIEWED_LABEL_FR : BENEFITS_REVIEWED_LABEL_EN;
  const mbWhen = fr ? MB_ZERO_FEE_EFFECTIVE_FR : MB_ZERO_FEE_EFFECTIVE_EN;

  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-3xl py-10">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">{t("benefitsShort")}</p>
        <h1 className="mt-2 text-4xl">{t("benefitsTitle")}</h1>
        <p className="mt-4 max-w-2xl text-muted">{t("benefitsLead")}</p>
        <p className="mt-3 max-w-2xl text-sm text-subtle">{t("benefitsReviewed")}</p>
        <nav aria-label={fr ? "Sections de la page" : "Page sections"} className="mt-6 flex flex-wrap gap-2 text-sm">
          <a href="#federal" className="rounded-full bg-surface px-3 py-1.5 ring-1 ring-border hover:ring-primary">
            {t("benefitsSectionFederal")}
          </a>
          <a href="#cwelcc" className="rounded-full bg-surface px-3 py-1.5 ring-1 ring-border hover:ring-primary">
            {t("benefitsSectionCwelcc")}
          </a>
          <a href="#provincial" className="rounded-full bg-surface px-3 py-1.5 ring-1 ring-border hover:ring-primary">
            {t("benefitsSectionProvincial")}
          </a>
        </nav>
        <FeelBanner src="/photos/nature.jpg" className="mt-8" />

        <section id="federal" className="mt-10 scroll-mt-24 rounded-xl bg-surface p-5 ring-1 ring-border md:p-6">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">
            {fr ? "Tout le Canada" : "Canada-wide"}
          </p>
          <h2 className="mt-1 font-display text-2xl">{t("benefitsSectionFederal")}</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            {fr
              ? "Paiements mensuels de l’ARC aux familles admissibles. Ce n’est pas un rabais sur la facture de garderie. Montants pour la période de paiement juillet 2026–juin 2027, selon le revenu familial net rajusté (RFNR) de 2025."
              : "Monthly CRA payments to eligible families. This is not a daycare invoice discount. Amounts are for the July 2026–June 2027 payment period, based on 2025 adjusted family net income (AFNI)."}
          </p>

          <div className="mt-5 rounded-lg bg-surface-2 p-4 ring-1 ring-border">
            <h3 className="text-lg font-semibold">{t("benefitsFedT")}</h3>
            <p className="mt-1 text-xs text-subtle">
              {fr ? `Période ${period} · RFNR ${CCB.afniYear}` : `${period} · ${CCB.afniYear} AFNI`}
            </p>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              <li className="rounded-lg bg-surface p-3 ring-1 ring-border">
                <p className="text-xs font-medium uppercase tracking-wide text-subtle">
                  {fr ? "Moins de 6 ans" : "Under 6"}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{money(CCB.maxUnder6Year)}</p>
                <p className="text-sm text-muted">
                  {fr
                    ? `${money(CCB.maxUnder6Month, 2)}/mois · maximum par enfant`
                    : `${money(CCB.maxUnder6Month, 2)}/month · max per child`}
                </p>
              </li>
              <li className="rounded-lg bg-surface p-3 ring-1 ring-border">
                <p className="text-xs font-medium uppercase tracking-wide text-subtle">
                  {fr ? "6 à 17 ans" : "Ages 6–17"}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{money(CCB.max6to17Year)}</p>
                <p className="text-sm text-muted">
                  {fr
                    ? `${money(CCB.max6to17Month, 2)}/mois · maximum par enfant`
                    : `${money(CCB.max6to17Month, 2)}/month · max per child`}
                </p>
              </li>
            </ul>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted">
              <li>
                {fr
                  ? `Montant intégral si le RFNR est sous environ ${money(CCB.fullAfni)}; il diminue au-dessus de ce seuil.`
                  : `Full amount if AFNI is under about ${money(CCB.fullAfni)}; phases down above that.`}
              </li>
              <li>
                {fr
                  ? "Exonéré d’impôt et versé chaque mois. Ce n’est pas un rabais sur une facture de garderie."
                  : "Tax-free monthly payment. It is not a daycare invoice discount."}
              </li>
            </ul>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
              <OfficialLink href={fr ? CCB.howMuchFr : CCB.howMuchEn}>
                {fr ? "Combien vous pouvez recevoir (Canada.ca)" : "How much you can get (Canada.ca)"}
              </OfficialLink>
              <OfficialLink href={fr ? CCB.overviewFr : CCB.overviewEn}>
                {fr ? "Allocation canadienne pour enfants" : "Canada Child Benefit overview"}
              </OfficialLink>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-surface-2 p-4 ring-1 ring-border">
            <h3 className="text-lg font-semibold">{fr ? "Prestation pour enfants handicapés" : "Child Disability Benefit"}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              {fr
                ? `Jusqu’à environ ${money(CDB.maxYear)}/an (${money(CDB.maxMonth)}/mois) par enfant admissible au crédit d’impôt pour personnes handicapées (CIPH). Versée avec l’ACE lorsque vous y avez droit — pas une demande KidEase.`
                : `Up to about ${money(CDB.maxYear)}/year (${money(CDB.maxMonth)}/month) per child eligible for the Disability Tax Credit (DTC). Paid with CCB when you qualify — not a KidEase application.`}
            </p>
            <div className="mt-3">
              <OfficialLink href={fr ? CDB.hrefFr : CDB.hrefEn}>
                {fr ? "Prestation pour enfants handicapés (Canada.ca)" : "Child Disability Benefit (Canada.ca)"}
              </OfficialLink>
            </div>
          </div>
        </section>

        <section id="cwelcc" className="mt-8 scroll-mt-24 rounded-xl bg-surface p-5 ring-1 ring-border md:p-6">
          <h2 className="font-display text-2xl">
            {fr
              ? "Apprentissage et garde des jeunes enfants à l'échelle du Canada (CWELCC)"
              : "Canada-Wide Early Learning and Child Care (CWELCC)"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            {fr
              ? "Entente fédérale-provinciale-territoriale pour réduire les frais aux centres permis participants, souvent autour de 10 $ par jour pour les enfants de moins de 6 ans. Le Québec a son propre régime de contribution réduite."
              : "CWELCC is the federal-provincial-territorial agreement to lower parent fees at participating licensed centres, often described as an average of about $10 a day for children under 6. Quebec has its own reduced-contribution system instead of the same fee schedule."}
          </p>
          <p className="mt-4 text-sm font-medium">{fr ? "Règles pour les familles" : "How the rules work for families"}</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-muted">
            <li>
              {fr
                ? "Les tarifs réduits de type 10 $ par jour sont fixés par la province ou le territoire et appliqués au centre participant — pas par KidEase."
                : "~$10-a-day style reduced fees are set by the province or territory and applied at the participating licensed centre — not by KidEase."}
            </li>
            <li>
              {fr
                ? "En général, aucune demande CWELCC séparée : si le centre est dans le programme, le tarif réduit est déjà sur la facture."
                : "You usually do not file a separate CWELCC application. If the centre is in the program, the lower parent fee is already on their invoice."}
            </li>
            <li>
              {fr
                ? "Tous les centres permis ne sont pas dans le programme. KidEase n'invente pas le tarif. Un badge 10 $/jour n'apparait que si le centre ou la province le confirme."
                : "Not every licensed centre is in CWELCC. KidEase will not guess. A $10-a-day badge should only appear when the centre or the province confirms it."}
            </li>
            <li>
              {fr
                ? "La subvention selon le revenu est un autre programme. Elle peut s'ajouter au tarif réduit là où les règles le permettent. Demande sur le site officiel de votre province (cartes ci-dessous)."
                : "Income-tested fee subsidies are a different program. They can stack on the reduced fee where the rules allow. Apply on your province’s official site (cards below)."}
            </li>
            <li>
              {fr
                ? "Âges, heures et types de places couverts varient. Confirmez avec le centre."
                : "Ages, hours, and space types covered by the reduced fee vary by jurisdiction. Confirm infant vs preschool coverage with the centre."}
            </li>
          </ul>
          <div className="mt-4">
            <OfficialLink href={fr ? CWELCC_HREF.fr : CWELCC_HREF.en}>
              {fr ? "Aperçu officiel (Canada.ca)" : "Official CWELCC overview (Canada.ca)"}
            </OfficialLink>
          </div>
        </section>

        <section id="provincial" className="mt-10 scroll-mt-24">
          <h2 className="font-display text-2xl">{t("benefitsSectionProvincial")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">{t("benefitsProvincialLead")}</p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {PROGRAMS.map((p) => (
              <li key={p.key}>
                <article className="flex h-full flex-col rounded-xl bg-surface p-5 shadow-card ring-1 ring-border">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-2xl">{t(p.title)}</h3>
                    {p.highlight ? (
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                        {fr ? `Nouveau · ${mbWhen}` : `What’s new · ${mbWhen}`}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 flex-1 text-sm leading-6 text-muted">{t(p.body)}</p>
                  <div className="mt-4 flex flex-col gap-2">
                    <OfficialLink href={p.href}>{t("benefitsApply")}</OfficialLink>
                    {p.extras?.map((extra) => (
                      <OfficialLink key={extra.href} href={extra.href}>
                        {fr ? extra.labelFr : extra.labelEn}
                      </OfficialLink>
                    ))}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-8 text-sm text-subtle">
          {t("benefitsNote")} {fr ? `Dernière revue : ${reviewed}.` : `Last reviewed: ${reviewed}.`}
        </p>
      </main>
      <SiteFooter />
    </Shell>
  );
}
