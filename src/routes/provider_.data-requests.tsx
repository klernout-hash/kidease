import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listCentreExports, completeCentreExport, loadDsrCentreDeskFlag } from "@/lib/server/wiring/dsr-centre-actions";
import type { AssignedCentreExport } from "@/lib/server/wiring/dsr-centre-task";
import { createFileRoute } from "@tanstack/react-router";
import { WiringDesk } from "@/components/wiring-desk";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { useCopy } from "@/lib/use-copy";
import { ToolError, ToolPending } from "@/components/tool-states";

export const Route = createFileRoute("/provider_/data-requests")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => loadDsrCentreDeskFlag(),
  head: () => ({ meta: [{ title: "Data requests · KidEase" }, { name: "robots", content: "noindex" }] }),
  pendingComponent: ToolPending,
  errorComponent: ToolError,
  component: Page,
});

function Page() {
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const { user, isPending } = useCurrentUserState();
  return (
    <WiringDesk
      kicker="KidEase"
      title={fr ? "Demandes de données" : "Data requests"}
      lead={fr ? "Seules les tâches d’exportation attribuées à votre centre sont affichées ici." : "Only export tasks assigned to your centre appear here."}
      next={fr ? "Suivez les instructions de l’équipe de confidentialité avant de terminer la tâche." : "Follow the privacy team’s instructions before marking a task done."}
      enabled={enabled}
    >
      {enabled && user ? <CentreExportTasks key={user.id} fr={fr} /> : enabled && isPending ? <ExportTasksLoading fr={fr} /> : null}
    </WiringDesk>
  );
}

function ExportTasksLoading({ fr }: { fr: boolean }) {
  return <p className="text-sm text-muted" role="status">{fr ? "Chargement des tâches…" : "Loading tasks…"}</p>;
}

function CentreExportTasks({ fr }: { fr: boolean }) {
  const [rows, setRows] = useState<AssignedCentreExport[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    void listCentreExports()
      .then((result) => { if (live) setRows(result); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [revision]);

  if (failed) return <Button type="button" onClick={() => {
    setFailed(false);
    setRows(null);
    setRevision((n) => n + 1);
  }}>{fr ? "Réessayer" : "Try again"}</Button>;
  if (!rows) return <ExportTasksLoading fr={fr} />;

  return (
    <div className="space-y-3">
      {rows.length === 0 ? <p className="text-sm">{fr ? "Aucune tâche d’exportation attribuée." : "No assigned export tasks."}</p> : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li className="rounded-xl border border-border p-3" key={row.taskId}>
              <p className="font-semibold">{row.centreName}</p>
              <p className="break-all text-sm text-muted">{fr ? "Référence de la tâche" : "Task reference"}: {row.taskId}</p>
              <Button type="button" className="mt-2" disabled={busy !== null} onClick={() => {
                setBusy(row.taskId);
                const failure = fr ? "La tâche n’a pas été modifiée." : "The task was not changed.";
                void completeCentreExport({ data: { taskId: row.taskId } })
                  .then((result) => {
                    if (!result.ok) {
                      setNote(failure);
                      return;
                    }
                    setRows((current) => current?.filter((item) => item.taskId !== row.taskId) ?? null);
                    setNote(fr ? "Tâche du centre terminée. KidEase doit encore vérifier la demande." : "Centre task complete. KidEase still reviews the request.");
                  })
                  .catch(() => setNote(failure))
                  .finally(() => setBusy(null));
              }}>{fr ? "Terminer la tâche du centre" : "Mark centre task done"}</Button>
            </li>
          ))}
        </ul>
      )}
      {note ? <p role="status" className="text-sm">{note}</p> : null}
    </div>
  );
}
