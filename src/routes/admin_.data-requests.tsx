import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { useNativeHidesAdmin } from "@/lib/use-native-shell";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { assignCentreExport, loadDsrCentreDeskFlag } from "@/lib/server/wiring/dsr-centre-actions";
import { completeDsrTask } from "@/lib/server/wiring/dsr-propagation";
import { useCopy } from "@/lib/use-copy";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/admin_/data-requests")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => loadDsrCentreDeskFlag(),
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
  const [centreId, setCentreId] = useState("");
  const [verified, setVerified] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignment, setAssignment] = useState("");
  const failedAssignment = fr ? "Aucune tâche admissible n’a été attribuée. Vérifiez la demande et le centre." : "No eligible task was assigned. Check the request and the centre.";
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
      <input id="dsr-id" value={id} disabled={assigning} onChange={(event) => { setId(event.target.value); setVerified(false); setAssignment(""); }} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <Button className="mt-4" type="button" onClick={() => {
        void completeDsrTask({ data: { requestId: id } })
          .then((row) => setNote(row.ok ? row.status : row.error))
          .catch(() => setNote(fr ? "Admin seulement." : "Admin only."));
      }}>{fr ? "Marquer fait" : "Mark done"}</Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
      <section className="mt-6 space-y-3 border-t border-border pt-5" aria-labelledby="dsr-assignment">
        <h2 id="dsr-assignment" className="font-semibold">{fr ? "Attribuer une tâche d’exportation existante" : "Assign an existing export task"}</h2>
        <label className="block text-sm font-medium" htmlFor="dsr-centre-id">
          {fr ? "Identifiant vérifié du centre" : "Verified centre ID"}
        </label>
        <input id="dsr-centre-id" value={centreId} disabled={assigning} onChange={(event) => {
          setCentreId(event.target.value);
          setVerified(false);
          setAssignment("");
        }} className="w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={verified} disabled={assigning} onChange={(event) => setVerified(event.target.checked)} />
          {fr ? "J’ai confirmé que ce centre détient les dossiers visés par cette demande." : "I verified that this centre holds the records covered by this request."}
        </label>
        <Button type="button" disabled={assigning || !verified || !id.trim() || !centreId.trim()} onClick={() => {
          setAssigning(true);
          void assignCentreExport({ data: { requestId: id, centreId, verified } })
            .then((result) => {
              setAssignment(result.ok ? (fr ? "Tâche attribuée au centre." : "Task assigned to the centre.") : failedAssignment);
              if (result.ok) setVerified(false);
            })
            .catch(() => setAssignment(failedAssignment))
            .finally(() => setAssigning(false));
        }}>{fr ? "Attribuer au centre" : "Assign to centre"}</Button>
        {assignment ? <p className="text-sm" role="status">{assignment}</p> : null}
      </section>
    </WiringDesk>
  );
}
