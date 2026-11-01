import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { updateSubsidy } from "@/lib/server/wiring/subsidy-status";
import { subsidyStatusEnabled } from "@/lib/wiring/subsidy-status";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/provider_/subsidy")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: subsidyStatusEnabled() }),
  head: () => ({ meta: [{ title: "Update subsidy · KidEase" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [id, setId] = useState("");
  const [status, setStatus] = useState("in_review");
  const [note, setNote] = useState("");
  return (
    <WiringDesk
      kicker="KidEase"
      title={fr ? "Mettre à jour une subvention" : "Update a subsidy"}
      lead={fr ? "Vous notez le statut que la famille vous a donné. KidEase ne verse pas la subvention." : "You record the status the family told you. KidEase does not pay the subsidy."}
      next={fr ? "Choisissez le statut, puis enregistrez." : "Pick the status, then save."}
      enabled={enabled}
    >
      <label className="block text-sm font-medium" htmlFor="sub-id">{fr ? "Numéro" : "Number"}</label>
      <input id="sub-id" value={id} onChange={(event) => setId(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <label className="mt-3 block text-sm font-medium" htmlFor="sub-status">{fr ? "Statut" : "Status"}</label>
      <select id="sub-status" value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3">
        <option value="in_review">{fr ? "En examen" : "In review"}</option>
        <option value="approved">{fr ? "Approuvé" : "Approved"}</option>
        <option value="declined">{fr ? "Refusé" : "Declined"}</option>
      </select>
      <Button className="mt-4" type="button" onClick={() => {
        void updateSubsidy({ data: { id, status } })
          .then((row) => setNote(row.ok ? row.status : row.error))
          .catch(() => setNote(fr ? "Ouvrez une session pour continuer." : "Sign in to continue."));
      }}>{fr ? "Enregistrer" : "Save"}</Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
    </WiringDesk>
  );
}
