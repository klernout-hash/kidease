import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { DeleteAccountPanel } from "@/components/delete-account-panel";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCopy } from "@/lib/use-copy";
import { DeskSkeleton } from "@/components/page-skeleton";

export const Route = createFileRoute("/delete-account")({
  head: () => ({
    meta: [
      { title: "Delete my account · KidEase" },
      {
        name: "description",
        content: "PIPEDA account deletion for KidEase — sign in to remove your account and family data.",
      },
    ],
  }),
  component: DeleteAccountPage,
});

function DeleteAccountPage() {
  const { t } = useCopy();
  const { user, isPending } = useCurrentUserState();

  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-lg py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">{t("privacy")}</p>
        <h1 className="mt-2 font-display text-3xl tracking-[-0.03em]">{t("deleteAccount")}</h1>
        <p className="mt-3 text-muted">{t("deleteAccountLead")}</p>
        {isPending ? (
          <DeskSkeleton />
        ) : (
          <DeleteAccountPanel signedIn={Boolean(user)} />
        )}
        <p className="mt-8 text-sm text-muted">
          <Link to="/unsubscribe" className="underline-offset-4 hover:underline">
            {t("unsubscribe")}
          </Link>
          {" · "}
          <Link to="/privacy" className="underline-offset-4 hover:underline">
            {t("privacy")}
          </Link>
          {" · "}
          <Link to="/help" className="underline-offset-4 hover:underline">
            {t("helpTitle")}
          </Link>
        </p>
      </main>
    </Shell>
  );
}
