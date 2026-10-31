import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { localePath } from "@/lib/locale-path";
import { pageSeoHead } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";

function trustSafetyHead(locale: "en" | "fr") {
  return pageSeoHead({
    title: locale === "fr" ? "Confiance et sécurité · KidEase" : "Trust and safety · KidEase",
    description:
      locale === "fr"
        ? "Comment KidEase vérifie les fiches permises et traite un signalement en 24 heures."
        : "How KidEase checks licensed listings and reviews a report within 24 hours.",
    path: locale === "fr" ? "/fr/trust-safety" : "/trust-safety",
    locale,
  });
}

export function TrustSafetyPage() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-3xl py-12">
        <p className="text-sm font-semibold text-primary">KidEase</p>
        <h1 className="mt-2 font-display text-4xl md:text-5xl">{fr ? "Confiance et sécurité" : "Trust and safety"}</h1>
        <p className="mt-4 text-lg text-muted">
          {fr
            ? "KidEase affiche des garderies permises au Canada. Voici comment nous gardons les fiches honnêtes, et le prochain pas si quelque chose ne va pas."
            : "KidEase lists licensed daycare in Canada. Here is how we keep listings honest, and the next step if something is wrong."}
        </p>
        <section className="mt-8 space-y-3 text-sm leading-6">
          <h2 className="font-display text-2xl">{fr ? "Ce que nous vérifions" : "What we check"}</h2>
          <p>
            {fr
              ? "Le numéro de permis vient du registre public quand la province le publie. Un propriétaire peut envoyer une pièce d’identité pour un examen par une personne. KidEase ne publie pas ce document."
              : "A licence number comes from the public registry when the province publishes one. An owner can send an identity document for a person to review. KidEase does not publish that document."}
          </p>
          <p>
            {fr
              ? "Les photos publiques sont des façades. Pas de visage d’enfant."
              : "Public photos are storefronts. No child’s face."}
          </p>
        </section>
        <section className="mt-8 space-y-3 text-sm leading-6">
          <h2 className="font-display text-2xl">{fr ? "Signaler une fiche" : "Report a listing"}</h2>
          <p>
            {fr
              ? "Un signalement ouvert vise une réponse en 24 heures. En cas de danger immédiat, appelez le 911 ou le bureau de permis de votre province."
              : "An open report aims for a reply within 24 hours. If someone is in danger now, call 911 or your province’s licensing office."}
          </p>
        </section>
        <p className="mt-8">
          <Link
            to={localePath("/report", locale)}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 font-medium text-primary-fg"
          >
            {fr ? "Signaler un problème" : "Report a problem"}
          </Link>
        </p>
      </main>
    </Shell>
  );
}

export const Route = createFileRoute("/trust-safety")({
  head: () => trustSafetyHead("en"),
  component: TrustSafetyPage,
});
