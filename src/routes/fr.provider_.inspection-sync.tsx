import { createFileRoute } from "@tanstack/react-router";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { inspectionSyncEnabled } from "@/lib/wiring/inspection-sync";
import { ToolError, ToolPending } from "@/components/tool-states";
import { ProviderInspectionSync } from "@/components/provider-inspection-sync";

export const Route = createFileRoute("/fr/provider_/inspection-sync")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: inspectionSyncEnabled() }),
  head: () => ({ meta: [{ title: "Inspections · KidEase" }, { name: "robots", content: "noindex" }] }),
  pendingComponent: ToolPending,
  errorComponent: ToolError,
  component: Page,
});

function Page() {
  const { enabled } = Route.useLoaderData();
  return <ProviderInspectionSync enabled={enabled} />;
}
