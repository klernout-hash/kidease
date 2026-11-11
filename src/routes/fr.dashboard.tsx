import { createFileRoute } from "@tanstack/react-router";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { DashboardPage, dashboardHead, redirectParentDashboard } from "@/routes/dashboard";

export const Route = createFileRoute("/fr/dashboard")({
  beforeLoad: ({ context, location }: {
    context: { roleChrome?: Parameters<typeof beforeLoadPrivate>[1] };
    location: Parameters<typeof privateReturnPath>[0];
  }) => {
    redirectParentDashboard(context.roleChrome?.role, "fr");
    return beforeLoadPrivate(privateReturnPath(location), context.roleChrome);
  },
  head: () => dashboardHead("fr"),
  component: DashboardPage,
});
