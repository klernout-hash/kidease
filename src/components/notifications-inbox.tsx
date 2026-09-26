import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Shell } from "@/components/shell";
import { EmptyState } from "@/components/empty-state";
import { DeskSkeleton } from "@/components/page-skeleton";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { fillNotificationCopy, isCriticalNotification, notificationCopyKey, type NotificationItem } from "@/lib/notifications";
import { listMyNotifications, markNotificationRead } from "@/lib/server/notifications";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/use-copy";
import { confirmAction } from "@/lib/success-confirm";

function timeLabel(iso: string, locale: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale === "fr" ? "fr-CA" : "en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NotificationsInbox() {
  const { user, isPending } = useCurrentUserState();
  const { t, locale } = useCopy();
  const [items, setItems] = useState<NotificationItem[] | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    void listMyNotifications()
      .then(setItems)
      .catch(() => setItems([]));
  }, [user?.id]);

  if (isPending) {
    return (
      <Shell>
        <DeskSkeleton />
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;

  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-lg pb-8 pt-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.03em]">{t("notifications")}</h1>
          {items?.some((row) => !row.readAt) ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void markNotificationRead({ data: { all: true } })
                  .then(() => {
                    confirmAction(t, "markedRead");
                    return listMyNotifications().then(setItems);
                  })
                  .catch(() => undefined);
              }}
            >
              {t("markAlertsRead")}
            </Button>
          ) : null}
        </div>
        <ul className="mt-6 divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
          {items === null ? (
            <li className="space-y-3 p-4" aria-hidden="true">
              <div className="ke-skel h-14 w-full rounded-xl" />
              <div className="ke-skel h-14 w-full rounded-xl" />
            </li>
          ) : items.length === 0 ? (
            <li className="p-2">
              <EmptyState
                title={t("notificationsEmpty")}
                body={t("notificationsEmptyLead")}
                action={t("emptyFindCare")}
                actionTo="/search"
                icon={Bell}
              />
            </li>
          ) : (
            items.map((item) => {
              const title = fillNotificationCopy(t(notificationCopyKey(item.titleKey)), {
                name: item.daycareName,
                kind: item.status,
              });
              return (
                <li key={item.id}>
                  <a
                    href={item.href}
                    data-ke="notification-row"
                    className="flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2"
                    onClick={() => {
                      void markNotificationRead({ data: { id: item.id } }).catch(() => undefined);
                    }}
                  >
                    <span
                      className={`mt-2 size-2 shrink-0 rounded-full ${item.readAt ? "bg-border" : "bg-danger"}`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium text-fg">{title}</span>
                      {isCriticalNotification(item) ? (
                        <span className="mt-0.5 block text-xs font-medium text-danger">{t("inboxCriticalNotif")}</span>
                      ) : null}
                      <span className="mt-0.5 block text-xs text-muted">{timeLabel(item.createdAt, locale)}</span>
                    </span>
                  </a>
                </li>
              );
            })
          )}
        </ul>
      </main>
    </Shell>
  );
}
