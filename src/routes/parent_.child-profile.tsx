import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { saveChildProfile } from "@/lib/server/wiring/child-profile";
import { childProfileEnabled } from "@/lib/wiring/child-profile";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/parent_/child-profile")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: childProfileEnabled() }),
  head: () => ({ meta: [{ title: "Child profile · KidEase" }, { name: "robots", content: "noindex" }] }),
  component: ChildProfilePage,
});

export function ChildProfilePage() {
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [childId, setChildId] = useState("");
  const [allergies, setAllergies] = useState("");
  const [medical, setMedical] = useState("");
  const [pickup, setPickup] = useState("");
  const [note, setNote] = useState("");
  return (
    <WiringDesk
      kicker="KidEase"
      title={fr ? "Profil de l’enfant" : "Child profile"}
      lead={
        fr
          ? "Vous mettez à jour les allergies, la santé, les personnes autorisées et les urgences. La garderie les voit après l’inscription."
          : "You update allergies, health, authorized pickups, and emergency contacts. The daycare sees them after enrolment."
      }
      next={fr ? "Enregistrez, puis la garderie reçoit un avis." : "Save, and the daycare gets a notice."}
      enabled={enabled}
    >
      <label className="block text-sm font-medium" htmlFor="child-id">{fr ? "Numéro de l’enfant" : "Child number"}</label>
      <input id="child-id" value={childId} onChange={(event) => setChildId(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <label className="mt-3 block text-sm font-medium" htmlFor="allergies">{fr ? "Allergies" : "Allergies"}</label>
      <textarea id="allergies" value={allergies} onChange={(event) => setAllergies(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <label className="mt-3 block text-sm font-medium" htmlFor="medical">{fr ? "Notes médicales" : "Medical notes"}</label>
      <textarea id="medical" value={medical} onChange={(event) => setMedical(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <label className="mt-3 block text-sm font-medium" htmlFor="pickup">{fr ? "Personne autorisée" : "Authorized pickup"}</label>
      <input id="pickup" value={pickup} onChange={(event) => setPickup(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <Button
        className="mt-4"
        type="button"
        onClick={() => {
          void saveChildProfile({
            data: {
              childId,
              allergies,
              medical,
              pickups: pickup ? [{ name: pickup, phone: "", relationship: "" }] : [],
              emergency: [],
              shared: true,
            },
          })
            .then((row) => setNote(row.ok ? (fr ? "Enregistré." : "Saved.") : row.error))
            .catch(() => setNote(fr ? "Ouvrez une session pour continuer." : "Sign in to continue."));
        }}
      >
        {fr ? "Enregistrer" : "Save"}
      </Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
    </WiringDesk>
  );
}
