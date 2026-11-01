import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { useNativeHidesAdmin } from "@/lib/use-native-shell";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { completeDsrTask } from "@/lib/server/wiring/dsr-propagation";
import { dsrPropagationEnabled } from "@/lib/wiring/dsr-propagation";
import { useCopy } from "@/lib/use-copy";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/admin_/data-requests")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: dsrPropagationEnabled() }),
  head: () => ({ meta: [{ title: "Data requests · KidEase" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const { enabled } = Route.useLoaderData();
  const native = useNativeHidesAdmin();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [id, setId] = useState("");
  const [note, setNote] = useState("");
  if (native) {
    return (
      <WiringDesk kicker="KidEase" title={fr ? "Admin sur le site" : "Admin is on the website"} lead={fr ? "L’admin reste sur kidease.ca dans un navigateur." : "Admin stays on kidease.ca in a browser."} next={fr ? "Ouvrez le site." : "Open the website."} enabled>
        <Link to="/app-admin-unavailable" className="inline-flex min-h-11 items-center font-semibold text-primary">{fr ? "Comment ouvrir l’admin" : "How to open admin"}</Link>
      </WiringDesk>
    );
  }
  return (
    <WiringDesk kicker="KidEase" title={fr ? "Demandes de données" : "Data requests"} lead={fr ? "Marquez la part admin comme faite. Une retenue bloque la suppression." : "Mark the admin part done. A hold blocks deletion."} next={fr ? "Entrez le numéro, puis terminez." : "Enter the number, then finish."} enabled={enabled}>
      <label className="block text-sm font-medium" htmlFor="dsr-id">{fr ? "Numéro" : "Number"}</label>
      <input id="dsr-id" value={id} onChange={(event) => setId(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <Button className="mt-4" type="button" onClick={() => {
        void completeDsrTask({ data: { requestId: id } })
          .then((row) => setNote(row.ok ? row.status : row.error))
          .catch(() => setNote(fr ? "Admin seulement." : "Admin only."));
      }}>{fr ? "Marquer fait" : "Mark done"}</Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
    </WiringDesk>
  );
}
