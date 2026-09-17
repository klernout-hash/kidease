import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { AcceptEmployeeInvite } from "@/components/centre-employees";
import { signOut } from "@/lib/auth/client";
import { useSettledUser } from "@/lib/auth/use-current-user";
import { inviteEmailsMatch } from "@/lib/centre-roles";
import { peekCentreInvite } from "@/lib/server/centre-members";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [
      { title: "Employee invite · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const { t } = useCopy();
  const { user, isPending } = useSettledUser();
  const [peek, setPeek] = useState<
    | { ok: true; email: string; name: string | null; role: string; daycareName: string }
    | { ok: false; error: string }
    | null
  >(null);

  useEffect(() => {
    void peekCentreInvite({ data: token })
      .then(setPeek)
      .catch(() => setPeek({ ok: false, error: t("employeeInviteGone") }));
  }, [token, t]);

  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-lg py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">{t("employeesTitle")}</p>
        <h1 className="mt-2 font-display text-3xl tracking-[-0.03em]">{t("employeeInviteTitle")}</h1>
        {!peek ? (
          <p className="mt-4 text-muted">{t("loading")}</p>
        ) : !peek.ok ? (
          <p className="mt-4 rounded-xl bg-surface p-5 text-sm ring-1 ring-border">{peek.error}</p>
        ) : (
          <>
            <p className="mt-3 text-muted">
              {t("employeeInviteLead").replace("{centre}", peek.daycareName).replace("{email}", peek.email)}
            </p>
            {isPending ? (
              <p className="mt-6 text-muted">{t("loading")}</p>
            ) : user && inviteEmailsMatch(peek.email, user.primaryEmail) ? (
              <div className="mt-6">
                <AcceptEmployeeInvite token={token} />
              </div>
            ) : user ? (
              <div className="mt-6 space-y-4">
                <p className="rounded-xl bg-surface p-5 text-sm ring-1 ring-border" role="alert">
                  {t("employeeInviteWrongEmail")
                    .replace("{signedIn}", user.primaryEmail || t("employeeNoName"))
                    .replace("{email}", peek.email)}
                </p>
                <Button
                  type="button"
                  className="min-h-11"
                  onClick={() => {
                    const next = `/invite/${encodeURIComponent(token)}`;
                    void signOut(
                      `/login?role=provider&desk=director&intent=in&next=${encodeURIComponent(next)}`,
                    );
                  }}
                >
                  {t("employeeInviteSignInAs").replace("{email}", peek.email)}
                </Button>
              </div>
            ) : (
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button asChild className="min-h-11">
                  <Link
                    to="/login"
                    search={{
                      role: "provider",
                      desk: "director",
                      intent: "up",
                      next: `/invite/${token}`,
                    }}
                  >
                    {t("employeeInviteCreate")}
                  </Link>
                </Button>
                <Button asChild variant="secondary" className="min-h-11">
                  <Link
                    to="/login"
                    search={{
                      role: "provider",
                      desk: "director",
                      intent: "in",
                      next: `/invite/${token}`,
                    }}
                  >
                    {t("employeeInviteSignIn")}
                  </Link>
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </Shell>
  );
}
