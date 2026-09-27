import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { DeskSkeleton } from "@/components/page-skeleton";

const AdminChatPage = lazy(() =>
  import("@/components/admin-chat-page").then((m) => ({ default: m.AdminChatPage })),
);

export const Route = createFileRoute("/admin-chat")({
  beforeLoad: beforeLoadAdminDesk,
  head: () => ({
    meta: [
      { title: "Chat lab · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminChatRoute,
});

function AdminChatRoute() {
  return (
    <Suspense fallback={<DeskSkeleton />}>
      <AdminChatPage />
    </Suspense>
  );
}
