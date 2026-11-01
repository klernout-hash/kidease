import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { GovHelp } from "@/components/gov/gov-help";
import { GovNativeNote } from "@/components/gov/gov-login";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { guardGovDesk, govRobotsHead } from "@/lib/gov/desk-guard";
import { publishInspection } from "@/lib/server/wiring/inspection-sync";
import { inspectionSyncEnabled } from "@/lib/wiring/inspection-sync";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/gov_/inspection-sync")({
  beforeLoad: ({ context }) => guardGovDesk("en", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  loader: () => ({ enabled: inspectionSyncEnabled() }),
  head: () => govRobotsHead("Inspection sync · KidEase"),
  component: Page,
});

function Page() {
  const gate = Route.useRouteContext() as { nativeOnly?: boolean };
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [sourceUrl, setSourceUrl] = useState("");
  const [note, setNote] = useState("");
  if (gate.nativeOnly) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 py-10">
        <GovNativeNote locale={fr ? "fr" : "en"} />
        <GovHelp locale={fr ? "fr" : "en"} />
      </main>
    );
  }
  return (
    <WiringDesk
      gov
      kicker="KidEase"
      title={fr ? "Ajouter une inspection" : "Add an inspection"}
      lead={fr ? "Collez l’adresse de la page publique de votre province. Sans cette source, rien n’est publié." : "Paste your province’s public page. Without that source, nothing is published."}
      next={fr ? "La fiche et le tableau du centre montrent la date et la source." : "The listing and the centre desk show the date and the source."}
      enabled={enabled}
    >
      <label className="block text-sm font-medium" htmlFor="src">{fr ? "Page source" : "Source page"}</label>
      <input id="src" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <Button className="mt-4" type="button" onClick={() => {
        void publishInspection({
          data: {
            record: {
              province: "ON",
              licenceNumber: "",
              inspectedOn: "",
              outcome: "",
              summary: "",
              sourceUrl,
            },
          },
        })
          .then((row) => setNote(row.ok ? (fr ? "Publié." : "Published.") : row.error))
          .catch(() => setNote(fr ? "Bureau gouvernemental seulement." : "Government desk only."));
      }}>{fr ? "Publier" : "Publish"}</Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
    </WiringDesk>
  );
}
