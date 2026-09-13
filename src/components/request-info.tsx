import { useEffect, useId, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createInfoRequest } from "@/lib/server/lead-requests";
import { listingInfoSlaReady, normalizeInfoContact } from "@/lib/parent-listing";
import { capturePostHogEvent } from "@/lib/posthog";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCopy } from "@/lib/use-copy";
import type { Daycare } from "@/lib/types";

type Props = {
  daycare: Daycare;
  open: boolean;
  onClose: () => void;
};

export function RequestInfoSheet({ daycare, open, onClose }: Props) {
  const { t, locale } = useCopy();
  const { user } = useCurrentUserState();
  const titleId = useId();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const sla = listingInfoSlaReady(daycare);

  useEffect(() => {
    if (!open) return;
    setDone(false);
    if (user?.primaryEmail) setEmail(user.primaryEmail);
    if (user?.displayName) {
      const [first, ...rest] = user.displayName.trim().split(/\s+/);
      setFirstName(first || "");
      if (rest.length) setLastName(rest.join(" "));
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, user]);

  if (!open) return null;
  const name = locale === "fr" ? daycare.nameFr : daycare.name;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const contact = normalizeInfoContact({ firstName, lastName, phone, email, message });
    if (!contact.ok) {
      toast.error(t("requestInfoNeedFields"));
      return;
    }
    setBusy(true);
    try {
      await createInfoRequest({
        data: {
          daycareId: daycare.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          phone: contact.phone,
          email: contact.email,
          message: contact.message ?? undefined,
          userId: user?.id,
        },
      });
      capturePostHogEvent("listing_request_submitted", { intent: "info" });
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("requestInfoNeedFields"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="presentation">
      <button type="button" className="absolute inset-0 bg-fg/40" aria-label={t("cancel")} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl bg-surface shadow-card ring-1 ring-border md:rounded-xl"
      >
        {done ? (
          <div className="flex flex-col items-center px-6 py-10 text-center" data-request-info-success>
            <span className="grid size-14 place-items-center rounded-full bg-ok text-primary-fg">
              <Check className="size-7" strokeWidth={2.5} />
            </span>
            <h2 id={titleId} className="mt-5 font-display text-2xl">
              {t("requestInfoSuccess")}
            </h2>
            <p className="mt-2 max-w-sm text-sm text-muted">{t("requestInfoSuccessLead")}</p>
            <Button className="mt-6 w-full" onClick={onClose}>
              {t("close")}
            </Button>
          </div>
        ) : (
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => void submit(e)}>
            <div className="overflow-y-auto px-5 py-5">
              <h2 id={titleId} className="font-display text-2xl">
                {t("requestInfoTitle")}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {t("requestInfoLead")} {name}.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  {t("requestInfoFirst")}
                  <input
                    required
                    className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                  />
                </label>
                <label className="text-sm">
                  {t("requestInfoLast")}
                  <input
                    required
                    className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                  />
                </label>
                <label className="text-sm">
                  {t("requestInfoPhone")}
                  <input
                    required
                    type="tel"
                    className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                  />
                </label>
                <label className="text-sm">
                  {t("requestInfoEmail")}
                  <input
                    required
                    type="email"
                    className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </label>
              </div>
              <label className="mt-3 block text-sm">
                {t("requestInfoMessage")}
                <textarea
                  className="mt-1 min-h-24 w-full rounded-md border border-border bg-bg px-3 py-2"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </label>
              <p className="mt-3 text-xs text-muted">{t("requestInfoPrivacy")}</p>
              <p className="mt-1 text-xs text-subtle">{sla ? t("requestInfoSla") : t("requestInfoSlaHonest")}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-border px-5 py-3">
              <Button type="button" variant="secondary" onClick={onClose}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={busy}>
                {t("requestInfoSend")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
