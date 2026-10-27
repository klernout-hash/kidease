import { Link, useRouterState } from "@tanstack/react-router";
import { useSessionDesks } from "@/components/session-desks";
import { roleSwitchTarget } from "@/lib/app-menu";
import { DESK_PATH, headerDesks, highlightDesk, parseDeskQuery, showDeskSwitcher } from "@/lib/desks";
import { useCopy } from "@/lib/use-copy";

/**
 * One pill above the phone tab bar for people who have both Parent and Daycare.
 * It only switches the open desk. It does not change the account role.
 */
export function RoleSwitchPill() {
  const { t } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryDesk = useRouterState({
    select: (s) => parseDeskQuery((s.location.search as { desk?: unknown }).desk as string | undefined),
  });
  const { session, sticky, setSticky } = useSessionDesks();
  if (!session || !showDeskSwitcher(session.desks, session.role, session.email)) return null;
  const desks = headerDesks(session.desks, session.role, session.email);
  const current = highlightDesk(pathname, sticky, queryDesk);
  const target = roleSwitchTarget(current, desks);
  if (!target) return null;

  return (
    <Link
      to={DESK_PATH[target]}
      onClick={() => setSticky(target)}
      data-ke="role-switch-pill"
      data-desk={target}
      className="ke-app-only fixed left-1/2 z-50 hidden -translate-x-1/2 items-center justify-center rounded-full bg-fg px-4 text-sm font-semibold text-bg shadow-lg min-h-11 touch-manipulation bottom-[calc(4.75rem+var(--ke-safe-bottom,env(safe-area-inset-bottom)))] [[data-channel=app]_&]:inline-flex"
    >
      {t(target === "parent" ? "switchToParent" : "switchToDaycare")}
    </Link>
  );
}
