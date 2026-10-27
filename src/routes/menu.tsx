import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ShellLite } from "@/components/shell-lite";
import { AppMenuScreen } from "@/components/app-menu-screen";
import { HostEarningsScreen } from "@/components/host-earnings-screen";
import { HostInsightsScreen } from "@/components/host-insights-screen";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type { MenuGroupId } from "@/lib/app-menu";
import type { HostEarnings, HostInsights } from "@/lib/host-desk";
import { loadHostEarnings, loadHostInsights } from "@/lib/server/host-desk";

const MenuDeskTools = lazy(() =>
  import("@/components/menu-desk-tools").then((m) => ({ default: m.MenuDeskTools })),
);

const SECTIONS = ["resources", "guides", "help", "legal"] as const;

type MenuScreen = "earnings" | "insights";

export const Route = createFileRoute("/menu")({
  validateSearch: (s: Record<string, unknown>): { section?: MenuGroupId; screen?: MenuScreen } => {
    const section = SECTIONS.includes(s.section as MenuGroupId) ? (s.section as MenuGroupId) : undefined;
    const screen = s.screen === "earnings" || s.screen === "insights" ? s.screen : undefined;
    return { section, screen };
  },
  loaderDeps: ({ search }) => ({ screen: search.screen }),
  loader: async ({ deps, context }): Promise<{ earnings: HostEarnings | null; insights: HostInsights | null }> => {
    if (deps.screen === "earnings") {
      try {
        return { earnings: await loadHostEarnings(), insights: null };
      } catch {
        return { earnings: { ok: false, thisMonthCents: null, bars: [], paid: [], upcoming: [] }, insights: null };
      }
    }
    if (deps.screen === "insights") {
      try {
        return { earnings: null, insights: await loadHostInsights() };
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
        };
      }
    }
    const chrome = (context as { roleChrome?: { role?: string | null; ownedSlugs?: string[] } }).roleChrome;
    const host = chrome?.role === "provider" || (chrome?.ownedSlugs?.length ?? 0) > 0;
    if (!host) return { earnings: null, insights: null };
    const [earnings, insights] = await Promise.all([
      loadHostEarnings().catch(() => null),
      loadHostInsights().catch(() => null),
    ]);
    return { earnings, insights };
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
  const { section, screen } = Route.useSearch();
  const { earnings, insights } = Route.useLoaderData();
  const { user } = useCurrentUserState();
  if (screen === "earnings") {
    return (
      <ShellLite appTabs>
        <HostEarningsScreen initial={earnings} />
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
