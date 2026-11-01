import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { GovHelp } from "@/components/gov/gov-help";
import { GovNativeNote } from "@/components/gov/gov-login";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { guardGovDesk, govRobotsHead } from "@/lib/gov/desk-guard";
import { govUpdateSubsidy } from "@/lib/server/wiring/subsidy-status";
import { subsidyStatusEnabled } from "@/lib/wiring/subsidy-status";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/gov_/subsidy")({
  beforeLoad: ({ context }) => guardGovDesk("en", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  loader: () => ({ enabled: subsidyStatusEnabled() }),
  head: () => govRobotsHead("Subsidy status · KidEase"),
  component: Page,
});

function Page() {
  const gate = Route.useRouteContext() as { nativeOnly?: boolean };
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [id, setId] = useState("");
  const [note, setNote] = useState("");
  if (gate.nativeOnly) {
    return <main className="mx-auto w-full max-w-lg px-4 py-10"><GovNativeNote locale={fr ? "fr" : "en"} /><GovHelp locale={fr ? "fr" : "en"} /></main>;
  }
  return (
    <WiringDesk gov kicker="KidEase" title={fr ? "Statut de subvention" : "Subsidy status"} lead={fr ? "Vous mettez à jour seulement les dossiers de votre province." : "You update cases in your province only."} next={fr ? "Enregistrez le statut." : "Save the status."} enabled={enabled}>
      <label className="block text-sm font-medium" htmlFor="gsub">{fr ? "Numéro" : "Number"}</label>
      <input id="gsub" value={id} onChange={(event) => setId(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <Button className="mt-4" type="button" onClick={() => {
        void govUpdateSubsidy({ data: { id, status: "in_review" } })
          .then((row) => setNote(row.ok ? row.status : row.error))
          .catch(() => setNote(fr ? "Bureau gouvernemental seulement." : "Government desk only."));
      }}>{fr ? "Marquer en examen" : "Mark in review"}</Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
    </WiringDesk>
  );
}
