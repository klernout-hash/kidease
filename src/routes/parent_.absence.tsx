import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { reportAbsence } from "@/lib/server/wiring/absence-reports";
import { absenceReportsEnabled } from "@/lib/wiring/absence-reports";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/parent_/absence")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: absenceReportsEnabled() }),
  head: () => ({ meta: [{ title: "Report an absence · KidEase" }, { name: "robots", content: "noindex" }] }),
  component: AbsencePage,
});

function AbsencePage() {
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [daycareId, setDaycareId] = useState("");
  const [childName, setChildName] = useState("");
  const [day, setDay] = useState("");
  const [band, setBand] = useState("preschool");
  const [note, setNote] = useState("");
  return (
    <WiringDesk
      kicker="KidEase"
      title={fr ? "Absence" : "Absence"}
      lead={fr ? "Dites à la garderie que votre enfant sera absent. Le ratio de la salle se met à jour tout de suite." : "Tell the daycare your child will be away. The room ratio updates right away."}
      next={fr ? "Envoyez l’avis. La garderie le reçoit." : "Send the notice. The daycare gets it."}
      enabled={enabled}
    >
      <label className="block text-sm font-medium" htmlFor="abs-centre">{fr ? "Centre" : "Centre"}</label>
      <input id="abs-centre" value={daycareId} onChange={(event) => setDaycareId(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <label className="mt-3 block text-sm font-medium" htmlFor="abs-child">{fr ? "Prénom" : "First name"}</label>
      <input id="abs-child" value={childName} onChange={(event) => setChildName(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <label className="mt-3 block text-sm font-medium" htmlFor="abs-day">{fr ? "Jour" : "Day"}</label>
      <input id="abs-day" type="date" value={day} onChange={(event) => setDay(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <label className="mt-3 block text-sm font-medium" htmlFor="abs-band">{fr ? "Groupe" : "Room"}</label>
      <select id="abs-band" value={band} onChange={(event) => setBand(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3">
        <option value="infant">{fr ? "Poupon" : "Infant"}</option>
        <option value="toddler">{fr ? "Tout-petit" : "Toddler"}</option>
        <option value="preschool">{fr ? "Préscolaire" : "Preschool"}</option>
        <option value="school-age">{fr ? "Scolaire" : "School-age"}</option>
      </select>
      <Button
        className="mt-4"
        type="button"
        onClick={() => {
          void reportAbsence({ data: { daycareId, childName, day, band } })
            .then((row) => setNote(row.ok ? `${fr ? "Ratio" : "Ratio"}: ${row.ratio || (fr ? "pas de personnel ce jour" : "no staff on file")}` : row.error))
            .catch(() => setNote(fr ? "Ouvrez une session pour continuer." : "Sign in to continue."));
        }}
      >
        {fr ? "Envoyer l’absence" : "Send absence"}
      </Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
    </WiringDesk>
  );
}
