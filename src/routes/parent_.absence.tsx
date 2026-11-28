import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { WiringDesk } from "@/components/wiring-desk";
import { localePath } from "@/lib/locale-path";
import { privateReturnPath } from "@/lib/role-access";
import { listMyChildAttendance } from "@/lib/server/child-checkin";
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

type Child = { bookingId: string; childName: string; daycareName: string };

function AbsencePage() {
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [children, setChildren] = useState<Child[] | null>(null);
  const [bookingId, setBookingId] = useState("");
  const [day, setDay] = useState("");
  const [band, setBand] = useState("preschool");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void listMyChildAttendance()
      .then((rows) => {
        if (!live) return;
        const list = rows.children.map((child) => ({
          bookingId: child.bookingId,
          childName: child.childName,
          daycareName: child.daycareName,
        }));
        setChildren(list);
        setBookingId((current) => current || list[0]?.bookingId || "");
      })
      .catch(() => {
        if (live) setChildren([]);
      });
    return () => {
      live = false;
    };
  }, [enabled]);
  const errorText = (code: string) => {
    if (code === "form") return fr ? "Choisissez un enfant, un jour et un groupe." : "Pick a child, a day and a room.";
    if (code === "enrol") return fr ? "Cet enfant n’est pas inscrit à ce compte." : "That child is not enrolled on this account.";
    if (code === "record") return fr ? "Demandez au centre de vérifier le dossier de cet enfant." : "Ask the centre to check this child's record.";
    return code;
  };
  return (
    <WiringDesk
      kicker="KidEase"
      title={fr ? "Absence" : "Absence"}
      lead={fr ? "Dites à la garderie que votre enfant sera absent. Le ratio de la salle se met à jour tout de suite." : "Tell the daycare your child will be away. The room ratio updates right away."}
      next={fr ? "Envoyez l’avis. La garderie le reçoit." : "Send the notice. The daycare gets it."}
      enabled={enabled}
    >
      {children && children.length === 0 ? (
        <EmptyState
          title={fr ? "Aucun enfant inscrit" : "No enrolled child yet"}
          body={fr ? "Vous pourrez signaler une absence quand votre enfant sera inscrit." : "You can report an absence once your child is enrolled."}
          action={fr ? "Chercher" : "Search daycare"}
          actionTo={localePath("/search", locale)}
          secondary={fr ? "Aide" : "Help"}
          secondaryTo={localePath("/help", locale)}
        />
      ) : (
        <>
          <label className="block text-sm font-medium" htmlFor="abs-child">{fr ? "Enfant" : "Child"}</label>
          <select
            id="abs-child"
            value={bookingId}
            disabled={!children}
            onChange={(event) => setBookingId(event.target.value)}
            className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3"
          >
            {(children ?? []).map((child) => (
              <option key={child.bookingId} value={child.bookingId}>
                {`${child.childName} · ${child.daycareName}`}
              </option>
            ))}
          </select>
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
            disabled={!bookingId}
            onClick={() => {
              void reportAbsence({ data: { bookingId, day, band } })
                .then((row) => setNote(row.ok ? `${fr ? "Ratio" : "Ratio"}: ${row.ratio || (fr ? "pas de personnel ce jour" : "no staff on file")}` : errorText(row.error)))
                .catch(() => setNote(fr ? "Ouvrez une session pour continuer." : "Sign in to continue."));
            }}
          >
            {fr ? "Envoyer l’absence" : "Send absence"}
          </Button>
          {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
        </>
      )}
    </WiringDesk>
  );
}
