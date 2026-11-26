import { createFileRoute } from "@tanstack/react-router";
import { WiringDesk } from "@/components/wiring-desk";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { ParentWithdrawalForm } from "@/components/withdrawal-notices";
import { pipelineCopy } from "@/lib/pipeline-copy";
import { withdrawalEnabled } from "@/lib/wiring/withdrawal";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/parent_/withdrawal")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: withdrawalEnabled() }),
  head: () => ({ meta: [{ title: "Withdrawal · KidEase" }, { name: "robots", content: "noindex" }] }),
  component: WithdrawalPage,
});

function WithdrawalPage() {
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const pc = pipelineCopy(locale);
  const fr = locale === "fr";
  return (
    <WiringDesk
      kicker="KidEase"
      title={pc.withdrawalTitle}
      lead={fr ? "Le préavis du centre s’applique. La dernière facture utilise le tarif déjà affiché. La place libérée peut alerter la liste d’attente du secteur." : "The centre’s notice period applies. The last bill uses the fee already on file. A freed space can alert the area waitlist."}
      next={pc.withdrawalLead}
      enabled={enabled}
    >
      <ParentWithdrawalForm />
    </WiringDesk>
  );
}
