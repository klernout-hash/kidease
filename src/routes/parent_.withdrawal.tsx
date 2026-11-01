import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { requestWithdrawal } from "@/lib/server/wiring/withdrawal";
import { withdrawalEnabled } from "@/lib/wiring/withdrawal";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/parent_/withdrawal")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: withdrawalEnabled() }),
  head: () => ({ meta: [{ title: "Withdrawal · KidEase" }, { name: "robots", content: "noindex" }] }),
  component: WithdrawalPage,
});

function WithdrawalPage() {
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [daycareId, setDaycareId] = useState("");
  const [ageGroup, setAgeGroup] = useState("preschool");
  const [requestedOn, setRequestedOn] = useState("");
  const [lastDay, setLastDay] = useState("");
  const [note, setNote] = useState("");
  return (
    <WiringDesk
      kicker="KidEase"
      title={fr ? "Retrait" : "Withdrawal"}
      lead={fr ? "Le préavis du centre s’applique. La dernière facture utilise le tarif déjà affiché. La place libérée peut alerter la liste d’attente du secteur." : "The centre’s notice period applies. The last bill uses the fee already on file. A freed space can alert the area waitlist."}
      next={fr ? "Choisissez le dernier jour, puis envoyez." : "Pick the last day, then send."}
      enabled={enabled}
    >
      <label className="block text-sm font-medium" htmlFor="wd-centre">{fr ? "Centre" : "Centre"}</label>
      <input id="wd-centre" value={daycareId} onChange={(event) => setDaycareId(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <label className="mt-3 block text-sm font-medium" htmlFor="wd-age">{fr ? "Groupe" : "Age group"}</label>
      <select id="wd-age" value={ageGroup} onChange={(event) => setAgeGroup(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3">
        <option value="infant">Infant</option>
        <option value="toddler">Toddler</option>
        <option value="preschool">Preschool</option>
      </select>
      <label className="mt-3 block text-sm font-medium" htmlFor="wd-req">{fr ? "Demandé le" : "Requested on"}</label>
      <input id="wd-req" type="date" value={requestedOn} onChange={(event) => setRequestedOn(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <label className="mt-3 block text-sm font-medium" htmlFor="wd-last">{fr ? "Dernier jour" : "Last day"}</label>
      <input id="wd-last" type="date" value={lastDay} onChange={(event) => setLastDay(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <Button
        className="mt-4"
        type="button"
        onClick={() => {
          void requestWithdrawal({ data: { daycareId, ageGroup, requestedOn, lastDay } })
            .then((row) => setNote(row.ok ? (fr ? "Demande enregistrée." : "Request saved.") : row.error))
            .catch(() => setNote(fr ? "Ouvrez une session pour continuer." : "Sign in to continue."));
        }}
      >
        {fr ? "Envoyer le préavis" : "Send notice"}
      </Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
    </WiringDesk>
  );
}
