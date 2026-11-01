import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { GovHelp } from "@/components/gov/gov-help";
import { GovNativeNote } from "@/components/gov/gov-login";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { guardGovDesk, govRobotsHead } from "@/lib/gov/desk-guard";
import { listChangeQueue, reviewChangeRequest } from "@/lib/server/wiring/change-requests";
import { changeRequestsEnabled } from "@/lib/wiring/change-requests";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/gov_/change-requests")({
  beforeLoad: ({ context }) => guardGovDesk("en", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  loader: () => ({ enabled: changeRequestsEnabled() }),
  head: () => govRobotsHead("Listing changes · KidEase"),
  component: GovChangePage,
});

function GovChangePage() {
  const gate = Route.useRouteContext() as { nativeOnly?: boolean };
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [id, setId] = useState("");
  const [note, setNote] = useState("");
  if (gate.nativeOnly) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 py-10">
        <GovNativeNote locale={fr ? "fr" : "en"} />
        <GovHelp locale={fr ? "fr" : "en"} />
      </main>
    );
  }
  return (
    <WiringDesk
      gov
      kicker="KidEase"
      title={fr ? "Demandes de fiche" : "Listing changes"}
      lead={fr ? "Vous voyez seulement votre province. La fiche publique change après votre oui." : "You see only your province. The public listing changes after you say yes."}
      next={fr ? "Approuvez ou refusez une demande." : "Approve or decline one request."}
      enabled={enabled}
    >
      <label className="block text-sm font-medium" htmlFor="change-id">{fr ? "Numéro de la demande" : "Request number"}</label>
      <input id="change-id" value={id} onChange={(event) => setId(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <Button className="mt-4" type="button" onClick={() => {
        void reviewChangeRequest({ data: { id, decision: "approve" } })
          .then(async (row) => {
            const queue = await listChangeQueue();
            setNote(row.ok ? `${fr ? "Approuvé. En attente" : "Approved. Waiting"}: ${queue.enabled ? queue.rows.length : 0}` : row.error);
          })
          .catch(() => setNote(fr ? "Bureau gouvernemental seulement." : "Government desk only."));
      }}>{fr ? "Approuver" : "Approve"}</Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
    </WiringDesk>
  );
}
