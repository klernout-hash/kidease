import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { DeleteAccountPanel } from "@/components/delete-account-panel";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { localePath } from "@/lib/locale-path";
import { pageSeoHead } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";
import { DeskSkeleton } from "@/components/page-skeleton";

export const Route = createFileRoute("/delete-account")({
  head: () =>
    pageSeoHead({
      title: "Delete account · KidEase",
      description: "PIPEDA account deletion for KidEase: sign in to remove your account and family data.",
      path: "/delete-account",
    }),
  component: DeleteAccountPage,
});

export function DeleteAccountPage() {
  const { t, locale } = useCopy();
  const { user, isPending } = useCurrentUserState();

  if (!isPending && user) {
    return <Navigate to="/account" search={{ tab: "profile", section: "delete" }} />;
  }

  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-lg py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">{t("privacy")}</p>
        <h1 className="mt-2 font-display text-3xl tracking-[-0.03em]">{t("deleteAccount")}</h1>
        <p className="mt-3 text-muted">{t("deleteAccountLead")}</p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted" data-ke="delete-account-kept">
          <li>{t("deleteAccountKeepBilling")}</li>
          <li>{t("deleteAccountKeepLogs")}</li>
        </ul>
        {isPending ? (
          <DeskSkeleton />
        ) : (
          <DeleteAccountPanel signedIn={Boolean(user)} />
        )}
        <p className="mt-8 text-sm text-muted">
          <Link to={localePath("/unsubscribe", locale)} className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
            {t("unsubscribe")}
          </Link>
          {" · "}
          <Link to={localePath("/privacy", locale)} className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
            {t("privacy")}
          </Link>
          {" · "}
          <Link to={localePath("/help", locale)} className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
            {t("helpTitle")}
          </Link>
        </p>
      </main>
    </Shell>
  );
}
