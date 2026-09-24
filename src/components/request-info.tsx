import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RequestSentDialog } from "@/components/request-sent-dialog";
import { useLiveSubmit } from "@/components/use-live-submit";
import { createInfoRequest } from "@/lib/server/lead-requests";
import { listingInfoSlaReady, normalizeInfoContact } from "@/lib/parent-listing";
import { holdSendBeat, requestSentThumb } from "@/lib/request-sent";
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
  const [formError, setFormError] = useState<string | null>(null);
  const sla = listingInfoSlaReady(daycare);
  const opened = useRef(false);
  const send = useLiveSubmit(open);

  useEffect(() => {
    if (!open) {
      opened.current = false;
      return;
    }
    const justOpened = !opened.current;
    opened.current = true;
    if (justOpened) {
      setDone(false);
      setFormError(null);
    }
    if (user?.primaryEmail) setEmail((cur) => cur || user.primaryEmail || "");
    if (user?.displayName) {
      const [first, ...rest] = user.displayName.trim().split(/\s+/);
      setFirstName((cur) => cur || first || "");
      if (rest.length) setLastName((cur) => cur || rest.join(" "));
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
  }, [open, onClose]);

  if (!open) return null;
  const name = locale === "fr" ? daycare.nameFr : daycare.name;

  if (done) {
    return (
      <RequestSentDialog
        kind="info"
        listingName={name}
        city={daycare.city}
        photo={requestSentThumb(daycare.photos)}
        canOpenMessages={Boolean(user)}
        onClose={() => {
          setDone(false);
          onClose();
        }}
        data-request-info-success=""
        data-ke="request-info-success"
      />
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const contact = normalizeInfoContact({ firstName, lastName, phone, email, message });
    if (!contact.ok) {
      toast.error(t("requestInfoNeedFields"));
      return;
    }
    const token = send.start();
    setBusy(true);
    setFormError(null);
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
      await holdSendBeat();
      if (!send.live(token)) return;
      setDone(true);
    } catch (err) {
      if (!send.live(token)) return;
      const message = err instanceof Error ? err.message : t("requestInfoNeedFields");
      setFormError(message);
      toast.error(message);
    } finally {
      if (send.live(token)) setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center md:items-center"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-fg/40"
        aria-label={t("cancel")}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl bg-surface shadow-card ring-1 ring-border md:rounded-xl"
      >
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
            <p className="mt-1 text-xs text-subtle">
              {sla ? t("requestInfoSla") : t("requestInfoSlaHonest")}
            </p>
            {formError ? (
              <p className="mt-3 text-sm text-danger" data-ke="request-info-error" role="alert">
                {formError}
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-border px-5 py-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={busy}
              aria-busy={busy || undefined}
              aria-label={busy ? t("requestSentSending") : undefined}
            >
              {busy ? "…" : t("requestInfoSend")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
