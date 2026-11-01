import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { GovHelp } from "@/components/gov/gov-help";
import { GovNativeNote } from "@/components/gov/gov-login";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { guardGovDesk, govRobotsHead } from "@/lib/gov/desk-guard";
import { postComplaintUpdate } from "@/lib/server/wiring/complaint-updates";
import { complaintUpdatesEnabled } from "@/lib/wiring/complaint-updates";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/gov_/complaint-updates")({
  beforeLoad: ({ context }) => guardGovDesk("en", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  loader: () => ({ enabled: complaintUpdatesEnabled() }),
  head: () => govRobotsHead("Complaint update · KidEase"),
  component: Page,
});

function Page() {
  const gate = Route.useRouteContext() as { nativeOnly?: boolean };
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [reportId, setReportId] = useState("");
  const [note, setNote] = useState("");
  const [text, setText] = useState("");
  if (gate.nativeOnly) {
    return <main className="mx-auto w-full max-w-lg px-4 py-10"><GovNativeNote locale={fr ? "fr" : "en"} /><GovHelp locale={fr ? "fr" : "en"} /></main>;
  }
  return (
    <WiringDesk gov kicker="KidEase" title={fr ? "Réponse à une plainte" : "Complaint reply"} lead={fr ? "Votre note va au parent qui a déposé la plainte, dans votre province seulement." : "Your note goes to the parent who filed, in your province only."} next={fr ? "Écrivez la mise à jour, puis envoyez." : "Write the update, then send."} enabled={enabled}>
      <label className="block text-sm font-medium" htmlFor="rep">{fr ? "Numéro de la plainte" : "Complaint number"}</label>
      <input id="rep" value={reportId} onChange={(event) => setReportId(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <label className="mt-3 block text-sm font-medium" htmlFor="cnote">{fr ? "Message" : "Message"}</label>
      <textarea id="cnote" value={text} onChange={(event) => setText(event.target.value)} className="mt-1 w-full min-h-24 rounded-xl border border-border bg-surface px-3" />
      <Button className="mt-4" type="button" onClick={() => {
        void postComplaintUpdate({ data: { reportId, note: text } })
          .then((row) => setNote(row.ok ? row.source : row.error))
          .catch(() => setNote(fr ? "Bureau gouvernemental seulement." : "Government desk only."));
      }}>{fr ? "Envoyer au parent" : "Send to the parent"}</Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
    </WiringDesk>
  );
}
