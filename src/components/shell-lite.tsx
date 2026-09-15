import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AppTabBar } from "@/components/app-tab-bar";
import { BrandMark } from "@/components/brand-mark";

/**
 * Header-only shell for /menu and /verify-2fa so those routes do not pull
 * NavDrawer, footer, chat, or desk-switcher into the first JS chunk.
 * App tabs still use the same icon bar as every other app-channel page.
 */
export function ShellLite({
  children,
  appTabs = false,
}: {
  children: ReactNode;
  appTabs?: boolean;
}) {
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-50 border-b border-border bg-bg pt-[env(safe-area-inset-top)]">
        <div className="ke-gutter mx-auto flex min-h-16 max-w-6xl items-center py-2">
          <Link to="/" className="shrink-0" aria-label="KidEase">
            <BrandMark size="sm" />
          </Link>
        </div>
      </header>
      <div className={appTabs ? "[[data-channel=app]_&]:pb-[calc(5.25rem+env(safe-area-inset-bottom))]" : undefined}>
        {children}
      </div>
      {appTabs ? <AppTabBar /> : null}
    </div>
  );
}
