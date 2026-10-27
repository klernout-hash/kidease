import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KidBlocks, KidFamily } from "@/components/kid-art";
import { useSessionDesks } from "@/components/session-desks";
import { roleSwitchTarget } from "@/lib/app-menu";
import { DESK_PATH, headerDesks, highlightDesk, parseDeskQuery, showDeskSwitcher } from "@/lib/desks";
import { stripLocalePrefix } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";

/**
 * One pill above the phone tab bar for people who have both Parent and Daycare.
 * It only switches the open desk. It does not change the account role.
 */
export function RoleSwitchPill({ placement = "fixed" }: { placement?: "fixed" | "flow" }) {
  const { t } = useCopy();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onAccount = stripLocalePrefix(pathname) === "/account";
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
      void navigate({ to: DESK_PATH[switching] });
      setSwitching(null);
    }, reduce ? 0 : 900);
    return () => window.clearTimeout(timer);
  }, [navigate, setSticky, switching]);

  if (placement === "fixed" && onAccount) return null;
  if (placement === "flow" && !onAccount) return null;
  if (!session || !showDeskSwitcher(session.desks, session.role, session.email)) return null;
  const desks = headerDesks(session.desks, session.role, session.email);
  const current = highlightDesk(pathname, sticky, queryDesk);
  const target = roleSwitchTarget(current, desks);
  if (!target && !switching) return null;
  const next = switching ?? target;
  if (!next) return null;

  return (
    <>
      {target ? (
        <button
          type="button"
          onClick={() => setSwitching(target)}
          data-ke="role-switch-pill"
          data-desk={target}
          className={
            placement === "flow"
              ? "ke-app-only mb-4 hidden w-full max-w-full whitespace-normal rounded-full bg-fg px-4 py-2 text-center text-sm font-semibold leading-snug text-bg min-h-11 touch-manipulation [[data-channel=app]_&]:inline-flex md:!hidden"
              : "ke-app-only fixed left-1/2 z-40 hidden -translate-x-1/2 items-center justify-center rounded-full bg-fg px-4 text-sm font-semibold text-bg shadow-lg min-h-11 touch-manipulation bottom-[calc(4.75rem+var(--ke-safe-bottom,env(safe-area-inset-bottom)))] [[data-channel=app]_&]:inline-flex"
          }
        >
          {t(target === "parent" ? "switchToParent" : "switchToDaycare")}
        </button>
      ) : null}
      {switching ? (
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
