import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/privacy")({ component: Privacy });

const EN = {
  collectT: "What we collect",
  collect:
    "Account details (name, email, sign-in provider). Optional child profiles you add (first name, birthdate or age, allergies, routines, foods, emergency contacts). Search location you choose. Messages, spot requests, and claim documents a provider uploads. Payment records only if you pay a deposit in-app.",
  useT: "How we use it",
  use: "To show licensed centres near you, send your request to a centre, let a claimed provider manage their listing, notify kyle@kidease.ca of new accounts and requests, and improve search. We do not use children\u2019s profiles for advertising.",
  shareT: "Who can see it",
  share:
    "Child and family details are visible only to you and to a centre you contact or enrol with. We do not sell or rent personal information. Processors we may use (hosting, email, payments) are given only what they need to run that service.",
  keepT: "Retention and security",
  keep: "We keep account and request records while the account is open, then delete or anonymize them when you ask us to close the account, unless a law requires a longer hold. Data in transit is encrypted (HTTPS). Production card payments would go through PCI-compliant processors (Stripe, Interac) \u2014 KidEase does not store full card numbers.",
  rightsT: "Your rights",
  rights:
    "You can access, correct, or delete your account and child profiles in the app, or email kyle@kidease.ca. You can withdraw consent by closing the account. For a PIPEDA complaint you can also contact the Office of the Privacy Commissioner of Canada.",
  kidsT: "Child safety",
  kids: "KidEase is a parent and provider tool, not a children\u2019s app. We do not livestream children. Video or voice check-in, if offered, is started by the parent. Providers must be provincially or territorially licensed before they can claim and edit a listing.",
  official: "Read PIPEDA on the Privacy Commissioner site",
  href: "https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/",
  note: "This page explains how KidEase handles personal information. It is not legal advice. Official PIPEDA text lives on the Privacy Commissioner of Canada website.",
};

const FR = {
  collectT: "Ce que nous recueillons",
  collect:
    "Coordonn\u00e9es du compte. Profils d\u2019enfants que vous ajoutez (pr\u00e9nom, \u00e2ge ou date de naissance, allergies, routines, contacts d\u2019urgence). Lieu de recherche. Messages, demandes de place et pi\u00e8ces de revendication. Relev\u00e9s de paiement seulement si vous versez un d\u00e9p\u00f4t.",
  useT: "Utilisation",
  use: "Pour afficher les centres permis pr\u00e8s de vous, transmettre votre demande, laisser un fournisseur g\u00e9rer sa fiche, aviser kyle@kidease.ca, et am\u00e9liorer la recherche. Pas de publicit\u00e9 \u00e0 partir des profils d\u2019enfants.",
  shareT: "Qui voit les donn\u00e9es",
  share:
    "Les d\u00e9tails familiaux ne sont visibles que par vous et le centre contact\u00e9. Aucune vente de donn\u00e9es. Les sous-traitants ne re\u00e7oivent que ce qu\u2019il faut pour le service.",
  keepT: "Conservation et s\u00e9curit\u00e9",
  keep: "Nous gardons le compte tant qu\u2019il est ouvert, puis nous le supprimons ou l\u2019anonymisons \u00e0 votre demande, sauf obligation l\u00e9gale. Le transit est chiffr\u00e9 (HTTPS). Les paiements par carte passeraient par des processeurs conformes PCI.",
  rightsT: "Vos droits",
  rights:
    "Vous pouvez consulter, corriger ou supprimer votre compte dans l\u2019appli, ou \u00e9crire \u00e0 kyle@kidease.ca. Vous pouvez retirer votre consentement en fermant le compte. Une plainte LPRPDE peut aussi aller au Commissariat \u00e0 la protection de la vie priv\u00e9e du Canada.",
  kidsT: "S\u00e9curit\u00e9 des enfants",
  kids: "Outil pour parents et fournisseurs \u2014 pas une appli pour enfants. Pas de diffusion continue. Une visio, le cas \u00e9ch\u00e9ant, est lanc\u00e9e par le parent. Un fournisseur doit \u00eatre permis pour revendiquer une fiche.",
  official: "Lire la LPRPDE sur le site du Commissariat",
  href: "https://www.priv.gc.ca/fr/sujets-lies-a-la-protection-de-la-vie-privee/lois-sur-la-protection-des-renseignements-personnels-au-canada/la-loi-sur-la-protection-des-renseignements-personnels-et-les-documents-electroniques-lprpde/",
  note: "Cette page d\u00e9crit le traitement des renseignements personnels. Ce n\u2019est pas un avis juridique. Le texte officiel de la LPRPDE est sur le site du Commissariat.",
};

function Privacy() {
  const { t, locale } = useCopy();
  const s = locale === "fr" ? FR : EN;
  const blocks = [
    [s.collectT, s.collect],
    [s.useT, s.use],
    [s.shareT, s.share],
    [s.keepT, s.keep],
    [s.rightsT, s.rights],
    [s.kidsT, s.kids],
  ];

  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-2xl py-10 md:py-14">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">{t("privacy")}</p>
        <h1 className="mt-2 font-display text-3xl md:text-4xl">{t("pipeda")}</h1>
        <p className="mt-4 text-muted">{t("pipedaBody")}</p>
        <div className="mt-8 space-y-6">
          {blocks.map(([title, body]) => (
            <section key={title}>
              <h2 className="font-display text-xl">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
            </section>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted">{t("neverSell")}</p>
        <a href={s.href} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
          {s.official} \u2197
        </a>
        <h2 className="mt-12 font-display text-2xl">{t("privacyNutrition")}</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted">
          <li>{t("locData")}</li>
          <li>{t("contactData")}</li>
          <li>{t("userContent")}</li>
          <li>{t("identifiers")}</li>
          <li>{t("payData")}</li>
        </ul>
        <p className="mt-8 text-sm text-muted">
          {locale === "fr" ? "Questions de confidentialit\u00e9 :" : "Privacy questions:"}{" "}
          <a href="mailto:kyle@kidease.ca" className="text-primary underline-offset-4 hover:underline">kyle@kidease.ca</a>
          {" \u00b7 "}
          <Link to="/account" className="underline-offset-4 hover:underline">{t("deleteAccount")}</Link>
          {" \u00b7 "}
          <Link to="/support" className="underline-offset-4 hover:underline">{t("support")}</Link>
          {" \u00b7 "}
          <Link to="/terms" className="underline-offset-4 hover:underline">{t("terms")}</Link>
        </p>
        <p className="mt-6 text-xs text-subtle">{s.note}</p>
      </main>
      <SiteFooter />
    </Shell>
  );
}
