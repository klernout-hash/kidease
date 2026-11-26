import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { myChangeRequests, resubmitChangeRequest, submitChangeRequest } from "@/lib/server/wiring/change-requests";
import { changeRequestsEnabled } from "@/lib/wiring/change-requests";
import { useCopy } from "@/lib/use-copy";
import { ToolError, ToolPending } from "@/components/tool-states";

export const Route = createFileRoute("/provider_/change-requests")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: async () => {
    const enabled = changeRequestsEnabled();
    const mine = await myChangeRequests().catch(() => null);
    return { enabled: enabled && Boolean(mine?.enabled), centres: mine?.centres ?? [], rows: mine?.rows ?? [] };
  },
  head: () => ({ meta: [{ title: "Listing change · KidEase" }, { name: "robots", content: "noindex" }] }),
  pendingComponent: ToolPending,
  errorComponent: ToolError,
  component: ChangePage,
});

const FIELDS: Record<string, [string, string]> = {
  capacity: ["Capacity", "Capacité"],
  hours: ["Hours", "Heures"],
  address: ["Address", "Adresse"],
  director: ["Director", "Direction"],
};

const VIEWS: Record<string, [string, string]> = {
  to_review: ["Waiting on the province", "En attente de la province"],
  returned: ["Sent back to you", "Renvoyée à vous"],
  approved: ["Approved", "Approuvée"],
  declined: ["Declined", "Refusée"],
};

function errorText(fr: boolean, code: string): string {
  const map: Record<string, [string, string]> = {
    off: ["Listing changes are not turned on yet.", "Les changements de fiche ne sont pas encore activés."],
    centre: ["Pick one of your centres.", "Choisissez un de vos centres."],
    field: ["Pick what to change.", "Choisissez quoi changer."],
    value: ["Check the new value.", "Vérifiez la nouvelle valeur."],
    state: ["This request can’t be sent again.", "Cette demande ne peut pas être renvoyée."],
    migration: ["Sending back is not ready yet.", "Le renvoi n’est pas encore prêt."],
  };
  const pair = map[code] ?? ["Something went wrong. Try again.", "Un problème est survenu. Réessayez."];
  return fr ? pair[1] : pair[0];
}

function ChangePage() {
  const { enabled, centres, rows } = Route.useLoaderData();
  const router = useRouter();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [daycareId, setDaycareId] = useState(centres[0]?.id ?? "");
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
      {centres.length ? (
        <select id="ch-centre" value={daycareId} onChange={(event) => setDaycareId(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3">
          {centres.map((centre) => (
            <option key={centre.id} value={centre.id}>{centre.name}</option>
          ))}
        </select>
      ) : (
        <p id="ch-centre" className="mt-1 text-sm text-muted">{fr ? "Aucun centre relié à ce compte." : "No centre is linked to this account."}</p>
      )}
      <label className="mt-3 block text-sm font-medium" htmlFor="ch-field">{fr ? "Champ" : "Field"}</label>
      <select id="ch-field" value={field} onChange={(event) => setField(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3">
        {Object.entries(FIELDS).map(([key, pair]) => (
          <option key={key} value={key}>{fr ? pair[1] : pair[0]}</option>
        ))}
      </select>
      <label className="mt-3 block text-sm font-medium" htmlFor="ch-value">{fr ? "Nouvelle valeur" : "New value"}</label>
      <input id="ch-value" value={value} onChange={(event) => setValue(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <Button className="mt-4" type="button" disabled={!daycareId} onClick={() => {
        void submitChangeRequest({ data: { daycareId, field, value } })
          .then((row) => {
            setNote(row.ok ? (fr ? "En attente de la province." : "Waiting on the province.") : errorText(fr, row.error));
            if (row.ok) {
              setValue("");
              void router.invalidate();
            }
          })
          .catch(() => setNote(fr ? "Ouvrez une session pour continuer." : "Sign in to continue."));
      }}>{fr ? "Envoyer à la province" : "Send to the province"}</Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
      <h2 className="mt-8 font-display text-xl">{fr ? "Vos demandes" : "Your requests"}</h2>
      {rows.length ? (
        <ul className="mt-3 space-y-3" data-ke="provider-change-list">
          {rows.map((row) => (
            <ChangeItem key={row.id} fr={fr} row={row} onDone={() => void router.invalidate()} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">{fr ? "Aucune demande pour l’instant." : "No requests yet."}</p>
      )}
    </WiringDesk>
  );
}

function ChangeItem({
  fr,
  row,
  onDone,
}: {
  fr: boolean;
  row: { id: string; centre: string; field: string; proposed_value: string; view: string; review_note: string | null; created_at: string };
  onDone: () => void;
}) {
  const [value, setValue] = useState(row.proposed_value);
  const [status, setStatus] = useState("");
  const fieldName = FIELDS[row.field] ? (fr ? FIELDS[row.field][1] : FIELDS[row.field][0]) : row.field;
  const view = VIEWS[row.view] ? (fr ? VIEWS[row.view][1] : VIEWS[row.view][0]) : row.view;
  return (
    <li className="rounded-xl bg-surface p-3 text-sm ring-1 ring-border" data-ke="provider-change-item" data-view={row.view}>
      <p className="font-medium">{row.centre} · {fieldName}</p>
      <p className="mt-1">{row.proposed_value}</p>
      <p className="mt-1 text-muted">{view} · {row.created_at.slice(0, 10)}</p>
      {row.review_note ? (
        <p className="mt-2">
          {fr ? "Note de la province" : "Province note"}: {row.review_note}
        </p>
      ) : null}
      {row.view === "returned" ? (
        <div className="mt-2 space-y-2" data-ke="provider-change-resubmit">
          <label className="block font-medium" htmlFor={`rs-${row.id}`}>{fr ? "Valeur corrigée" : "Fixed value"}</label>
          <input id={`rs-${row.id}`} value={value} onChange={(event) => setValue(event.target.value)} className="w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
          <Button type="button" onClick={() => {
            void resubmitChangeRequest({ data: { id: row.id, value } })
              .then((result) => {
                if (result.ok) onDone();
                else setStatus(errorText(fr, result.error));
              })
              .catch(() => setStatus(errorText(fr, "")));
          }}>{fr ? "Renvoyer à la province" : "Send again"}</Button>
          {status ? <p role="status">{status}</p> : null}
        </div>
      ) : null}
    </li>
  );
}
