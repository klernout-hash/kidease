import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ShellLite } from "@/components/shell-lite";
import { AppMenuScreen } from "@/components/app-menu-screen";
import { EarningsPayoutsScreen } from "@/components/earnings-payouts";
import { HostEarningsScreen } from "@/components/host-earnings-screen";
import { HostInsightsScreen } from "@/components/host-insights-screen";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type { MenuGroupId } from "@/lib/app-menu";
import type { EarningsResult } from "@/lib/earnings-desk";
import type { HostEarnings, HostInsights } from "@/lib/host-desk";
import { loadEarningsDesk } from "@/lib/server/earnings-desk";
import { loadHostEarnings, loadHostInsights } from "@/lib/server/host-desk";

const MenuDeskTools = lazy(() =>
  import("@/components/menu-desk-tools").then((m) => ({ default: m.MenuDeskTools })),
);

const SECTIONS = ["resources", "guides", "help", "legal"] as const;

type MenuScreen = "earnings" | "insights" | "payments";
type EarningsView = "payouts" | "details" | "upcoming" | "paid" | "statement";

const VIEWS: EarningsView[] = ["payouts", "details", "upcoming", "paid", "statement"];

type MenuLoader = {
  earnings: HostEarnings | null;
  insights: HostInsights | null;
  desk: EarningsResult | null;
};

export const Route = createFileRoute("/menu")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { section?: MenuGroupId; screen?: MenuScreen; view?: EarningsView; period?: string; bill?: string } => {
    const section = SECTIONS.includes(s.section as MenuGroupId) ? (s.section as MenuGroupId) : undefined;
    const screen = s.screen === "earnings" || s.screen === "insights" || s.screen === "payments" ? s.screen : undefined;
    const view = VIEWS.includes(s.view as EarningsView) ? (s.view as EarningsView) : undefined;
    const period = typeof s.period === "string" && /^\d{4}-\d{2}$/.test(s.period) ? s.period : undefined;
    const bill = typeof s.bill === "string" && s.bill.trim() && s.bill.length <= 80 ? s.bill.trim() : undefined;
    return { section, screen, view, period, bill };
  },
  loaderDeps: ({ search }) => ({ screen: search.screen }),
  loader: async ({ deps, context }): Promise<MenuLoader> => {
    if (deps.screen === "earnings") {
      try {
        return { earnings: null, insights: null, desk: await loadEarningsDesk() };
      } catch {
        return { earnings: null, insights: null, desk: { ok: false } };
      }
    }
    if (deps.screen === "insights") {
      try {
        return { earnings: null, insights: await loadHostInsights(), desk: null };
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
        };
      }
    }
    const chrome = (context as { roleChrome?: { role?: string | null; ownedSlugs?: string[] } }).roleChrome;
    const host = chrome?.role === "provider" || (chrome?.ownedSlugs?.length ?? 0) > 0;
    if (!host) return { earnings: null, insights: null, desk: null };
    const [earnings, insights] = await Promise.all([
      loadHostEarnings().catch(() => null),
      loadHostInsights().catch(() => null),
    ]);
    return { earnings, insights, desk: null };
  },
  head: () => ({
    meta: [
      { title: "Menu · KidEase" },
      { name: "description", content: "Account, help, and the rest of KidEase." },
    ],
  }),
  component: MenuPage,
});

function MenuPage() {
  const { section, screen, view } = Route.useSearch();
  const { earnings, insights, desk } = Route.useLoaderData();
  const { user } = useCurrentUserState();
  if (screen === "earnings" && view === "payouts") {
    return (
      <ShellLite appTabs>
        <EarningsPayoutsScreen desk={desk} />
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
