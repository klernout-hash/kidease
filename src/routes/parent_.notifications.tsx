import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { notificationDesk, readNotice, saveNoticePrefs } from "@/lib/server/wiring/notification-centre";
import { notificationCentreEnabled } from "@/lib/wiring/notification-centre";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/parent_/notifications")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: notificationCentreEnabled() }),
  head: () => ({ meta: [{ title: "Notices · KidEase" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [sms, setSms] = useState(false);
  const [note, setNote] = useState("");
  return (
    <WiringDesk
      kicker="KidEase"
      title={fr ? "Avis" : "Notices"}
      lead={fr ? "Une boîte pour chaque rôle, avec un accusé de lecture. Les textos partent seulement si vous avez accepté. Les notifications poussées arrivent bientôt." : "One inbox for every role, with a read receipt. Texts go only if you opted in. Push is coming soon."}
      next={fr ? "Choisissez le texto, puis enregistrez." : "Choose text messages, then save."}
      enabled={enabled}
    >
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={sms} onChange={(event) => setSms(event.target.checked)} />
        {fr ? "Textos (si vous avez accepté)" : "Texts (only if you opted in)"}
      </label>
      <p className="mt-2 text-sm text-muted">{fr ? "L’appli téléphone n’est pas encore dans les boutiques. Les notifications poussées arrivent bientôt." : "The phone apps are not in the stores yet. Push is coming soon."}</p>
      <Button className="mt-4" type="button" onClick={() => {
        void saveNoticePrefs({ data: { prefs: { in_app: true, email: true, sms, push: false } } })
          .then(async (row) => {
            const desk = await notificationDesk();
            const first = desk.enabled ? desk.rows[0] : undefined;
            if (first) await readNotice({ data: { id: first.id } });
            setNote(row.ok ? (row.plan.channels.includes("sms") ? "sms" : fr ? "Texto non envoyé" : "Text not sent") : row.error);
          })
          .catch(() => setNote(fr ? "Ouvrez une session pour continuer." : "Sign in to continue."));
      }}>{fr ? "Enregistrer les choix" : "Save choices"}</Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
    </WiringDesk>
  );
}
