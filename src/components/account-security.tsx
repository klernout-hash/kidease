import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/password-field";
import { PasswordRules } from "@/components/password-rules";
import { changeAccountEmail, changeAccountPassword } from "@/lib/server/account-security";
import { localPasswordIssue, PASSWORD_POLICY_HINT } from "@/lib/password-hygiene";
import { isReauthRequiredMessage } from "@/lib/reauth";
import { ReauthDialog } from "@/components/reauth-dialog";

export function AccountSecurity({ email }: { email: string }) {
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
      toast.success("Password updated. Other devices were signed out.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not change the password.";
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
      toast.success("Email updated. Use the new address next time you sign in.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not change the email.";
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
        <h2 className="font-display text-lg tracking-[-0.02em]">Change password</h2>
        <p className="text-[13px] text-muted">{PASSWORD_POLICY_HINT}</p>
        <form onSubmit={onChangePassword} className="space-y-3 ph-no-capture">
          <PasswordField
            label="Current password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
          <PasswordField
            label="New password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
          <PasswordRules password={newPassword} />
          <PasswordField
            label="Confirm new password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
          {passwordError ? <p className="text-sm text-danger">{passwordError}</p> : null}
          <Button type="submit" className="w-full" disabled={busy !== null}>
            {busy === "password" ? "Saving…" : "Update password"}
          </Button>
        </form>
      </section>

      <section className="mt-8 space-y-3 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border" data-ke="account-email">
        <h2 className="font-display text-lg tracking-[-0.02em]">Change email</h2>
        <p className="text-[13px] text-muted">
          Confirm your password or a recent email code first. The operator mailbox cannot be changed.
        </p>
        <form onSubmit={onChangeEmail} className="space-y-3 ph-no-capture">
          <label className="block text-sm">
            New email
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
            label="Current password"
            value={emailPassword}
            onChange={(e) => setEmailPassword(e.target.value)}
            autoComplete="current-password"
          />
          {emailError ? <p className="text-sm text-danger">{emailError}</p> : null}
          <Button type="submit" className="w-full" disabled={busy !== null}>
            {busy === "email" ? "Saving…" : "Update email"}
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
