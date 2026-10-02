import { Link, useRouterState } from "@tanstack/react-router";
import {
  canSeeAdminDesk,
  DESK_PATH,
  headerDesks,
  highlightDesk,
  openAdminDesk,
  parseDeskQuery,
  showDeskSwitcher,
  type DeskKey,
} from "@/lib/desks";
import { useSessionDesks } from "@/components/session-desks";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";
import { cn } from "@/lib/utils";

export { useSessionDesks } from "@/components/session-desks";

const DESK_COPY: Record<DeskKey, CopyKey> = {
  parent: "deskParent",
  provider: "deskDirector",
  admin: "deskAdmin",
  support: "deskSupport",
};

const SWITCH_COPY: Record<DeskKey, CopyKey> = {
  parent: "switchToParent",
  provider: "switchToDaycare",
  admin: "switchToAdmin",
  support: "deskSupport",
};

const SWITCH_VIEW: Partial<Record<DeskKey, CopyKey>> = {
  parent: "switchToParentView",
  provider: "switchToDaycareView",
};

function deskLabel(t: (key: CopyKey) => string, desk: DeskKey, adminViewer: boolean) {
  void DESK_COPY[desk];
  if (adminViewer && SWITCH_VIEW[desk]) return t(SWITCH_VIEW[desk]);
  return t(SWITCH_COPY[desk]);
}

function SwitchRows({
  desks,
  current,
  onPick,
  t,
  adminViewer,
}: {
  desks: DeskKey[];
  current: DeskKey | null;
  onPick: (desk: DeskKey) => void;
  t: (key: CopyKey) => string;
  adminViewer: boolean;
}) {
  return (
    <>
      {desks.map((desk) => {
        const on = current === desk;
        if (on) return null;
        const className = cn(
          "flex min-h-11 w-full items-center rounded-lg px-2.5 text-left text-sm font-medium text-fg hover:bg-surface",
        );
        if (desk === "admin") {
          return (
            <button
              key={desk}
              type="button"
              data-ke="desk-switch-tab"
              data-desk={desk}
              aria-current={on ? "page" : undefined}
              className={className}
              onClick={() => {
                onPick(desk);
                openAdminDesk();
              }}
            >
              {deskLabel(t, desk, adminViewer)}
            </button>
          );
        }
        return (
          <Link
            key={desk}
            to={DESK_PATH[desk]}
            onClick={() => onPick(desk)}
            data-ke="desk-switch-tab"
            data-desk={desk}
            aria-current={on ? "page" : undefined}
            className={className}
          >
            {deskLabel(t, desk, adminViewer)}
          </Link>
        );
      })}
    </>
  );
}

export function DeskSwitcher({ compact = false }: { compact?: boolean }) {
  const { t } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryDesk = useRouterState({
    select: (s) => parseDeskQuery((s.location.search as { desk?: unknown }).desk as string | undefined),
  });
  const { session, sticky, setSticky } = useSessionDesks();
  // Same Better Auth session. Pills only navigate: they do not call setRole
  // or rewrite the session cookie. /provider still promotes via its own mount.
  if (!session || !showDeskSwitcher(session.desks, session.role, session.email)) return null;

  const desks = headerDesks(session.desks, session.role, session.email);
  const highlighted = highlightDesk(pathname, sticky, queryDesk);
  const current = highlighted && desks.includes(highlighted) ? highlighted : null;

  const adminViewer = canSeeAdminDesk(session.role, session.email);

  return (
    <div
      data-ke="desk-switcher"
      role="navigation"
      aria-label={t("deskSwitcherLabel")}
      className={compact ? "flex w-full min-w-0 flex-col gap-0.5" : "flex w-full min-w-0 flex-col gap-0.5"}
    >
      <SwitchRows desks={desks} current={current} onPick={setSticky} t={t} adminViewer={adminViewer} />
    </div>
  );
}
