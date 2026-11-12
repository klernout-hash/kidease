import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { DeskSkeleton } from "@/components/page-skeleton";

const GhlLeadDeskPage = lazy(() =>
  import("@/components/admin-ghl-leads-page").then((m) => ({ default: m.GhlLeadDeskPage })),
);

export const Route = createFileRoute("/admin-ghl-leads")({
  beforeLoad: beforeLoadAdminDesk,
  head: () => ({
    meta: [
      { title: "Signup check · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: GhlLeadRoute,
});

function GhlLeadRoute() {
  return (
    <Suspense fallback={<DeskSkeleton />}>
      <GhlLeadDeskPage />
    </Suspense>
  );
}
