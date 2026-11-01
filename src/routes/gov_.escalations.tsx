import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { GovHelp } from "@/components/gov/gov-help";
import { GovNativeNote } from "@/components/gov/gov-login";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { guardGovDesk, govRobotsHead } from "@/lib/gov/desk-guard";
import { govEscalations } from "@/lib/server/wiring/escalations";
import { escalationsEnabled } from "@/lib/wiring/escalations";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/gov_/escalations")({
  beforeLoad: ({ context }) => guardGovDesk("en", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  loader: () => ({ enabled: escalationsEnabled() }),
  head: () => govRobotsHead("Escalations · KidEase"),
  component: Page,
});

function Page() {
  const gate = Route.useRouteContext() as { nativeOnly?: boolean };
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [note, setNote] = useState("");
  if (gate.nativeOnly) {
    return <main className="mx-auto w-full max-w-lg px-4 py-10"><GovNativeNote locale={fr ? "fr" : "en"} /><GovHelp locale={fr ? "fr" : "en"} /></main>;
  }
  return (
    <WiringDesk gov kicker="KidEase" title={fr ? "Dossiers en retard" : "Overdue items"} lead={fr ? "Vous voyez les dossiers de votre province où vous êtes impliqué." : "You see items in your province where you are involved."} next={fr ? "Voir le statut." : "See the status."} enabled={enabled}>
      <Button type="button" onClick={() => {
        void govEscalations().then((row) => setNote(row.enabled ? String(row.rows.length) : "off")).catch(() => setNote(fr ? "Bureau gouvernemental seulement." : "Government desk only."));
      }}>{fr ? "Voir le statut" : "See status"}</Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
    </WiringDesk>
  );
}
