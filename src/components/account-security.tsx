import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/password-field";
import { PasswordRules } from "@/components/password-rules";
import { changeAccountEmail, changeAccountPassword } from "@/lib/server/account-security";
import { presentAuthCopy } from "@/lib/auth/present-auth-copy";
import { localPasswordIssue } from "@/lib/password-hygiene";
import { isReauthRequiredMessage } from "@/lib/reauth";
import { ReauthDialog } from "@/components/reauth-dialog";
import { useCopy } from "@/lib/use-copy";

export function AccountSecurity({ email }: { email: string }) {
  const { t, locale } = useCopy();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [newEmail, setNewEmail] = useState(email);
  const [emailPassword, setEmailPassword] = useState("");
  const [busy, setBusy] = useState<"password" | "email" | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [reauth, setReauth] = useState<null | (() => void)>(null);

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    const issue = localPasswordIssue(newPassword, email);
    if (issue) {
      setPasswordError(issue);
      return;
    }
    if (newPassword !== confirm) {
      setPasswordError("Those passwords do not match.");
      return;
    }
    setBusy("password");
    setPasswordError(null);
    try {
      await changeAccountPassword({ data: { currentPassword, newPassword } });
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      toast.success(t("accountPasswordUpdated"));
    } catch (err) {
      const message = err instanceof Error ? err.message : t("accountPasswordFailed");
      if (isReauthRequiredMessage(message)) {
        setReauth(() => () => void onChangePassword(e));
        return;
      }
      setPasswordError(message);
    } finally {
      setBusy(null);
    }
  }

  async function onChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy("email");
    setEmailError(null);
    try {
      const res = await changeAccountEmail({ data: { newEmail, currentPassword: emailPassword } });
      setNewEmail(res.email);
      setEmailPassword("");
      toast.success(t("accountEmailUpdated"));
    } catch (err) {
      const message = err instanceof Error ? err.message : t("accountEmailFailed");
      if (isReauthRequiredMessage(message)) {
        setReauth(() => () => void onChangeEmail(e));
        return;
      }
      setEmailError(message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <section className="mt-8 space-y-3 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border" data-ke="account-password">
        <h2 className="font-display text-lg tracking-[-0.02em]">{t("accountChangePassword")}</h2>
        <p className="text-[13px] text-muted">{t("passwordPolicyHint")}</p>
        <form onSubmit={onChangePassword} className="space-y-3 ph-no-capture">
          <PasswordField
            label={t("resetPasswordCurrent")}
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
          <PasswordField
            label={t("resetPasswordNew")}
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
          <PasswordRules password={newPassword} />
          <PasswordField
            label={t("resetPasswordConfirmNew")}
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
          {passwordError ? <p className="text-sm text-danger">{presentAuthCopy(locale, passwordError)}</p> : null}
          <Button type="submit" className="w-full" disabled={busy !== null}>
            {busy === "password" ? t("accountSaving") : t("accountUpdatePassword")}
          </Button>
        </form>
      </section>

      <section className="mt-8 space-y-3 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border" data-ke="account-email">
        <h2 className="font-display text-lg tracking-[-0.02em]">{t("accountChangeEmail")}</h2>
        <p className="text-[13px] text-muted">{t("accountChangeEmailLead")}</p>
        <form onSubmit={onChangeEmail} className="space-y-3 ph-no-capture">
          <label className="block text-sm">
            {t("accountNewEmail")}
            <input
              className="ke-input mt-1"
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <PasswordField
            label={t("resetPasswordCurrent")}
            value={emailPassword}
            onChange={(e) => setEmailPassword(e.target.value)}
            autoComplete="current-password"
          />
          {emailError ? <p className="text-sm text-danger">{presentAuthCopy(locale, emailError)}</p> : null}
          <Button type="submit" className="w-full" disabled={busy !== null}>
            {busy === "email" ? t("accountSaving") : t("accountUpdateEmail")}
          </Button>
        </form>
      </section>

      <ReauthDialog
        open={Boolean(reauth)}
        onClose={() => setReauth(null)}
        onVerified={() => {
          const next = reauth;
          setReauth(null);
          next?.();
        }}
      />
    </>
  );
}
