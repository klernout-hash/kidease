import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { myDataRequests, openDataRequest } from "@/lib/server/wiring/dsr-propagation";
import { dsrPropagationEnabled } from "@/lib/wiring/dsr-propagation";
import { useCopy } from "@/lib/use-copy";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/parent_/data-request")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: dsrPropagationEnabled() }),
  head: () => ({ meta: [{ title: "Your data · KidEase" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [kind, setKind] = useState("export");
  const [note, setNote] = useState("");
  return (
    <WiringDesk
      kicker="KidEase"
      title={fr ? "Vos renseignements" : "Your information"}
      lead={fr ? "Une demande d’exportation ou de suppression va à chaque rôle concerné. Une retenue légale bloque la suppression. Votre session reste ouverte." : "An export or deletion request goes to every role that holds records. A legal hold blocks deletion. Your sign-in stays open."}
      next={fr ? "Choisissez exportation ou suppression. Pour fermer le compte, utilisez Supprimer le compte." : "Choose export or deletion. To close the account, use Delete account."}
      enabled={enabled}
    >
      <label className="block text-sm font-medium" htmlFor="dsr-kind">{fr ? "Demande" : "Request"}</label>
      <select id="dsr-kind" value={kind} onChange={(event) => setKind(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3">
        <option value="export">{fr ? "Exporter" : "Export"}</option>
        <option value="delete">{fr ? "Supprimer" : "Delete"}</option>
      </select>
      <Button className="mt-4" type="button" onClick={() => {
        void openDataRequest({ data: { kind, province: "MB" } })
          .then(async (row) => {
            const mine = await myDataRequests();
            setNote(row.ok ? `${row.status} ${mine.enabled ? mine.rows.length : 0}` : row.error);
          })
          .catch(() => setNote(fr ? "Ouvrez une session pour continuer." : "Sign in to continue."));
      }}>{fr ? "Envoyer la demande" : "Send the request"}</Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
      <p className="mt-4">
        <Link to="/delete-account" className="inline-flex min-h-11 items-center underline">{fr ? "Supprimer le compte" : "Delete account"}</Link>
      </p>
    </WiringDesk>
  );
}
