import { Link, useRouterState } from "@tanstack/react-router";
import { UserRound } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { ProfileAvatar } from "@/components/profile-avatar";
import { useRoleChrome } from "@/components/role-chrome";
import { useSessionDesks } from "@/components/session-desks";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { accountSearch } from "@/lib/desks";
import { accountDeskPath } from "@/lib/desk-nav";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";

/**
 * Top-right on every page: notifications, then the profile photo.
 * Signed-out visitors get a Log in photo. The bell has no badge until a session exists.
 */
export function HeaderAccount() {
  const { t, locale } = useCopy();
  const { user } = useCurrentUserState();
  const chrome = useRoleChrome();
  const { sticky } = useSessionDesks();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const headerUser = chrome.guestView ? null : user;
  // Role chrome is in the first HTML. A known signed-in role keeps the account
  // photo while the client session is still empty. A guest whose session is
  // only loading stays on Log in.
  const showAvatar = Boolean(headerUser) || (chrome.signedIn && !chrome.pending);

  return (
    <div className="flex items-center gap-0.5" data-ke="header-account">
      <NotificationBell />
      {showAvatar ? (
        <Link
          to={accountDeskPath(pathname)}
          search={accountSearch(sticky)}
          data-ke="header-avatar"
          aria-label={t("menuAccountSettings")}
          className="grid size-12 place-items-center rounded-full touch-manipulation"
        >
          <span className="sr-only">{t("menuAccountSettings")}</span>
          {headerUser ? (
            <ProfileAvatar
              userId={headerUser.id}
              fallback={headerUser.profileImageUrl}
              name={headerUser.displayName}
              size="sm"
            />
          ) : (
            <span className="grid size-9 place-items-center rounded-full bg-surface text-primary ring-2 ring-primary/80">
              <UserRound className="size-4" strokeWidth={1.7} aria-hidden />
            </span>
          )}
        </Link>
      ) : (
        <Link
          to={localePath("/login", locale)}
          data-ke="header-login"
          aria-label={t("logIn")}
          className="grid size-12 place-items-center rounded-full touch-manipulation"
        >
          <span className="grid size-9 place-items-center rounded-full bg-surface text-primary ring-2 ring-primary/80">
            <UserRound className="size-4" strokeWidth={1.7} aria-hidden />
          </span>
        </Link>
      )}
    </div>
  );
}
