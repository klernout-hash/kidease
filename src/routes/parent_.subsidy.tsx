import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { mySubsidy, submitSubsidy } from "@/lib/server/wiring/subsidy-status";
import { subsidyStatusEnabled } from "@/lib/wiring/subsidy-status";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/parent_/subsidy")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: subsidyStatusEnabled() }),
  head: () => ({ meta: [{ title: "Subsidy status · KidEase" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [daycareId, setDaycareId] = useState("");
  const [note, setNote] = useState("");
  return (
    <WiringDesk
      kicker="KidEase"
      title={fr ? "Suivi de subvention" : "Subsidy status"}
      lead={fr ? "KidEase suit le statut : envoyé, en examen, approuvé ou refusé. La province ou la garderie le met à jour. KidEase ne décide pas la subvention." : "KidEase tracks submitted, in review, approved, or declined. The province or the daycare updates it. KidEase does not decide the subsidy."}
      next={fr ? "Marquez la demande comme envoyée." : "Mark the application as submitted."}
      enabled={enabled}
    >
      <label className="block text-sm font-medium" htmlFor="sub-centre">{fr ? "Centre" : "Centre"}</label>
      <input id="sub-centre" value={daycareId} onChange={(event) => setDaycareId(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <Button className="mt-4" type="button" onClick={() => {
        void submitSubsidy({ data: { daycareId } })
          .then(async (row) => {
            const mine = await mySubsidy();
            setNote(row.ok ? `${row.status} (${mine.enabled ? mine.rows.length : 0})` : row.error);
          })
          .catch(() => setNote(fr ? "Ouvrez une session pour continuer." : "Sign in to continue."));
      }}>{fr ? "Marquer envoyé" : "Mark submitted"}</Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
    </WiringDesk>
  );
}
