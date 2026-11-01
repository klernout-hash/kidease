import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { submitChangeRequest } from "@/lib/server/wiring/change-requests";
import { changeRequestsEnabled } from "@/lib/wiring/change-requests";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/provider_/change-requests")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: changeRequestsEnabled() }),
  head: () => ({ meta: [{ title: "Listing change · KidEase" }, { name: "robots", content: "noindex" }] }),
  component: ChangePage,
});

function ChangePage() {
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [daycareId, setDaycareId] = useState("");
  const [field, setField] = useState("hours");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  return (
    <WiringDesk
      kicker="KidEase"
      title={fr ? "Changement de fiche" : "Listing change"}
      lead={fr ? "La capacité, les heures, l’adresse ou la direction vont à la province. La fiche publique change après l’approbation." : "Capacity, hours, address, or director go to the province. The public listing changes after approval."}
      next={fr ? "Envoyez une demande." : "Send one request."}
      enabled={enabled}
    >
      <label className="block text-sm font-medium" htmlFor="ch-centre">{fr ? "Centre" : "Centre"}</label>
      <input id="ch-centre" value={daycareId} onChange={(event) => setDaycareId(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <label className="mt-3 block text-sm font-medium" htmlFor="ch-field">{fr ? "Champ" : "Field"}</label>
      <select id="ch-field" value={field} onChange={(event) => setField(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3">
        <option value="capacity">{fr ? "Capacité" : "Capacity"}</option>
        <option value="hours">{fr ? "Heures" : "Hours"}</option>
        <option value="address">{fr ? "Adresse" : "Address"}</option>
        <option value="director">{fr ? "Direction" : "Director"}</option>
      </select>
      <label className="mt-3 block text-sm font-medium" htmlFor="ch-value">{fr ? "Nouvelle valeur" : "New value"}</label>
      <input id="ch-value" value={value} onChange={(event) => setValue(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <Button className="mt-4" type="button" onClick={() => {
        void submitChangeRequest({ data: { daycareId, field, value } })
          .then((row) => setNote(row.ok ? (fr ? "En attente de la province." : "Waiting on the province.") : row.error))
          .catch(() => setNote(fr ? "Ouvrez une session pour continuer." : "Sign in to continue."));
      }}>{fr ? "Envoyer à la province" : "Send to the province"}</Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
    </WiringDesk>
  );
}
