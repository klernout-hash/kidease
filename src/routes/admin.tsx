import { lazy, Suspense } from "react";
import { Link, Outlet, createFileRoute, useLoaderData, useRouterState } from "@tanstack/react-router";
import { beforeLoadAdminDesk, loadAdminQueueForRoute } from "@/lib/server/admin-route";
import { DeskSkeleton } from "@/components/page-skeleton";
import { ADMIN_LOGIN_SEARCH } from "@/lib/admin-desk-gate";
import { DefaultNotFound } from "@/components/page-not-found";
import { AdminQueueBootstrapFallback } from "@/components/admin-queue-bootstrap";
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

export function adminValidateSearch(s: Record<string, unknown>) {
    const rawTab = typeof s.tab === "string" ? s.tab : null;
    const tab = isAdminDeskTab(rawTab) ? rawTab : undefined;
    const kindRaw = typeof s.kind === "string" ? s.kind : undefined;
    const kind = kindRaw ? parseAdminActivityKind(kindRaw) : undefined;
    const role =
      s.role === "parent" || s.role === "provider" ? (s.role as AccountNotifyRole) : undefined;
    const q = typeof s.q === "string" && s.q.trim() ? s.q : undefined;
    const stat = parseAdminStatFilter(typeof s.stat === "string" ? s.stat : undefined);
    const prov = typeof s.prov === "string" && /^[A-Z]{2}$/.test(s.prov) ? s.prov : undefined;
    const docs = s.docs === "1" || s.docs === 1 ? (1 as const) : undefined;
    const out: {
      tab?: AdminDeskTab;
      kind?: string;
      role?: AccountNotifyRole;
      q?: string;
      stat?: AdminStatFilter;
      prov?: string;
      docs?: 1;
    } = {};
    if (tab) out.tab = tab;
    else if (role) out.tab = "people";
    else if (kind && kind !== "all") out.tab = "activity";
    if (kind && kind !== "all") out.kind = kind;
    if (role) out.role = role;
    if (q) out.q = q;
    if (stat) out.stat = stat;
    if (prov) out.prov = prov;
    if (docs) out.docs = docs;
    return out;
}

export const Route = createFileRoute("/admin")({
  beforeLoad: beforeLoadAdminDesk,
  staleTime: 0,
  gcTime: 0,
  shouldReload: true,
  loader: ({ context }) => loadAdminQueueForRoute(context),
  validateSearch: adminValidateSearch,
  head: () => ({
    meta: [{ title: "Admin · KidEase" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminRoute,
  pendingComponent: AdminGatePending,
  // N-27: a plain 404 for everyone but the admin account. No sign-in hint.
  notFoundComponent: DefaultNotFound,
});

function AdminGatePending() {
  return (
    <div className="min-h-dvh bg-bg px-4 py-8 text-fg" data-ke="admin-gate-pending">
      <p className="text-sm text-muted">Loading…</p>
      <div className="mt-4">
        <DeskSkeleton />
      </div>
      <Link
        to="/login"
        search={ADMIN_LOGIN_SEARCH}
        className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-primary"
      >
        Sign in
      </Link>
    </div>
  );
}

export function AdminRoute() {
  const bootstrap = useLoaderData({ strict: false }) as Awaited<ReturnType<typeof loadAdminQueueForRoute>>;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (
    pathname === "/admin/features" ||
    pathname === "/admin/outbound" ||
    pathname === "/admin/government"
  )
    return <Outlet />;
  return (
    <Suspense
      fallback={
        bootstrap ? (
          <AdminQueueBootstrapFallback initial={bootstrap} />
        ) : (
          <div className="p-8">
            <DeskSkeleton />
          </div>
        )
      }
    >
      <AdminPage initialBootstrap={bootstrap} />
    </Suspense>
  );
}
