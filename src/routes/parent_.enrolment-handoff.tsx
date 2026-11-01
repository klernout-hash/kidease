import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { runEnrolmentStep } from "@/lib/server/wiring/enrolment-handoff";
import { enrolmentHandoffEnabled } from "@/lib/wiring/enrolment-handoff";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/parent_/enrolment-handoff")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: enrolmentHandoffEnabled() }),
  head: () => ({
    meta: [
      { title: "Enrolment · KidEase" },
      { name: "description", content: "Accept a spot, sign the packet, then see the first bill." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EnrolmentHandoffPage,
});

export function EnrolmentHandoffPage() {
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [offerId, setOfferId] = useState("");
  const [note, setNote] = useState("");
  return (
    <WiringDesk
      kicker="KidEase"
      title={fr ? "Inscription" : "Enrolment"}
      lead={
        fr
          ? "KidEase relie l’offre acceptée, les documents, la signature et la première facture."
          : "KidEase connects an accepted spot, the packet, the signature, and the first bill."
      }
      next={fr ? "Entrez le numéro de l’offre, puis continuez." : "Enter the offer number, then continue."}
      enabled={enabled}
    >
      <label className="block text-sm font-medium" htmlFor="offer-id">
        {fr ? "Numéro de l’offre" : "Offer number"}
      </label>
      <input
        id="offer-id"
        value={offerId}
        onChange={(event) => setOfferId(event.target.value)}
        className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3"
        autoComplete="off"
      />
      <Button
        className="mt-4"
        type="button"
        onClick={() => {
          void runEnrolmentStep({ data: { offerId, event: "accept" } })
            .then((row) => setNote(row.ok ? row.step : row.error))
            .catch(() => setNote(fr ? "Ouvrez une session pour continuer." : "Sign in to continue."));
        }}
      >
        {fr ? "Continuer" : "Continue"}
      </Button>
      {note ? (
        <p className="mt-3 text-sm" role="status">
          {note}
        </p>
      ) : null}
      <p className="mt-4">
        <Link to="/parent/spot-offers" className="inline-flex min-h-11 items-center underline">
          {fr ? "Voir vos offres" : "See your offers"}
        </Link>
      </p>
    </WiringDesk>
  );
}
