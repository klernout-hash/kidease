import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage, dashboardHead, redirectParentDashboard } from "@/routes/dashboard";

export const Route = createFileRoute("/fr/dashboard")({
  beforeLoad: ({ context }) => {
    redirectParentDashboard((context as { roleChrome?: { role?: string | null } }).roleChrome?.role, "fr");
  },
  head: () => dashboardHead("fr"),
  component: DashboardPage,
});
