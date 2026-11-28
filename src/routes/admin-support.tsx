import { lazy, Suspense } from "react";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { DeskSkeleton } from "@/components/page-skeleton";
import { adminGateFailureKind } from "@/lib/admin-desk-gate";
import { assertSupportDesk } from "@/lib/server/roles";
import { SQL_SETTLE_MS, withTimeout } from "@/lib/timeout";

const AdminSupportInbox = lazy(() =>
  import("@/components/admin-support-inbox").then((m) => ({ default: m.AdminSupportInbox })),
);

export const Route = createFileRoute("/admin-support")({
  beforeLoad: async () => {
    try {
      await withTimeout(assertSupportDesk(), SQL_SETTLE_MS, "support-inbox-timeout");
    } catch (err) {
      if (adminGateFailureKind(err) === "two_factor") {
        throw redirect({ to: "/verify-2fa", search: { next: "/admin-support" } });
      }
      const raw = err instanceof Error ? err.message : String(err ?? "");
      // N-27: signed out is a plain 404 too. Support staff sign in on /login first.
      if (raw === "support-inbox-timeout") return;
      throw notFound();
    }
  },
  validateSearch: (search: Record<string, unknown>) => ({
    thread: typeof search.thread === "string" && search.thread.trim() ? search.thread.trim().slice(0, 80) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Support inbox · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminSupportRoute,
});

function AdminSupportRoute() {
  const { thread } = Route.useSearch();
  return (
    <Suspense fallback={<DeskSkeleton />}>
      <AdminSupportInbox initialThread={thread || ""} />
    </Suspense>
  );
}
