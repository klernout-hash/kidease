import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { KidBlocks, KidFamily } from "@/components/kid-art";
import { useSessionDesks } from "@/components/session-desks";
import { roleSwitchTarget } from "@/lib/app-menu";
import { parentDeskPath, providerDeskPath } from "@/lib/desk-nav";
import { headerDesks, highlightDesk, parseDeskQuery, showDeskSwitcher } from "@/lib/desks";
import { useCopy } from "@/lib/use-copy";

/**
 * Role switch as a normal row in Menu and Profile.
 * It only switches the open desk. It does not change the account role.
 * The old floating pill sat on top of the tab bar and covered desk content.
 */
export function RoleSwitchPill() {
  const { t } = useCopy();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryDesk = useRouterState({
    select: (s) => parseDeskQuery((s.location.search as { desk?: unknown }).desk as string | undefined),
  });
  const { session, sticky, setSticky } = useSessionDesks();
  const [switching, setSwitching] = useState<"parent" | "provider" | null>(null);

  useEffect(() => {
    if (!switching) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      setSticky(switching);
      void navigate({
        to: switching === "parent" ? parentDeskPath(pathname) : providerDeskPath(pathname),
      });
      setSwitching(null);
    }, reduce ? 0 : 900);
    return () => window.clearTimeout(timer);
  }, [navigate, pathname, setSticky, switching]);

  if (!session || !showDeskSwitcher(session.desks, session.role, session.email)) return null;
  const desks = headerDesks(session.desks, session.role, session.email);
  const current = highlightDesk(pathname, sticky, queryDesk);
  const target = roleSwitchTarget(current, desks);
  if (!target && !switching) return null;
  const next = switching ?? target;

  return (
    <>
      {target ? (
        <button
          type="button"
          onClick={() => setSwitching(target)}
          data-ke="role-switch-row"
          data-desk={target}
          className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-border px-1 text-left text-[15px] font-medium text-fg touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <span className="min-w-0 flex-1">{t(target === "parent" ? "switchToParent" : "switchToDaycare")}</span>
          <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
        </button>
      ) : null}
      {next && switching ? (
        <div
          className="ke-screen-enter fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-bg px-6 text-center"
          data-ke="mode-switch"
          data-desk={switching}
          role="status"
        >
          {switching === "provider" ? (
            <KidBlocks className="h-24 w-40 text-primary" />
          ) : (
            <KidFamily className="h-24 w-40" />
          )}
          <p className="text-lg font-semibold">{t(switching === "parent" ? "switchingToParent" : "switchingToDaycare")}</p>
        </div>
      ) : null}
    </>
  );
}
