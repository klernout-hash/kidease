import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { myEscalations, openEscalation } from "@/lib/server/wiring/escalations";
import { escalationsEnabled } from "@/lib/wiring/escalations";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/parent_/escalations")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: escalationsEnabled() }),
  head: () => ({ meta: [{ title: "Needs a review · KidEase" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [hours, setHours] = useState("48");
  const [note, setNote] = useState("");
  return (
    <WiringDesk kicker="KidEase" title={fr ? "Délai de suivi" : "Follow-up time"} lead={fr ? "Si un dossier reste ouvert trop longtemps, l’admin le voit. Vous voyez le même statut." : "If an item stays open too long, admin sees it. You see the same status."} next={fr ? "Choisissez le nombre d’heures, puis enregistrez." : "Pick the hours, then save."} enabled={enabled}>
      <label className="block text-sm font-medium" htmlFor="sla">{fr ? "Heures" : "Hours"}</label>
      <input id="sla" inputMode="numeric" value={hours} onChange={(event) => setHours(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <Button className="mt-4" type="button" onClick={() => {
        void openEscalation({ data: { kind: "parent_request", refId: "manual", province: "MB", slaHours: Number(hours) } })
          .then(async (row) => {
            const list = await myEscalations();
            setNote(row.ok ? `${fr ? "Ouvert" : "Open"} ${list.enabled ? list.rows.length : 0}` : row.error);
          })
          .catch(() => setNote(fr ? "Ouvrez une session pour continuer." : "Sign in to continue."));
      }}>{fr ? "Enregistrer le délai" : "Save the time"}</Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
    </WiringDesk>
  );
}
