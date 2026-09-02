import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";

export const Route = createFileRoute("/benefits")({ component: BenefitsPage });

const PROGRAMS: { key: string; title: CopyKey; body: CopyKey; href: string }[] = [
  { key: "ab", title: "benefitsAbT", body: "benefitsAb", href: "https://www.alberta.ca/child-care-subsidy" },
  { key: "bc", title: "benefitsBcT", body: "benefitsBc", href: "https://www.gov.bc.ca/affordablechildcarebenefit" },
  { key: "fed", title: "benefitsFedT", body: "benefitsFed", href: "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit.html" },
  { key: "mb", title: "benefitsMbT", body: "benefitsMb", href: "https://www.gov.mb.ca/education/childcare/families/childcare_subsidies.html" },
  { key: "nb", title: "benefitsNbT", body: "benefitsNb", href: "https://www2.gnb.ca/content/gnb/en/corporate/promo/investing-in-early-learning-and-child-care/information-for-families/guide.html" },
  { key: "nl", title: "benefitsNlT", body: "benefitsNl", href: "https://www.gov.nl.ca/education/childcare/childcaresubsidy/" },
  { key: "nt", title: "benefitsNtT", body: "benefitsNt", href: "https://www.ece.gov.nt.ca/en/average-10-day-child-care" },
  { key: "ns", title: "benefitsNsT", body: "benefitsNs", href: "https://childcarenovascotia.ca/families/child-care-subsidy" },
  { key: "nu", title: "benefitsNuT", body: "benefitsNu", href: "https://www.gov.nu.ca/en/education-and-schools/10_day-child-care" },
  { key: "on", title: "benefitsOnT", body: "benefitsOn", href: "https://www.ontario.ca/page/child-care-subsidies" },
  { key: "pe", title: "benefitsPeT", body: "benefitsPe", href: "https://www.princeedwardisland.ca/en/information/social-development-and-seniors/help-for-child-care-expenses" },
  { key: "qc", title: "benefitsQcT", body: "benefitsQc", href: "https://www.revenuquebec.ca/en/citizens/tax-credits/tax-credit-for-childcare-expenses/" },
  { key: "sk", title: "benefitsSkT", body: "benefitsSk", href: "https://www.saskatchewan.ca/residents/family-and-social-support/child-care" },
  { key: "yt", title: "benefitsYtT", body: "benefitsYt", href: "https://yukon.ca/en/universal-child-care" },
];

function BenefitsPage() {
  const { t, locale } = useCopy();
  const fr = locale === "fr";
  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-3xl py-10">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">{t("benefitsShort")}</p>
        <h1 className="mt-2 text-4xl">{t("benefitsTitle")}</h1>
        <p className="mt-4 max-w-2xl text-muted">{t("benefitsLead")}</p>
        <section className="mt-8 rounded-xl bg-surface p-5 ring-1 ring-border md:p-6">
          <h2 className="font-display text-2xl">
            {fr
              ? "Apprentissage et garde des jeunes enfants a l'echelle du Canada (CWELCC)"
              : "Canada-Wide Early Learning and Child Care (CWELCC)"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            {fr
              ? "Entente federale-provinciale-territoriale pour reduire les frais aux centres permis participants, souvent autour de 10 $ par jour pour les enfants de moins de 6 ans. Le Quebec a son propre regime de contribution reduite."
              : "CWELCC is the federal-provincial-territorial agreement to lower parent fees at participating licensed centres, often described as an average of about $10 a day for children under 6. Quebec has its own reduced-contribution system instead of the same fee schedule."}
          </p>
          <p className="mt-4 text-sm font-medium">{fr ? "Regles pour les familles" : "How the rules work for families"}</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-muted">
            <li>{fr ? "Les tarifs reduits sont fixes par la province ou le territoire et appliques au centre participant \u2014 pas par KidEase." : "Reduced CWELCC fees are set by the province or territory and applied at participating licensed centres \u2014 not by KidEase."}</li>
            <li>{fr ? "En general, aucune demande CWELCC separee : si le centre est dans le programme, le tarif reduit est deja sur la facture." : "You usually do not file a separate CWELCC application. If the centre is in the program, the lower parent fee is already on their invoice."}</li>
            <li>{fr ? "Tous les centres permis ne sont pas dans le programme. KidEase n'invente pas le tarif. Un badge 10 $/jour n'apparait que si le centre ou la province le confirme." : "Not every licensed centre is in CWELCC. KidEase will not guess. A $10-a-day badge should only appear when the centre or the province confirms it."}</li>
            <li>{fr ? "La subvention selon le revenu est un autre programme. Elle peut s'ajouter au tarif reduit. Demande sur le site officiel de votre province (cartes ci-dessous)." : "Income-tested fee subsidies are a different program. Eligible families can stack subsidy on top of the reduced fee. Apply on your province's official site (cards below)."}</li>
            <li>{fr ? "Ages, heures et types de places couverts varient. Confirmez avec le centre." : "Ages, hours, and space types covered by the reduced fee vary by jurisdiction. Confirm infant vs preschool coverage with the centre."}</li>
          </ul>
          <a
            href={fr ? "https://www.canada.ca/fr/entente-apprentissage-garde-jeunes-enfants.html" : "https://www.canada.ca/en/early-learning-child-care-agreement.html"}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary"
          >
            {fr ? "Apercu officiel (Canada.ca)" : "Official CWELCC overview (Canada.ca)"}
            <ArrowUpRight className="size-4" />
          </a>
        </section>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {PROGRAMS.map((p) => (
            <li key={p.key}>
              <a href={p.href} target="_blank" rel="noreferrer" className="flex h-full flex-col rounded-xl bg-surface p-5 shadow-card ring-1 ring-border transition-shadow hover:shadow-lift">
                <h2 className="text-2xl">{t(p.title)}</h2>
                <p className="mt-2 flex-1 text-sm text-muted">{t(p.body)}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  {t("benefitsApply")}
                  <ArrowUpRight className="size-4" />
                </span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-subtle">{t("benefitsNote")}</p>
      </main>
      <SiteFooter />
    </Shell>
  );
}
