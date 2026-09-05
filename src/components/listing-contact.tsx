import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { submitPublicMessage } from "@/lib/server/notify";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import { SUPPORT_INBOX_EMAIL } from "@/lib/support";

export function ListingContact({
  name,
  slug,
  city,
  className,
}: {
  name: string;
  slug: string;
  city?: string;
  className?: string;
}) {
  const { t } = useCopy();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", body: "" });
  const { token, onToken } = useTurnstileToken();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await submitPublicMessage({
        data: {
          kind: "contact",
          name: form.name,
          email: form.email,
          centre: name,
          city: city || "",
          subject: `Listing inquiry: ${name}`,
          body: `${form.body}\n\nListing: https://kidease.ca/daycare/${slug}`,
          turnstileToken: token,
        },
      });
      toast.success(t("listingContactSent"));
      setForm({ name: "", email: "", body: "" });
      setOpen(false);
    } catch {
      toast.error(`Could not send. Email ${SUPPORT_INBOX_EMAIL}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn("inline-flex items-center gap-1.5 font-sans text-sm font-medium text-primary", className)}
      >
        <span aria-hidden className="text-base leading-none">
          💬
        </span>
        {t("listingContact")}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-end bg-fg/40 p-0 sm:place-items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={send}
            className="w-full max-w-md space-y-3 rounded-t-2xl bg-surface p-5 shadow-lift ring-1 ring-border sm:rounded-2xl"
          >
            <p className="text-lg font-semibold">{t("listingContact")}</p>
            <p className="text-sm text-muted">{t("listingContactLead").replace("{name}", name)}</p>
            <label className="block text-sm font-medium">
              {t("name")}
              <input required className="ke-input mt-1" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
            </label>
            <label className="block text-sm font-medium">
              {t("email")}
              <input required type="email" className="ke-input mt-1" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} />
            </label>
            <label className="block text-sm font-medium">
              {t("messageLabel")}
              <textarea
                required
                rows={4}
                className="ke-textarea mt-1 min-h-[6.5rem]"
                value={form.body}
                onChange={(e) => setForm((s) => ({ ...s, body: e.target.value }))}
              />
            </label>
            <TurnstileField onToken={onToken} />
            <div className="flex gap-2 pt-1">
              <Button type="submit" className="flex-1" disabled={busy}>
                {t("submit")}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                {t("back")}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
