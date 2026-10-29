import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AppTabBar } from "@/components/app-tab-bar";
import { BrandMark } from "@/components/brand-mark";
import { HeaderAccount } from "@/components/header-account";

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
    <div className="flex min-h-dvh min-h-[100dvh] w-full min-w-0 flex-col bg-bg pl-[var(--ke-safe-left,env(safe-area-inset-left))] pr-[var(--ke-safe-right,env(safe-area-inset-right))] text-fg">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-bg/95 pt-[var(--ke-safe-top,env(safe-area-inset-top))] backdrop-blur-md dark:border-white/15">
        <div className="ke-gutter mx-auto flex min-h-16 max-w-6xl items-center py-2">
          <Link to="/" className="shrink-0" aria-label="KidEase">
            <BrandMark size="sm" />
          </Link>
          <div className="ml-auto">
            <HeaderAccount />
          </div>
        </div>
      </header>
      <div
        className={
          appTabs
            ? "flex min-h-0 min-w-0 flex-1 flex-col [[data-channel=app]_&]:pb-[calc(4.75rem+var(--ke-safe-bottom,env(safe-area-inset-bottom)))]"
            : "flex min-h-0 min-w-0 flex-1 flex-col"
        }
      >
        {children}
      </div>
      {appTabs ? <AppTabBar /> : null}
    </div>
  );
}
