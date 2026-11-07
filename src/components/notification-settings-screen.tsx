import { Link } from "@tanstack/react-router";
import { LifecyclePrefs } from "@/components/lifecycle-prefs";
import { NotificationPreferences } from "@/components/notification-preferences";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { notificationSettingsCopy } from "@/lib/notification-settings-copy";
import { useCopy } from "@/lib/use-copy";

/** Menu → Notification settings. All alert preferences live here; the bell shows only the feed. */
export function NotificationSettingsScreen() {
  const { locale } = useCopy();
  const copy = notificationSettingsCopy(locale);
  const { user, isPending } = useCurrentUserState();

  return (
    <main className="ke-menu-main ke-gutter mx-auto w-full max-w-lg pb-10 pt-6" data-ke="notification-settings">
      <Link to="/menu" className="inline-flex min-h-11 items-center text-sm font-medium text-primary">
        {copy.back}
      </Link>
      <h1 className="mt-2 text-[1.75rem] font-semibold tracking-[-0.03em]">{copy.title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted">{copy.lead}</p>
      {!user && !isPending ? (
        <p className="mt-6 text-sm">
          <Link to="/login" search={{ next: "/menu?screen=notifications" }} className="font-medium text-primary underline-offset-4 hover:underline">
            {copy.signIn}
          </Link>
        </p>
      ) : null}
      {user ? (
        <>
          <NotificationPreferences embedded />
          <section className="mt-8" aria-label={copy.emailTopics}>
            <LifecyclePrefs />
          </section>
        </>
      ) : null}
    </main>
  );
}
