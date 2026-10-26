import { createFileRoute, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { privateReturnPath } from "@/lib/role-access";
import { lazy, Suspense } from "react";
import { Shell } from "@/components/shell";
import { DeskSkeleton } from "@/components/page-skeleton";
import { SupportPreviewBanner } from "@/components/support-preview-banner";
import { useRoleChrome } from "@/components/role-chrome";
import { RedirectToSignIn, TwoFactorGate } from "@/lib/auth/gates";
import { LoginFunnelDeskLand } from "@/lib/auth/login-funnel";
import { useCurrentUserState, useLocallySignedOut } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/desk-switcher";
import { canBuyDaycareUpgrade, canBuyParentUpgrade } from "@/lib/upgrade-role";
import { parseShareToken } from "@/lib/parent-tracker";
import { parentUrlTab } from "@/lib/parent-tab";
import { canUseOperatorTools } from "@/lib/operator-tools";
import { getFamily } from "@/lib/server/family";

const ParentDesk = lazy(() =>
  import("@/components/parent-desk").then((m) => ({ default: m.ParentDesk })),
);

function isParentSignupPath(pathname: string) {
  const path = pathname.replace(/\/$/, "") || "/";
  return path === "/parent/signup";
}

export function parentBeforeLoad({
  context,
  location,
}: {
  context: { roleChrome?: Parameters<typeof beforeLoadPrivate>[1] };
  location: { pathname: string; href?: string; searchStr?: string };
}) {
  if (isParentSignupPath(location.pathname)) return;
  return beforeLoadPrivate(privateReturnPath(location), context.roleChrome);
}

export function parentHead({ matches }: { matches: Array<{ pathname: string }> }) {
  if (matches.some((item) => isParentSignupPath(item.pathname))) return { meta: [] };
  return {
    meta: [
      { title: "Parent home · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  };
}

export async function parentLoader() {
  try {
    const family = await getFamily();
    return {
      saved: Array.isArray(family?.saved) ? family.saved : [],
      shortlistShared: Boolean(family?.shortlistShared),
    };
  } catch {
    return { saved: [], shortlistShared: false };
  }
}

export function parentValidateSearch(s: Record<string, unknown>) {
  const out: {
    tab?: "explore" | "saved" | "enrolled" | "requests" | "profile" | "payments" | "subscription" | "alerts" | "children" | "care" | "waitlists";
    preview?: "support";
    plus?: "success" | "cancel";
    plan?: "plus" | "alerts";
    interval?: "month" | "year";
    session?: string;
    billing?: "return";
    share?: string;
  } = {};
  const tab = parentUrlTab(s.tab);
  if (tab) out.tab = tab;
  if (s.preview === "support") out.preview = "support";
  if (s.plus === "success" || s.plus === "cancel") out.plus = s.plus;
  if (s.plan === "plus" || s.plan === "alerts") out.plan = s.plan;
  if (s.interval === "month" || s.interval === "year") out.interval = s.interval;
  if (typeof s.session === "string" && /^cs_[A-Za-z0-9_]+$/.test(s.session)) out.session = s.session;
  if (s.billing === "return") out.billing = "return";
  const share = parseShareToken(s.share);
  if (share) out.share = share;
  return out;
}

export type ParentSearch = ReturnType<typeof parentValidateSearch>;
export type ParentLoaded = Awaited<ReturnType<typeof parentLoader>>;

export function ParentDeskPage({ search, loaded }: { search: ParentSearch; loaded: ParentLoaded }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isPending } = useCurrentUserState();
  const locallyOut = useLocallySignedOut();
  const chrome = useRoleChrome();
  const { session, ready } = useSessionDesks();
  if (
    pathname === "/parent/spot-offers" ||
    pathname.startsWith("/parent/spot-offers/") ||
    isParentSignupPath(pathname)
  ) {
    return <Outlet />;
  }
  const upgradeSurface = search.tab === "subscription" || search.plus === "success" || search.plus === "cancel" || search.billing === "return";
  const initialTab =
    search.tab === "saved"
      ? "saved"
      : search.tab === "enrolled" || search.tab === "requests"
        ? "bookings"
        : search.tab === "subscription" || search.plus === "success" || search.plus === "cancel" || search.billing === "return"
          ? "subscription"
          : search.tab === "payments"
            ? "payments"
            : search.tab === "alerts"
              ? "alerts"
              : search.tab === "explore"
                ? "explore"
                : search.tab === "children"
                  ? "children"
                  : search.tab === "care"
                    ? "care"
                    : search.tab === "waitlists"
                      ? "waitlists"
                      : "explore";

  if (locallyOut) {
    return (
      <Shell>
        <DeskSkeleton />
      </Shell>
    );
  }
  if (isPending || chrome.pending || (user && upgradeSurface && !ready)) {
    return (
      <Shell>
        <DeskSkeleton />
      </Shell>
    );
  }
  if (!user && (chrome.pending || chrome.signedIn)) {
    return (
      <Shell>
        <DeskSkeleton />
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (upgradeSurface && ready && !session) {
    return (
      <Shell>
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="font-display text-3xl">Couldn’t confirm this account</h1>
          <p className="mt-3 text-muted">Refresh and try again. Nothing was charged.</p>
        </main>
      </Shell>
    );
  }
  if (upgradeSurface && session && session.subscriptionsEnabled !== true) {
    const buyer = {
      role: session.role,
      ownsCentre: session.ownsCentre,
      linkedToCentre: session.centreLinked,
    };
    if (canBuyParentUpgrade(buyer)) return <Navigate to="/parent" search={{ tab: "explore" }} />;
    if (canBuyDaycareUpgrade(buyer)) return <Navigate to="/provider" search={{ desk: "today" }} />;
    if (session.home === "/admin") return <Navigate to="/admin" />;
    if (session.home === "/support") return <Navigate to="/support" />;
    return <Navigate to="/parent" search={{ tab: "explore" }} />;
  }
  if (
    upgradeSurface &&
    session &&
    !canBuyParentUpgrade({
      role: session.role,
      ownsCentre: session.ownsCentre,
      linkedToCentre: session.centreLinked,
    })
  ) {
    const daycare = canBuyDaycareUpgrade({
      role: session.role,
      ownsCentre: session.ownsCentre,
      linkedToCentre: session.centreLinked,
    });
    if (daycare && session.subscriptionsEnabled) return <Navigate to="/provider/subscription" />;
    if (daycare) return <Navigate to="/provider" search={{ desk: "today" }} />;
    if (session.home === "/admin") return <Navigate to="/admin" />;
    if (session.home === "/support") return <Navigate to="/support" />;
  }

  return (
    <TwoFactorGate
      next="/parent"
      pending={
        <Shell>
          <DeskSkeleton />
        </Shell>
      }
    >
      <LoginFunnelDeskLand desk="parent" />
      {search.preview === "support" && canUseOperatorTools(session?.email) ? <SupportPreviewBanner /> : null}
      <Suspense fallback={<DeskSkeleton />}>
        <ParentDesk
          initialTab={initialTab}
          plusReturn={search.plus ?? null}
          upgradeSearch={{
            plus: search.plus,
            plan: search.plan,
            interval: search.interval,
            session: search.session,
          }}
          billingReturn={search.billing === "return"}
          shareToken={search.share ?? null}
          initialSaved={loaded.saved}
          initialShared={loaded.shortlistShared}
        />
      </Suspense>
    </TwoFactorGate>
  );
}

export const Route = createFileRoute("/parent")({
  beforeLoad: parentBeforeLoad,
  head: parentHead,
  loader: parentLoader,
  validateSearch: parentValidateSearch,
  component: ParentPage,
});

function ParentPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (!tab || parentUrlTab(tab)) return;
    void navigate({ search: { ...search, tab: undefined }, replace: true });
  }, [navigate, search]);
  return <ParentDeskPage search={search} loaded={Route.useLoaderData()} />;
}
