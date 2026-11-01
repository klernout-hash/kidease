import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { GovHelp } from "@/components/gov/gov-help";
import { GovNativeNote } from "@/components/gov/gov-login";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { guardGovDesk, govRobotsHead } from "@/lib/gov/desk-guard";
import { govNotificationDesk } from "@/lib/server/wiring/notification-centre";
import { notificationCentreEnabled } from "@/lib/wiring/notification-centre";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/gov_/notifications")({
  beforeLoad: ({ context }) => guardGovDesk("en", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  loader: () => ({ enabled: notificationCentreEnabled() }),
  head: () => govRobotsHead("Notices · KidEase"),
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
    <WiringDesk gov kicker="KidEase" title={fr ? "Avis" : "Notices"} lead={fr ? "La boîte de votre province. Les textos restent pour les personnes qui ont accepté." : "Your province inbox. Texts stay for people who opted in."} next={fr ? "Ouvrir la boîte." : "Open the inbox."} enabled={enabled}>
      <Button type="button" onClick={() => {
        void govNotificationDesk().then((row) => setNote(row.enabled ? String(row.rows.length) : "off")).catch(() => setNote(fr ? "Bureau gouvernemental seulement." : "Government desk only."));
      }}>{fr ? "Ouvrir la boîte" : "Open inbox"}</Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
    </WiringDesk>
  );
}
