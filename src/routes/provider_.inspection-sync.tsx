import { createFileRoute, Link } from "@tanstack/react-router";
import { WiringDesk } from "@/components/wiring-desk";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { inspectionSyncEnabled } from "@/lib/wiring/inspection-sync";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/provider_/inspection-sync")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: inspectionSyncEnabled() }),
  head: () => ({ meta: [{ title: "Inspections · KidEase" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  return (
    <WiringDesk
      kicker="KidEase"
      title={fr ? "Inspections" : "Inspections"}
      lead={fr ? "Le résultat public montre la source et la date. KidEase n’invente pas un résultat." : "The public summary shows the source and the date. KidEase does not invent a result."}
      next={fr ? "Ouvrez votre fiche publique pour le voir." : "Open your public listing to see it."}
      enabled={enabled}
    >
      <Link to="/search" className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 font-medium text-primary-fg">
        {fr ? "Voir les fiches" : "See listings"}
      </Link>
    </WiringDesk>
  );
}
