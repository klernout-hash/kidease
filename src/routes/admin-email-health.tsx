import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { DeskSkeleton } from "@/components/page-skeleton";

const EmailHealthPage = lazy(() =>
  import("@/components/admin-email-health-page").then((m) => ({ default: m.EmailHealthPage })),
);

export const Route = createFileRoute("/admin-email-health")({
  beforeLoad: beforeLoadAdminDesk,
  head: () => ({
    meta: [
      { title: "Email health · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EmailHealthRoute,
});

function EmailHealthRoute() {
  return (
    <Suspense fallback={<DeskSkeleton />}>
      <EmailHealthPage />
    </Suspense>
  );
}
