import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ShellLite } from "@/components/shell-lite";
import { AppMenuScreen } from "@/components/app-menu-screen";
import { HostEarningsScreen } from "@/components/host-earnings-screen";
import { HostInsightsScreen } from "@/components/host-insights-screen";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type { MenuGroupId } from "@/lib/app-menu";

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
  const { user } = useCurrentUserState();
  if (screen === "earnings") {
    return (
      <ShellLite appTabs>
        <HostEarningsScreen />
      </ShellLite>
    );
  }
  if (screen === "insights") {
    return (
      <ShellLite appTabs>
        <HostInsightsScreen />
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
      <AppMenuScreen section={section} />
    </ShellLite>
  );
}
