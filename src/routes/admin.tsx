import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { DeskSkeleton } from "@/components/page-skeleton";
import {
  isAdminDeskTab,
  parseAdminActivityKind,
  type AccountNotifyRole,
  type AdminDeskTab,
} from "@/lib/account-notify";
import { parseAdminStatFilter, type AdminStatFilter } from "@/lib/admin-stat-filter";

const AdminPage = lazy(() =>
  import("@/components/admin-desk-page").then((m) => ({ default: m.AdminPage })),
);

export const Route = createFileRoute("/admin")({
  beforeLoad: beforeLoadAdminDesk,
  validateSearch: (s: Record<string, unknown>) => {
    const rawTab = typeof s.tab === "string" ? s.tab : null;
    const tab = isAdminDeskTab(rawTab) ? rawTab : undefined;
    const kindRaw = typeof s.kind === "string" ? s.kind : undefined;
    const kind = kindRaw ? parseAdminActivityKind(kindRaw) : undefined;
    const role = s.role === "parent" || s.role === "provider" ? (s.role as AccountNotifyRole) : undefined;
    const q = typeof s.q === "string" && s.q.trim() ? s.q : undefined;
    const stat = parseAdminStatFilter(typeof s.stat === "string" ? s.stat : undefined);
    const out: { tab?: AdminDeskTab; kind?: string; role?: AccountNotifyRole; q?: string; stat?: AdminStatFilter } = {};
    if (tab) out.tab = tab;
    else if (role) out.tab = "people";
    else if (kind && kind !== "all") out.tab = "activity";
    if (kind && kind !== "all") out.kind = kind;
    if (role) out.role = role;
    if (q) out.q = q;
    if (stat) out.stat = stat;
    return out;
  },
  head: () => ({
    meta: [
      { title: "Admin · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminRoute,
});

function AdminRoute() {
  return (
    <Suspense
      fallback={
        <div className="p-8">
          <DeskSkeleton />
        </div>
      }
    >
      <AdminPage />
    </Suspense>
  );
}
