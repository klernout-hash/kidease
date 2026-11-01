import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { GovHelp } from "@/components/gov/gov-help";
import { GovNativeNote } from "@/components/gov/gov-login";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { guardGovDesk, govRobotsHead } from "@/lib/gov/desk-guard";
import { govDsrQueue } from "@/lib/server/wiring/dsr-propagation";
import { dsrPropagationEnabled } from "@/lib/wiring/dsr-propagation";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/gov_/data-requests")({
  beforeLoad: ({ context }) => guardGovDesk("en", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  loader: () => ({ enabled: dsrPropagationEnabled() }),
  head: () => govRobotsHead("Data requests · KidEase"),
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
    <WiringDesk gov kicker="KidEase" title={fr ? "Demandes de données" : "Data requests"} lead={fr ? "Vous voyez les demandes de votre province. Une retenue légale bloque la suppression." : "You see requests for your province. A legal hold blocks deletion."} next={fr ? "Voir la file." : "See the queue."} enabled={enabled}>
      <Button type="button" onClick={() => {
        void govDsrQueue().then((row) => setNote(row.enabled ? String(row.rows.length) : "off")).catch(() => setNote(fr ? "Bureau gouvernemental seulement." : "Government desk only."));
      }}>{fr ? "Voir la file" : "See the queue"}</Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
    </WiringDesk>
  );
}
