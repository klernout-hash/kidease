import { lazy, Suspense } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { DeskSkeleton } from "@/components/page-skeleton";

const AdminChatPage = lazy(() =>
  import("@/components/admin-chat-page").then((m) => ({ default: m.AdminChatPage })),
);

export const Route = createFileRoute("/admin-chat")({
  beforeLoad: async () => {
    if (import.meta.env.PROD) throw redirect({ to: "/admin" });
    await beforeLoadAdminDesk();
  },
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
