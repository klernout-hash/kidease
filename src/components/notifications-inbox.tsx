import { useEffect, useState, type MouseEvent } from "react";
import { Bell, Settings } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { notificationSettingsCopy } from "@/lib/notification-settings-copy";
import { Shell } from "@/components/shell";
import { EmptyState } from "@/components/empty-state";
import { DeskSkeleton } from "@/components/page-skeleton";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { notificationHrefForShell } from "@/lib/native-admin";
import { fillNotificationCopy, isCriticalNotification, notificationCopyKey } from "@/lib/notifications";
import { useNativeHidesAdmin } from "@/lib/use-native-shell";
import { listMyNotifications, markNotificationRead } from "@/lib/server/notifications";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/use-copy";
import { confirmAction } from "@/lib/success-confirm";
import { refreshSessionDesks } from "@/components/session-desks";
import { notificationTimeLabel } from "@/lib/notification-groups";
import { alertTextForReader } from "@/lib/unified-alerts";

type Items = Awaited<ReturnType<typeof listMyNotifications>>;

export function NotificationsInbox() {
  const { user, isPending } = useCurrentUserState();
  const { t, locale } = useCopy();
  const hideAdmin = useNativeHidesAdmin();
  const [feed, setFeed] = useState<{ userId: string; items: Items | "error" } | null>(null);
  const [attempt, retry] = useState(0);
  const [marking, setMarking] = useState(false);
  const userId = user?.id;
  const items = feed?.userId === userId ? feed?.items : null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void listMyNotifications()
      .then((next) => {
        if (!cancelled) setFeed({ userId, items: next });
      })
      .catch(() => {
        if (!cancelled) setFeed({ userId, items: "error" });
      });
    return () => { cancelled = true; };
  }, [userId, attempt]);

  async function markAllRead() {
    if (!userId) return;
    setMarking(true);
    try {
      await markNotificationRead({ data: { all: true } });
      setFeed({ userId, items: await listMyNotifications() });
      refreshSessionDesks();
      confirmAction(t, "markedRead");
    } finally {
      setMarking(false);
    }
  }

  function openNotification(event: MouseEvent<HTMLAnchorElement>, row: Items[number], href: string) {
    if (row.readAt || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void markNotificationRead({ data: { receipts: row.receipts } })
      .finally(() => {
        refreshSessionDesks();
        window.location.assign(href);
      }).catch(() => undefined);
  }

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
      <main className="ke-gutter mx-auto w-full max-w-3xl pb-8 pt-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.03em]">{t("notifications")}</h1>
          {Array.isArray(items) && items.some((row) => !row.readAt) ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={marking}
              data-ke="notifications-mark-all"
              onClick={() => void markAllRead().catch(() => undefined)}
            >
              {t("markAlertsRead")}
            </Button>
          ) : null}
        </div>
        <Link
          to="/menu"
          search={{ screen: "notifications" }}
          data-ke="bell-settings-link"
          aria-label={notificationSettingsCopy(locale).linkAria}
          className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <Settings className="size-4" aria-hidden />
          {notificationSettingsCopy(locale).title}
        </Link>
        <ul className="mt-6 divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
          {items == null ? (
            <li className="space-y-3 p-4" aria-hidden="true">
              <div className="ke-skel h-14 w-full rounded-xl" />
              <div className="ke-skel h-14 w-full rounded-xl" />
            </li>
          ) : items === "error" ? (
            <li className="p-4">
              <p role="alert" className="mb-2 text-sm">{t("searchAlertsLoadFailed")}</p>
              <Button variant="secondary" onClick={() => { setFeed(null); retry((n) => n + 1); }}>
                {t("tryAgain")}
              </Button>
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
            items.map((row) => {
              const item = row.data;
              const text = "titleKey" in item
                ? {
                    title: fillNotificationCopy(t(notificationCopyKey(item.titleKey)), {
                      name: item.daycareName,
                      kind: item.status,
                    }),
                    body: null,
                    critical: isCriticalNotification(item),
                  }
                : { ...alertTextForReader(item.typeId, locale === "fr" ? "fr" : "en", item), critical: item.critical };
              const href = notificationHrefForShell(item.href, hideAdmin);
              return (
                <li key={row.key}>
                  <a
                    href={href}
                    data-ke="notification-row"
                    className="flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2"
                    onClick={(event) => openNotification(event, row, href)}
                  >
                    <span
                      className={`mt-2 size-2 shrink-0 rounded-full ${row.readAt ? "bg-border" : "bg-danger"}`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium text-fg">{text.title}</span>
                      {text.body ? <span className="mt-0.5 block text-sm text-muted">{text.body}</span> : null}
                      {text.critical ? (
                        <span className="mt-0.5 block text-xs font-medium text-danger">{t("inboxCriticalNotif")}</span>
                      ) : null}
                      <time className="mt-0.5 block text-xs text-muted" dateTime={row.createdAt}>
                        {notificationTimeLabel(row.createdAt, locale)}
                      </time>
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
