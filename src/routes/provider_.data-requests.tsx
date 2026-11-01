import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { completeDsrTask } from "@/lib/server/wiring/dsr-propagation";
import { dsrPropagationEnabled } from "@/lib/wiring/dsr-propagation";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/provider_/data-requests")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: dsrPropagationEnabled() }),
  head: () => ({ meta: [{ title: "Data requests · KidEase" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [id, setId] = useState("");
  const [note, setNote] = useState("");
  return (
    <WiringDesk kicker="KidEase" title={fr ? "Demandes de données" : "Data requests"} lead={fr ? "Marquez les dossiers du centre comme traités. Cela ne ferme pas la session du parent." : "Mark the centre’s records handled. This does not sign the parent out."} next={fr ? "Entrez le numéro, puis terminez." : "Enter the number, then finish."} enabled={enabled}>
      <label className="block text-sm font-medium" htmlFor="pdsr">{fr ? "Numéro" : "Number"}</label>
      <input id="pdsr" value={id} onChange={(event) => setId(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <Button className="mt-4" type="button" onClick={() => {
        void completeDsrTask({ data: { requestId: id } })
          .then((row) => setNote(row.ok ? row.status : row.error))
          .catch(() => setNote(fr ? "Ouvrez une session pour continuer." : "Sign in to continue."));
      }}>{fr ? "Marquer fait" : "Mark done"}</Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
    </WiringDesk>
  );
}
