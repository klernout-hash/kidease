import { createFileRoute } from "@tanstack/react-router";
import { beforeLoadAdminDesk, loadAdminQueueForRoute } from "@/lib/server/admin-route";
import { AdminRoute, adminValidateSearch } from "@/routes/admin";

export const Route = createFileRoute("/fr/admin")({
  beforeLoad: beforeLoadAdminDesk,
  loader: ({ context }) => loadAdminQueueForRoute(context),
  validateSearch: adminValidateSearch,
  head: () => ({
    meta: [{ title: "Admin · KidEase" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminRoute,
});
