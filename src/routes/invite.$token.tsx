import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { AcceptEmployeeInvite } from "@/components/centre-employees";
import { acceptCentreInvite, peekCentreInvite } from "@/lib/server/centre-members";
import { useSettledUser } from "@/lib/auth/use-current-user";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";

function inviteRoleKey(role: string): CopyKey {
  if (role === "manager") return "employeeRoleManager";
  if (role === "read_only") return "employeeRoleReadOnly";
  return "employeeRoleStaff";
}

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
  const started = useRef(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
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

  const sessionEmail = (user?.primaryEmail || "").trim().toLowerCase();
  const inviteEmail = peek && peek.ok ? peek.email.trim().toLowerCase() : "";
  const sameMailbox = Boolean(sessionEmail) && sessionEmail === inviteEmail;

  useEffect(() => {
    if (!sameMailbox || started.current) return;
    started.current = true;
    setJoining(true);
    setJoinError("");
    void acceptCentreInvite({ data: token })
      .then(() => {
        window.location.assign("/provider");
      })
      .catch((err) => {
        started.current = false;
        setJoining(false);
        setJoinError(err instanceof Error ? err.message : t("employeeAcceptFailed"));
      });
  }, [sameMailbox, t, token]);

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
            <p className="mt-2 font-medium" data-ke="invite-role">
              {t("employeeInviteRole").replace("{role}", t(inviteRoleKey(peek.role)))}
            </p>
            {isPending || (user && sameMailbox && joining) ? (
              <p className="mt-6 text-muted">{t("loading")}</p>
            ) : user ? (
              <div className="mt-6">
                {joinError ? (
                  <p className="mb-3 text-sm text-destructive" role="alert">
                    {joinError}
                  </p>
                ) : null}
                <AcceptEmployeeInvite token={token} />
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
