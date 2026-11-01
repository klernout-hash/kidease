import { createFileRoute, Link } from "@tanstack/react-router";
import { WiringDesk } from "@/components/wiring-desk";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { absenceReportsEnabled } from "@/lib/wiring/absence-reports";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/provider_/absence")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: absenceReportsEnabled() }),
  head: () => ({ meta: [{ title: "Absences · KidEase" }, { name: "robots", content: "noindex" }] }),
  component: CentreAbsencePage,
});

function CentreAbsencePage() {
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  return (
    <WiringDesk
      kicker="KidEase"
      title={fr ? "Absences" : "Absences"}
      lead={fr ? "Quand un parent signale une absence, la présence et le ratio changent tout de suite." : "When a parent reports an absence, attendance and the room ratio change right away."}
      next={fr ? "Ouvrez l’horaire du personnel si le ratio manque." : "Open staff shifts if the ratio is missing."}
      enabled={enabled}
    >
      <Link to="/provider" className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 font-medium text-primary-fg">
        {fr ? "Retour au centre" : "Back to the centre"}
      </Link>
    </WiringDesk>
  );
}
