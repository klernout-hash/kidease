import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { DeskSkeleton } from "@/components/page-skeleton";

const AdminContractsPage = lazy(() =>
  import("@/components/admin-contracts-page").then((m) => ({ default: m.AdminContractsPage })),
);

export const Route = createFileRoute("/admin-contracts")({
  beforeLoad: beforeLoadAdminDesk,
  head: () => ({
    meta: [
      { title: "Admin contracts · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminContractsRoute,
});

function AdminContractsRoute() {
  return (
    <Suspense fallback={<DeskSkeleton />}>
      <AdminContractsPage />
    </Suspense>
  );
}
