import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { useNativeHidesAdmin } from "@/lib/use-native-shell";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { sweepEscalations } from "@/lib/server/wiring/escalations";
import { escalationsEnabled } from "@/lib/wiring/escalations";
import { useCopy } from "@/lib/use-copy";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/admin_/escalations")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: escalationsEnabled() }),
  head: () => ({ meta: [{ title: "Escalations · KidEase" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const { enabled } = Route.useLoaderData();
  const native = useNativeHidesAdmin();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [note, setNote] = useState("");
  if (native) {
    return (
      <WiringDesk kicker="KidEase" title={fr ? "Admin sur le site" : "Admin is on the website"} lead={fr ? "L’admin reste sur kidease.ca dans un navigateur." : "Admin stays on kidease.ca in a browser."} next={fr ? "Ouvrez le site, puis revenez ici." : "Open the website, then come back here."} enabled>
        <Link to="/app-admin-unavailable" className="inline-flex min-h-11 items-center font-semibold text-primary">{fr ? "Comment ouvrir l’admin" : "How to open admin"}</Link>
      </WiringDesk>
    );
  }
  return (
    <WiringDesk kicker="KidEase" title={fr ? "Escalades" : "Escalations"} lead={fr ? "Un dossier non réglé passe à l’admin après le délai enregistré. Tout le monde impliqué voit le statut." : "An unresolved item goes to admin after the saved time. Everyone involved can see the status."} next={fr ? "Lancez la vérification." : "Run the check."} enabled={enabled}>
      <Button type="button" onClick={() => {
        void sweepEscalations()
          .then((row) => setNote(row.ok ? `${row.due} ${row.mode}` : row.error))
          .catch(() => setNote(fr ? "Admin seulement." : "Admin only."));
      }}>{fr ? "Vérifier les délais" : "Check deadlines"}</Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
    </WiringDesk>
  );
}
