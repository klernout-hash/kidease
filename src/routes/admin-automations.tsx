import { createFileRoute } from "@tanstack/react-router";
import { AdminAutomationsPage } from "@/components/admin-automations-page";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";

export const Route = createFileRoute("/admin-automations")({
  beforeLoad: beforeLoadAdminDesk,
  head: () => ({
    meta: [
      { title: "Automatic emails · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminAutomationsPage,
});
