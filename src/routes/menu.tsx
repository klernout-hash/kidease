import { createFileRoute, useLoaderData, useSearch } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ShellLite } from "@/components/shell-lite";
import { AppMenuScreen } from "@/components/app-menu-screen";
import { EarningsDetailsScreen } from "@/components/earnings-details";
import { EarningsListScreen } from "@/components/earnings-list";
import { EarningsPayoutsScreen } from "@/components/earnings-payouts";
import { EarningsStatementScreen, EarningsStatementsScreen } from "@/components/earnings-statement";
import { HostEarningsScreen } from "@/components/host-earnings-screen";
import { ParentPaymentsScreen } from "@/components/parent-payments";
import { HostInsightsScreen } from "@/components/host-insights-screen";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type { MenuGroupId } from "@/lib/app-menu";
import type { EarnBill, EarningsResult } from "@/lib/earnings-desk";
import type { HostEarnings, HostInsights } from "@/lib/host-desk";
import { loadEarningsDesk, loadParentPayments } from "@/lib/server/earnings-desk";
import { loadHostEarnings, loadHostInsights } from "@/lib/server/host-desk";
import { connectPaymentsPublic, listCentreIdsForPayouts } from "@/lib/server/connect-payments";
import type { ConnectPublicState } from "@/lib/connect-payments";

const MenuDeskTools = lazy(() =>
  import("@/components/menu-desk-tools").then((m) => ({ default: m.MenuDeskTools })),
);

const SECTIONS = ["resources", "guides", "help", "legal"] as const;

type MenuScreen = "earnings" | "insights" | "payments";
type EarningsView = "payouts" | "details" | "upcoming" | "paid" | "statement";

const VIEWS: EarningsView[] = ["payouts", "details", "upcoming", "paid", "statement"];

type PaymentsResult = { ok: true; bills: EarnBill[]; maskedEmail: string | null } | { ok: false };

type MenuLoader = {
  earnings: HostEarnings | null;
  insights: HostInsights | null;
  desk: EarningsResult | null;
  payments: PaymentsResult | null;
  connect: ConnectPublicState | null;
  centres: { id: string; name: string }[];
};

export function menuValidateSearch(
  s: Record<string, unknown>,
): { section?: MenuGroupId; screen?: MenuScreen; view?: EarningsView; period?: string; bill?: string } {
    const section = SECTIONS.includes(s.section as MenuGroupId) ? (s.section as MenuGroupId) : undefined;
    const screen = s.screen === "earnings" || s.screen === "insights" || s.screen === "payments" ? s.screen : undefined;
    const view = VIEWS.includes(s.view as EarningsView) ? (s.view as EarningsView) : undefined;
    const period = typeof s.period === "string" && /^\d{4}-\d{2}$/.test(s.period) ? s.period : undefined;
    const bill = typeof s.bill === "string" && s.bill.trim() && s.bill.length <= 80 ? s.bill.trim() : undefined;
  return { section, screen, view, period, bill };
}

export async function menuLoader({
  deps,
  context,
}: {
  deps: { screen?: MenuScreen };
  context: { roleChrome?: { role?: string | null; ownedSlugs?: string[] } };
}): Promise<MenuLoader> {
    if (deps.screen === "earnings") {
      try {
        const connect = await connectPaymentsPublic();
        const centres = connect.ready ? await listCentreIdsForPayouts().catch(() => null) : null;
        return {
          earnings: null,
          insights: null,
          desk: await loadEarningsDesk(),
          payments: null,
          connect,
          centres: centres && centres.enabled ? centres.centres : [],
        };
      } catch {
        return { earnings: null, insights: null, desk: { ok: false }, payments: null, connect: null, centres: [] };
      }
    }
    if (deps.screen === "payments") {
      try {
        return { earnings: null, insights: null, desk: null, payments: await loadParentPayments(), connect: null, centres: [] };
      } catch {
        return { earnings: null, insights: null, desk: null, payments: { ok: false }, connect: null, centres: [] };
      }
    }
    if (deps.screen === "insights") {
      try {
        return { earnings: null, insights: await loadHostInsights(), desk: null, payments: null, connect: null, centres: [] };
      } catch {
        return {
          earnings: null,
          insights: {
            ok: false,
            listingRatingX10: null,
            listingReviewCount: null,
            parentRatingX10: null,
            parentReviewCount: null,
            reviews: [],
            viewCount: null,
            requestCount: null,
            tourCount: null,
          },
          desk: null,
          payments: null,
          connect: null, centres: [],
        };
      }
    }
    const chrome = context.roleChrome;
    const host = chrome?.role === "provider" || (chrome?.ownedSlugs?.length ?? 0) > 0;
    if (!host) return { earnings: null, insights: null, desk: null, payments: null, connect: null, centres: [] };
    const [earnings, insights] = await Promise.all([
      loadHostEarnings().catch(() => null),
      loadHostInsights().catch(() => null),
    ]);
    return { earnings, insights, desk: null, payments: null, connect: null, centres: [] };
}

export function menuHead() {
  return {
    meta: [
      { title: "Menu · KidEase" },
      { name: "description", content: "Account, help, and the rest of KidEase." },
    ],
  };
}

export const Route = createFileRoute("/menu")({
  validateSearch: menuValidateSearch,
  loaderDeps: ({ search }) => ({ screen: search.screen }),
  loader: menuLoader,
  head: menuHead,
  component: MenuPage,
});

export function MenuPage() {
  const { section, screen, view, bill, period } = useSearch({ strict: false }) as ReturnType<typeof menuValidateSearch>;
  const { earnings, insights, desk, payments, connect, centres } = useLoaderData({ strict: false }) as MenuLoader;
  const { user } = useCurrentUserState();
  if (screen === "earnings" && view === "payouts") {
    return (
      <ShellLite appTabs>
        <EarningsPayoutsScreen desk={desk} connect={connect} centres={centres} />
      </ShellLite>
    );
  }
  if (screen === "earnings" && view === "details") {
    return (
      <ShellLite appTabs>
        <EarningsDetailsScreen desk={desk} />
      </ShellLite>
    );
  }
  if (screen === "earnings" && view === "statement" && !period) {
    return (
      <ShellLite appTabs>
        <EarningsStatementsScreen desk={desk} />
      </ShellLite>
    );
  }
  if (screen === "earnings" && view === "statement") {
    return (
      <ShellLite appTabs>
        <EarningsStatementScreen desk={desk} period={period} />
      </ShellLite>
    );
  }
  if (screen === "payments") {
    return (
      <ShellLite appTabs>
        <ParentPaymentsScreen data={payments} billId={bill} />
      </ShellLite>
    );
  }
  if (screen === "earnings" && (view === "upcoming" || view === "paid")) {
    return (
      <ShellLite appTabs>
        <EarningsListScreen desk={desk} kind={view} billId={bill} period={period} />
      </ShellLite>
    );
  }
  if (screen === "earnings") {
    return (
      <ShellLite appTabs>
        <HostEarningsScreen initial={desk} />
      </ShellLite>
    );
  }
  if (screen === "insights") {
    return (
      <ShellLite appTabs>
        <HostInsightsScreen initial={insights} />
      </ShellLite>
    );
  }
  return (
    <ShellLite appTabs>
      {user ? (
        <Suspense fallback={null}>
          <MenuDeskTools />
        </Suspense>
      ) : null}
      <AppMenuScreen section={section} earnings={earnings} insights={insights} />
    </ShellLite>
  );
}
