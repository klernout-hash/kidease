import { createFileRoute } from "@tanstack/react-router";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { subsidyStatusEnabled } from "@/lib/wiring/subsidy-status";
import { ToolError, ToolPending } from "@/components/tool-states";
import { ProviderSubsidy } from "@/components/provider-subsidy";

export const Route = createFileRoute("/fr/provider_/subsidy")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: subsidyStatusEnabled() }),
  head: () => ({ meta: [{ title: "Mettre à jour une subvention · KidEase" }, { name: "robots", content: "noindex" }] }),
  pendingComponent: ToolPending,
  errorComponent: ToolError,
  component: Page,
});

function Page() {
  const { enabled } = Route.useLoaderData();
  return <ProviderSubsidy enabled={enabled} />;
}
