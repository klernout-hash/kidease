import { createFileRoute } from "@tanstack/react-router";
import { WiringDesk } from "@/components/wiring-desk";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { dsrPropagationEnabled } from "@/lib/wiring/dsr-propagation";
import { useCopy } from "@/lib/use-copy";
import { ToolError, ToolPending } from "@/components/tool-states";

export const Route = createFileRoute("/provider_/data-requests")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: dsrPropagationEnabled() }),
  head: () => ({ meta: [{ title: "Data requests · KidEase" }, { name: "robots", content: "noindex" }] }),
  pendingComponent: ToolPending,
  errorComponent: ToolError,
  component: Page,
});

function Page() {
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  return (
    <WiringDesk
      kicker="KidEase"
      title={fr ? "Demandes de données" : "Data requests"}
      lead={fr ? "Seule l’équipe de confidentialité de KidEase peut examiner les demandes de données du centre pour le moment." : "For now, only the KidEase privacy team can review centre data requests."}
      next={fr ? "Ne marquez pas une demande comme traitée sans confirmation de KidEase." : "Wait for KidEase to confirm before treating a request as complete."}
      enabled={enabled}
    >
      <p className="text-sm">
        {fr ? "Aucune demande ne peut être clôturée depuis cet espace." : "Requests can’t be closed from this desk."}
      </p>
    </WiringDesk>
  );
}
