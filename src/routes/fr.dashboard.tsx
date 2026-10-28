import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage, dashboardHead } from "@/routes/dashboard";

export const Route = createFileRoute("/fr/dashboard")({
  head: () => dashboardHead("fr"),
  component: DashboardPage,
});
