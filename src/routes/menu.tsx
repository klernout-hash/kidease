import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ShellLite } from "@/components/shell-lite";
import { AppMenuScreen } from "@/components/app-menu-screen";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type { MenuGroupId } from "@/lib/app-menu";

const MenuDeskTools = lazy(() =>
  import("@/components/menu-desk-tools").then((m) => ({ default: m.MenuDeskTools })),
);

const SECTIONS = ["resources", "guides", "help", "legal"] as const;

export const Route = createFileRoute("/menu")({
  validateSearch: (s: Record<string, unknown>): { section?: MenuGroupId } => {
    const section = s.section;
    if (SECTIONS.includes(section as MenuGroupId)) return { section: section as MenuGroupId };
    return {};
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
  const { section } = Route.useSearch();
  const { user } = useCurrentUserState();
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
