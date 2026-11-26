import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  downloadInAppAgreement,
  openInAppAgreement,
  signInAppAgreement,
} from "@/lib/server/agreement-sign";
import { pipelineCopy } from "@/lib/pipeline-copy";
import { useCopy } from "@/lib/use-copy";

type Opened = Awaited<ReturnType<typeof openInAppAgreement>>;

/** Keep the file long enough for iPhone Safari to save it. */
function saveHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function InAppAgreementDownload({ agreementId }: { agreementId: string }) {
  const { locale } = useCopy();
  const pc = pipelineCopy(locale);
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={busy}
      data-ke="in-app-agreement-download"
      onClick={() => {
        setBusy(true);
        void downloadInAppAgreement({ data: { agreementId } })
          .then((file) => saveHtml(file.html, file.filename))
          .catch(() => toast.error(pc.error))
          .finally(() => setBusy(false));
      }}
    >
      {pc.agreementDownload}
    </Button>
  );
}

/** Review and sign inside KidEase. Parent signs first; the centre signs second. */
export function InAppAgreementSigner({
  agreementId,
  label,
  onSigned,
}: {
  agreementId: string;
  label: string;
  onSigned: () => void;
}) {
  const { locale } = useCopy();
  const pc = pipelineCopy(locale);
  const [doc, setDoc] = useState<Opened | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function show() {
    setOpen(true);
    setError("");
    if (doc) return;
    void openInAppAgreement({ data: { agreementId } })
      .then(setDoc)
      .catch(() => setError(pc.error));
  }

  function sign() {
    setBusy(true);
    setError("");
    void signInAppAgreement({ data: { agreementId, typedName: name, agreed } })
      .then((result) => {
        if (!result.ok) {
          setError(
            result.error === "agree"
              ? pc.agreementAgreeError
              : result.error === "name"
                ? pc.agreementNameError
                : pc.error,
          );
          return;
        }
        toast.success(result.status === "completed" ? pc.agreementCompleted : pc.agreementSigned);
        setOpen(false);
        onSigned();
      })
      .catch(() => setError(pc.error))
      .finally(() => setBusy(false));
  }

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={show} data-ke="in-app-agreement-open">
        {label}
      </Button>
    );
  }

  return (
    <section
      className="mt-3 rounded-xl bg-surface p-4 ring-1 ring-border"
      data-ke="in-app-agreement"
      aria-labelledby={`agreement-${agreementId}`}
    >
      <h4 id={`agreement-${agreementId}`} className="text-base font-semibold">
        {pc.agreementSignTitle}
      </h4>
      <p className="mt-1 text-sm text-muted">{pc.agreementSignLead}</p>
      {doc ? (
        <iframe
          title={pc.agreementSignTitle}
          sandbox=""
          srcDoc={doc.bodyHtml}
          className="mt-3 h-[60dvh] w-full rounded-lg bg-white ring-1 ring-border"
        />
      ) : (
        <p className="mt-3 text-sm text-muted" role="status">
          {pc.agreementLoading}
        </p>
      )}
      <form
        className="mt-3 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          sign();
        }}
      >
        <label className="block text-sm" htmlFor={`agreement-name-${agreementId}`}>
          {pc.agreementTypedName}
          <input
            id={`agreement-name-${agreementId}`}
            className="ke-input mt-1 min-h-11 w-full"
            value={name}
            autoComplete="name"
            placeholder={doc?.role === "parent" ? doc.expectedName : undefined}
            onChange={(event) => setName(event.target.value)}
            onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
          />
        </label>
        <label className="flex min-h-11 items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
          />
          <span>{pc.agreementAgree}</span>
        </label>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || !doc}>
            {doc?.role === "centre" ? pc.agreementCountersign : pc.agreementSign}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            {pc.close}
          </Button>
        </div>
      </form>
    </section>
  );
}
