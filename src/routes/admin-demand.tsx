import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { DeskSkeleton } from "@/components/page-skeleton";

const DemandPage = lazy(() =>
  import("@/components/admin-demand-page").then((m) => ({ default: m.DemandPage })),
);

export const Route = createFileRoute("/admin-demand")({
  beforeLoad: beforeLoadAdminDesk,
  head: () => ({
    meta: [
      { title: "Demand and supply · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DemandRoute,
});

function DemandRoute() {
  return (
    <Suspense fallback={<DeskSkeleton />}>
      <DemandPage />
    </Suspense>
  );
}
