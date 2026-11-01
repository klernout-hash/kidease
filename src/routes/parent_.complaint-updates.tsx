import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { myComplaintUpdates } from "@/lib/server/wiring/complaint-updates";
import { complaintUpdatesEnabled } from "@/lib/wiring/complaint-updates";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/parent_/complaint-updates")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: complaintUpdatesEnabled() }),
  head: () => ({ meta: [{ title: "Complaint updates · KidEase" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [note, setNote] = useState("");
  return (
    <WiringDesk
      kicker="KidEase"
      title={fr ? "Mises à jour de plainte" : "Complaint updates"}
      lead={fr ? "Quand la province écrit sur votre plainte, le message arrive ici." : "When the province writes about your complaint, the message lands here."}
      next={fr ? "Voir les messages." : "See messages."}
      enabled={enabled}
    >
      <Button type="button" onClick={() => {
        void myComplaintUpdates()
          .then((row) => setNote(row.enabled ? String(row.rows.length) : "off"))
          .catch(() => setNote(fr ? "Ouvrez une session pour continuer." : "Sign in to continue."));
      }}>{fr ? "Voir les mises à jour" : "See updates"}</Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
    </WiringDesk>
  );
}
