import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { checkPickup } from "@/lib/server/wiring/child-profile";
import { childProfileEnabled } from "@/lib/wiring/child-profile";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/provider_/child-profile")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: childProfileEnabled() }),
  head: () => ({ meta: [{ title: "Pickup check · KidEase" }, { name: "robots", content: "noindex" }] }),
  component: PickupPage,
});

function PickupPage() {
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [daycareId, setDaycareId] = useState("");
  const [childId, setChildId] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  return (
    <WiringDesk
      kicker="KidEase"
      title={fr ? "Départ" : "Pickup check"}
      lead={fr ? "Vérifiez le nom à la porte avec la liste du parent." : "Check the name at the door against the parent’s list."}
      next={fr ? "Un avis retourne au parent." : "The parent gets a notice either way."}
      enabled={enabled}
    >
      <label className="block text-sm font-medium" htmlFor="centre-id">{fr ? "Centre" : "Centre"}</label>
      <input id="centre-id" value={daycareId} onChange={(event) => setDaycareId(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <label className="mt-3 block text-sm font-medium" htmlFor="child">{fr ? "Enfant" : "Child"}</label>
      <input id="child" value={childId} onChange={(event) => setChildId(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <label className="mt-3 block text-sm font-medium" htmlFor="who">{fr ? "Nom à la porte" : "Name at the door"}</label>
      <input id="who" value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <Button
        className="mt-4"
        type="button"
        onClick={() => {
          void checkPickup({ data: { daycareId, childId, name } })
            .then((row) => setNote(row.ok ? (fr ? "Autorisé." : "Authorized.") : row.error || row.reason || ""))
            .catch(() => setNote(fr ? "Ouvrez une session pour continuer." : "Sign in to continue."));
        }}
      >
        {fr ? "Vérifier" : "Check"}
      </Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
    </WiringDesk>
  );
}
