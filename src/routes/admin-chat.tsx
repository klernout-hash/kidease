import { lazy, Suspense } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { DeskSkeleton } from "@/components/page-skeleton";

const AdminChatPage = lazy(() =>
  import("@/components/admin-chat-page").then((m) => ({ default: m.AdminChatPage })),
);

export const Route = createFileRoute("/admin-chat")({
  // Admin guard first. In production the chat lab is off, so admins see where support chat moved
  // instead of a silent bounce to /admin (admin desk test #33).
  beforeLoad: async () => {
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
  if (import.meta.env.PROD) return <AdminChatMoved />;
  return (
    <Suspense fallback={<DeskSkeleton />}>
      <AdminChatPage />
    </Suspense>
  );
}

function AdminChatMoved() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16" data-ke="admin-chat-moved">
      <h1 className="font-display text-2xl">Support chat moved</h1>
      <p className="mt-3 text-sm text-muted">Support chat with families and centres is now on the support inbox.</p>
      <p className="mt-6 flex flex-wrap gap-3">
        <Link to="/admin-support" search={{ thread: undefined }} className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 font-semibold text-primary-foreground">
          Open /admin-support
        </Link>
        <Link to="/admin" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
          Back to admin
        </Link>
      </p>
    </main>
  );
}
