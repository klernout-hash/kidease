import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import { useCopy } from "@/lib/use-copy";
import { submitPublicMessage } from "@/lib/server/notify";
import { publicFormErrorMessage } from "@/lib/public-form-error";
import { SUPPORT_INBOX_EMAIL } from "@/lib/support";

type JobsInterestVariant = "caregiver" | "centre";

export function JobsInterestForm({ variant }: { variant: JobsInterestVariant }) {
  const { t } = useCopy();
  const centreMode = variant === "centre";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [role, setRole] = useState("");
  const [centre, setCentre] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { onToken, reset: resetTurnstile, takeChallenge, resetSignal, required: turnstileRequired, onRequired } =
    useTurnstileToken();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const challenge = takeChallenge();
    if (turnstileRequired && !challenge) {
      setFormError("Please complete the security check, then try again.");
      setSent(false);
      return;
    }
    setBusy(true);
    setFormError(null);
    setSent(false);
    const subject = centreMode ? t("addJobsAtKidEase") : t("findDaycareJobs");
    const lines = [
      centreMode ? `Centre: ${centre.trim()}` : null,
      `City: ${city.trim()}`,
      `Role: ${role.trim()}`,
      note.trim() || "No extra note.",
    ].filter(Boolean);
    try {
      await submitPublicMessage({
        data: {
          kind: "contact",
          name,
          email,
          subject,
          body: lines.join("\n"),
          centre: centreMode ? centre : undefined,
          city,
          turnstileToken: challenge,
        },
      });
      setSent(true);
      setNote("");
    } catch (err) {
      console.error("[kidease-jobs]", err);
      const message = publicFormErrorMessage(
        err,
        t("contactSendFailed").replace("{email}", SUPPORT_INBOX_EMAIL),
      );
      setFormError(message);
      toast.error(message);
      resetTurnstile();
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div
        className="mt-8 rounded-xl bg-ok/10 p-5 ring-1 ring-ok/30"
        data-ke="jobs-thanks"
        role="status"
      >
        <p className="text-base font-semibold">{centreMode ? t("jobsPostSent") : t("jobsSent")}</p>
        <p className="mt-2 text-sm text-muted">{t("contactResponse")}</p>
      </div>
    );
  }

  return (
    <form className="mt-8 space-y-3" onSubmit={send} data-ke={centreMode ? "jobs-post-form" : "jobs-form"}>
      <label className="block text-sm font-medium">
        {t("name")}
        <input
          required
          className="ke-input mt-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
      </label>
      <label className="block text-sm font-medium">
        {t("email")}
        <input
          required
          type="email"
          className="ke-input mt-1"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </label>
      {centreMode ? (
        <label className="block text-sm font-medium">
          {t("jobsPostCentre")}
          <input
            required
            className="ke-input mt-1"
            value={centre}
            onChange={(e) => setCentre(e.target.value)}
            autoComplete="organization"
          />
        </label>
      ) : null}
      <label className="block text-sm font-medium">
        {t("jobsCity")}
        <input
          required
          className="ke-input mt-1"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          autoComplete="address-level2"
        />
      </label>
      <label className="block text-sm font-medium">
        {centreMode ? t("jobsPostRole") : t("jobsRole")}
        <input
          required
          className="ke-input mt-1"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        />
      </label>
      <label className="block text-sm font-medium">
        {t("jobsNote")}
        <textarea
          rows={5}
          className="ke-textarea mt-1"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <TurnstileField onToken={onToken} resetSignal={resetSignal} onRequired={onRequired} />
      {formError ? (
        <p className="text-sm text-danger" data-ke="jobs-error" role="alert">
          {formError}
        </p>
      ) : null}
      <Button type="submit" className="w-full" size="lg" disabled={busy}>
        {centreMode ? t("jobsPostSubmit") : t("jobsSubmit")}
      </Button>
    </form>
  );
}
