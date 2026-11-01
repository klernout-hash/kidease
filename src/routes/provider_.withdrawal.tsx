import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WiringDesk } from "@/components/wiring-desk";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { saveNoticePeriod } from "@/lib/server/wiring/withdrawal";
import { withdrawalEnabled } from "@/lib/wiring/withdrawal";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/provider_/withdrawal")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: withdrawalEnabled() }),
  head: () => ({ meta: [{ title: "Notice period · KidEase" }, { name: "robots", content: "noindex" }] }),
  component: NoticePage,
});

function NoticePage() {
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [daycareId, setDaycareId] = useState("");
  const [days, setDays] = useState("14");
  const [note, setNote] = useState("");
  return (
    <WiringDesk
      kicker="KidEase"
      title={fr ? "Préavis" : "Notice period"}
      lead={fr ? "Indiquez le nombre de jours de préavis de votre centre. KidEase n’invente pas un délai." : "Set how many days of notice your centre requires. KidEase does not invent a period."}
      next={fr ? "Enregistrez le nombre, puis les parents peuvent donner leur avis." : "Save the number, then parents can give notice."}
      enabled={enabled}
    >
      <label className="block text-sm font-medium" htmlFor="notice-centre">{fr ? "Centre" : "Centre"}</label>
      <input id="notice-centre" value={daycareId} onChange={(event) => setDaycareId(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <label className="mt-3 block text-sm font-medium" htmlFor="notice-days">{fr ? "Jours" : "Days"}</label>
      <input id="notice-days" inputMode="numeric" value={days} onChange={(event) => setDays(event.target.value)} className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" />
      <Button
        className="mt-4"
        type="button"
        onClick={() => {
          void saveNoticePeriod({ data: { daycareId, noticeDays: Number(days) } })
            .then((row) => setNote(row.ok ? (fr ? "Enregistré." : "Saved.") : row.error))
            .catch(() => setNote(fr ? "Ouvrez une session pour continuer." : "Sign in to continue."));
        }}
      >
        {fr ? "Enregistrer le préavis" : "Save notice period"}
      </Button>
      {note ? <p className="mt-3 text-sm" role="status">{note}</p> : null}
    </WiringDesk>
  );
}
