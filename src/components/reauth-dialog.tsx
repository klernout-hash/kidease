import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/password-field";
import {
  confirmReauthOtp,
  confirmReauthPassword,
  startReauthOtp,
} from "@/lib/server/reauth";
import { REAUTH_REQUIRED_MESSAGE, isReauthRequiredMessage } from "@/lib/reauth";
import { hourlyOtpWaitCopy, twoFactorResendWaitCopy } from "@/lib/two-factor-start";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";

export function isReauthRequired(err: unknown): boolean {
  return err instanceof Error && isReauthRequiredMessage(err.message);
}

export async function withReauth<T>(action: () => Promise<T>, prompt: () => Promise<boolean>): Promise<T> {
  try {
    return await action();
  } catch (err) {
    if (!isReauthRequired(err)) throw err;
    const ok = await prompt();
    if (!ok) throw new Error(REAUTH_REQUIRED_MESSAGE);
    return action();
  }
}

export function ReauthDialog({
  open,
  onClose,
  onVerified,
}: {
  open: boolean;
  onClose: () => void;
  onVerified: () => void;
}) {
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const { token, onToken, reset: resetTurnstile, takeChallenge, resetSignal, required: turnstileRequired, onRequired } =
    useTurnstileToken();

  if (!open) return null;

  async function onPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const challenge = takeChallenge();
      if (turnstileRequired && !challenge) {
        throw new Error("Please complete the security check, then try again.");
      }
      await confirmReauthPassword({ data: { password, turnstileToken: challenge } });
      setPassword("");
      onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm.");
      resetTurnstile();
    } finally {
      setBusy(false);
    }
  }

  async function onSendCode() {
    if (wait > 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await startReauthOtp();
      const seconds = "waitSeconds" in res && typeof res.waitSeconds === "number" ? res.waitSeconds : 0;
      if (!res.sent && seconds > 0) {
        setWait(seconds);
        setNotice("hourly" in res && res.hourly ? hourlyOtpWaitCopy(seconds) : twoFactorResendWaitCopy(seconds));
      } else if (res.sent) {
        setNotice("A code is on its way. Use the latest email.");
        setMode("otp");
      } else {
        setError("Please wait a moment, then try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send a code.");
    } finally {
      setBusy(false);
    }
  }

  async function onOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const challenge = takeChallenge();
      if (turnstileRequired && !challenge) {
        throw new Error("Please complete the security check, then try again.");
      }
      await confirmReauthOtp({ data: { code, turnstileToken: challenge } });
      setCode("");
      onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm.");
      resetTurnstile();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-fg/40 p-4" role="dialog" aria-modal="true" data-ke="reauth-dialog">
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-card ring-1 ring-border">
        <h2 className="font-display text-xl tracking-[-0.02em]">Confirm it's you</h2>
        <p className="mt-2 text-sm text-muted">
          This stays valid for 10 minutes so you are not asked on every click.
        </p>
        {mode === "password" ? (
          <form onSubmit={onPassword} className="mt-4 space-y-3 ph-no-capture">
            <PasswordField
              label="Current password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <TurnstileField onToken={onToken} resetSignal={resetSignal} onRequired={onRequired} />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            {notice ? <p className="text-sm text-muted">{notice}</p> : null}
            <Button type="submit" className="w-full" disabled={busy || !password || (turnstileRequired && !token.trim())}>
              {busy ? "Checking…" : "Confirm password"}
            </Button>
          </form>
        ) : (
          <form onSubmit={onOtp} className="mt-4 space-y-3 ph-no-capture">
            <label className="block text-sm">
              Email code
              <input
                className="ke-input mt-1 tracking-[0.3em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
              />
            </label>
            <TurnstileField onToken={onToken} resetSignal={resetSignal} onRequired={onRequired} />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            {notice ? <p className="text-sm text-muted">{notice}</p> : null}
            <Button type="submit" className="w-full" disabled={busy || code.length !== 6 || (turnstileRequired && !token.trim())}>
              {busy ? "Checking…" : "Confirm code"}
            </Button>
          </form>
        )}
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <button
            type="button"
            className="min-h-11 font-medium text-primary underline-offset-4 hover:underline"
            disabled={busy}
            onClick={() => {
              if (mode === "otp") void onSendCode();
              else {
                setMode("otp");
                void onSendCode();
              }
            }}
          >
            {wait > 0 ? twoFactorResendWaitCopy(wait) : mode === "otp" ? "Send a new code" : "Use email code instead"}
          </button>
          {mode === "otp" ? (
            <button
              type="button"
              className="min-h-11 font-medium text-muted underline-offset-4 hover:underline"
              onClick={() => setMode("password")}
            >
              Use password
            </button>
          ) : null}
          <button type="button" className="min-h-11 text-muted underline-offset-4 hover:underline" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function useReauthPrompt() {
  const [open, setOpen] = useState(false);
  const [waiter, setWaiter] = useState<{ resolve: (ok: boolean) => void } | null>(null);

  function prompt(): Promise<boolean> {
    return new Promise((resolve) => {
      setWaiter({ resolve });
      setOpen(true);
    });
  }

  const dialog: ReactNode = (
    <ReauthDialog
      open={open}
      onClose={() => {
        setOpen(false);
        waiter?.resolve(false);
        setWaiter(null);
      }}
      onVerified={() => {
        setOpen(false);
        waiter?.resolve(true);
        setWaiter(null);
      }}
    />
  );

  return { prompt, dialog };
}
