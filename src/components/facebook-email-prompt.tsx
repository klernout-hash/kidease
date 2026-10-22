import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isFacebookPlaceholderEmail } from "@/lib/auth/facebook-address";
import { presentAuthCopy } from "@/lib/auth/present-auth-copy";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { saveFacebookContactEmail } from "@/lib/server/facebook-email";
import { useCopy } from "@/lib/use-copy";

const PENDING_KEY = "ke-facebook-email-pending";

/** Ask for a real email when Facebook did not share one. */
export function FacebookEmailPrompt() {
  const { user } = useCurrentUserState();
  const { t, locale } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const placeholder = isFacebookPlaceholderEmail(user?.primaryEmail);
  const confirmed = user?.emailVerified === true;

  useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    if (confirmed) {
      sessionStorage.removeItem(PENDING_KEY);
      setPending(false);
      return;
    }
    if (sessionStorage.getItem(PENDING_KEY) === "1") setPending(true);
  }, [confirmed, user?.id]);

  if (!user || user.isDevFallback) return null;
  if (pathname === "/login" || pathname === "/fr/login") return null;
  if (!placeholder && !(pending && !confirmed)) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await saveFacebookContactEmail({ data: { email: placeholder ? email : user?.primaryEmail || email } });
      if (typeof sessionStorage !== "undefined") sessionStorage.setItem(PENDING_KEY, "1");
      setPending(true);
      toast.message(saved.sent ? t("facebookEmailSaved") : t("facebookEmailPending"));
    } catch (err) {
      const message = err instanceof Error ? err.message : t("facebookEmailRequired");
      setError(presentAuthCopy(locale, message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-border bg-surface px-4 py-3" data-ke="facebook-email">
      <form onSubmit={(event) => void submit(event)} className="mx-auto w-full max-w-xl">
        <h2 className="font-display text-lg">{t("facebookEmailTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{pending && !placeholder ? t("facebookEmailPending") : t("facebookEmailLead")}</p>
        {placeholder ? (
          <label className="mt-3 block text-sm">
            {t("facebookEmailLabel")}
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="ke-input mt-1 w-full"
            />
          </label>
        ) : null}
        {error ? (
          <p className="mt-2 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="mt-3 min-h-11" disabled={busy}>
          {busy ? t("openingDesk") : pending && !placeholder ? t("facebookEmailResend") : t("facebookEmailSend")}
        </Button>
      </form>
    </div>
  );
}
