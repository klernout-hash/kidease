import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/terms")({ component: Terms });

function Terms() {
  const { t, locale } = useCopy();
  const fr = locale === "fr";
  return (
    <Shell>
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="font-display text-3xl">{t("terms")}</h1>
        <p className="mt-2 text-sm text-subtle">KidEase · v1.0</p>
        <div className="mt-6 space-y-4 text-sm text-muted">
          {fr ? (
            <>
              <p>
                KidEase est un répertoire et un outil d’inscription pour des centres de garde
                permis. Nous ne sommes pas le fournisseur de garde. Le contrat de service est entre
                vous et le centre.
              </p>
              <p>
                Les places, heures et tarifs proviennent du registre manitobain et des fiches des
                centres. Vérifiez toujours auprès du centre avant d’inscrire un enfant.
              </p>
              <p>
                Les dépôts dans l’appli réservent une place. Les remboursements suivent la politique
                du centre. Les paiements de garde sont un service réel, pas un achat numérique.
              </p>
              <p>
                Vous êtes responsable de l’exactitude des renseignements sur vos enfants. N’ajoutez
                que des enfants dont vous avez la charge.
              </p>
              <p>Le droit applicable est celui du Manitoba et du Canada.</p>
            </>
          ) : (
            <>
              <p>
                KidEase is a directory and enrolment tool for licensed childcare centres. We
                are not the care provider. Your service agreement is with the centre.
              </p>
              <p>
                Spots, hours, and fees come from the Manitoba registry and from centre listings.
                Always confirm with the centre before you enrol a child.
              </p>
              <p>
                In-app deposits hold a spot. Refunds follow the centre’s policy. Childcare payments
                are a real-world service, not a digital in-app purchase.
              </p>
              <p>
                You are responsible for the accuracy of the children you add. Only add children in
                your care.
              </p>
              <p>These terms are governed by the laws of Manitoba and Canada.</p>
            </>
          )}
        </div>
      </main>
    </Shell>
  );
}
