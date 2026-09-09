import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand-mark";

/**
 * Header-only shell for /menu and /verify-2fa so those routes do not pull
 * NavDrawer, footer, chat, or desk-switcher into the first JS chunk.
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
      {appTabs ? <MenuAppTabs /> : null}
    </div>
  );
}

function MenuAppTabs() {
  return (
    <nav className="ke-app-only fixed inset-x-0 bottom-0 z-50 hidden border-t border-border bg-surface [[data-channel=app]_&]:block">
      <div className="mx-auto grid max-w-lg grid-cols-5 px-0.5 pb-[env(safe-area-inset-bottom)] pt-1 text-center text-[11px] font-medium text-muted">
        <Link to="/" className="grid min-h-14 place-items-center">
          Search
        </Link>
        <Link to="/parent" search={{ tab: "saved" }} className="grid min-h-14 place-items-center">
          Saved
        </Link>
        <Link to="/parent" search={{ tab: "enrolled" }} className="grid min-h-14 place-items-center">
          Enrolled
        </Link>
        <Link to="/inbox" className="grid min-h-14 place-items-center">
          Messages
        </Link>
        <Link to="/menu" className="grid min-h-14 place-items-center text-fg">
          Menu
        </Link>
      </div>
    </nav>
  );
}
