import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useSessionDesks } from "@/components/session-desks";
import { failClosedUnread, formatUnreadBadge, NOTIFICATIONS_PATH } from "@/lib/notifications";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

export function NotificationBell({
  className,
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  const { t } = useCopy();
  const { session } = useSessionDesks();
  const unread = failClosedUnread(session?.notificationUnread);
  const badge = formatUnreadBadge(unread);
  const hint = t("notificationsBellHint");
  const count = badge ? t("notificationsUnread").replace("{n}", badge) : "";
  const label = count ? `${t("notifications")}. ${hint}. ${count}` : `${t("notifications")}. ${hint}`;

  return (
    <Link
      to={NOTIFICATIONS_PATH}
      onClick={onClick}
      aria-label={label}
      title={hint}
      className={cn(
        "relative grid size-12 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-full text-fg hover:bg-surface",
        className,
      )}
    >
      <Bell className="size-6" strokeWidth={1.75} />
      <span className="sr-only" data-ke="notification-bell-hint">{hint}</span>
      {badge ? (
        <span
          data-ke="notification-unread"
          className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-semibold leading-4 text-primary-fg"
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function NotificationUnreadDot({ unread }: { unread: number }) {
  const count = failClosedUnread(unread);
  if (count <= 0) return null;
  return (
    <span
      data-ke="notification-unread"
      className="grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-semibold leading-4 text-primary-fg"
    >
      {formatUnreadBadge(count)}
    </span>
  );
}
