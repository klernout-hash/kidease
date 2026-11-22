import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { parentLoginSearch } from "@/lib/auth/parent-login";
import { PRIVACY_OFFICER_EMAIL } from "@/lib/account-export";
import { exportMyData } from "@/lib/server/account-export";
import { createPrivacyRequest, listPrivacyRequests, securityPageFlag } from "@/lib/server/privacy-request";
import { useCopy } from "@/lib/use-copy";

function saveText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

type QueueRow = {
  id: string;
  kind: string;
  note: string;
  createdAt: string;
  email: string | null;
  name: string | null;
  routedTo: string;
};

export function AccountExportPanel({ signedIn, isAdmin }: { signedIn: boolean; isAdmin: boolean }) {
  const { t, locale } = useCopy();
  const fr = locale === "fr";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [privacyOn, setPrivacyOn] = useState(false);
  const [kind, setKind] = useState<"access" | "correction" | "deletion">("access");
  const [note, setNote] = useState("");
  const [filing, setFiling] = useState(false);
  const [caseLine, setCaseLine] = useState("");
  const [queue, setQueue] = useState<QueueRow[] | null>(null);

  useEffect(() => {
    let live = true;
    void securityPageFlag()
      .then((flags) => {
        if (live) setPrivacyOn(flags.privacy);
      })
      .catch(() => {
        if (live) setPrivacyOn(false);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!signedIn || !isAdmin || !privacyOn) return;
    let live = true;
    void listPrivacyRequests()
      .then((result) => {
        if (!live) return;
        setQueue(result.ok ? result.requests : []);
      })
      .catch(() => {
        if (live) setQueue([]);
      });
    return () => {
      live = false;
    };
  }, [signedIn, isAdmin, privacyOn]);

  async function onDownload() {
    setBusy(true);
    setDownloadError("");
    setMessage("");
    try {
      const result = await exportMyData();
      if (!result.ok) {
        setDownloadError(result.error === "rate" ? t("accountExportRate") : t("accountExportError"));
        return;
      }
      saveText(result.filename, result.json, "application/json");
      const csvNames: Record<string, string> = {
        children: "kidease-children.csv",
        enrolments: "kidease-enrolments.csv",
        messages: "kidease-messages.csv",
        invoices: "kidease-invoices.csv",
        consents: "kidease-consents.csv",
      };
      for (const [key, filename] of Object.entries(csvNames)) {
        const csv = result.csv[key];
        if (csv) saveText(filename, csv, "text/csv");
      }
      setMessage(t("accountExportReady"));
    } catch {
      setDownloadError(t("accountExportError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 space-y-4" data-ke="account-export">
      <div className="rounded-xl bg-surface p-5 shadow-card ring-1 ring-border">
        <h2 className="font-display text-xl">{t("accountExport")}</h2>
        <p className="mt-2 text-sm text-muted">{t("accountExportLead")}</p>
        <p className="mt-2 text-sm text-muted">{t("accountExportNote")}</p>
        {signedIn ? (
          <>
            <Button type="button" className="mt-4 w-full" disabled={busy} onClick={() => void onDownload()}>
              {busy ? t("accountExportBusy") : t("accountExportButton")}
            </Button>
            {message ? <p className="mt-3 text-sm" role="status">{message}</p> : null}
            {downloadError ? (
              <p className="mt-3 text-sm text-danger" role="alert">
                {downloadError}
              </p>
            ) : null}
          </>
        ) : (
          <Button className="mt-4 w-full" asChild>
            <Link to={fr ? "/fr/login" : "/login"} search={parentLoginSearch(fr ? "/fr/account?section=export" : "/account?section=export")}>
              {t("accountSignInPhoto")}
            </Link>
          </Button>
        )}
      </div>

      <div className="rounded-xl bg-surface p-5 shadow-card ring-1 ring-border">
        <h2 className="font-display text-xl">{t("accountExportRequestTitle")}</h2>
        {privacyOn && signedIn ? (
          <form
            className="mt-3"
            onSubmit={(event) => {
              event.preventDefault();
              setFiling(true);
              setCaseLine("");
              setRequestError("");
              void createPrivacyRequest({ data: { kind, note } })
                .then((result) => {
                  if (!result.ok) {
                    setRequestError(result.error === "rate" ? t("accountExportRequestRate") : t("accountExportRequestFail"));
                    return;
                  }
                  setCaseLine(`${t("accountExportRequestOk")} ${result.contact}. ${result.caseId}`);
                  setNote("");
                })
                .catch(() => setRequestError(t("accountExportRequestFail")))
                .finally(() => setFiling(false));
            }}
          >
            <p className="text-sm text-muted">{t("accountExportPrivacyOn")}</p>
            <label className="mt-3 block text-sm font-medium" htmlFor="privacy-request-kind">
              {t("accountExportRequestType")}
              <select
                id="privacy-request-kind"
                className="ke-input mt-1 min-h-11 w-full"
                value={kind}
                onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
                onChange={(event) => setKind(event.target.value as typeof kind)}
              >
                <option value="access">{t("accountExportAccess")}</option>
                <option value="correction">{t("accountExportCorrection")}</option>
                <option value="deletion">{t("accountExportDeletion")}</option>
              </select>
            </label>
            <label className="mt-3 block text-sm font-medium" htmlFor="privacy-request-note">
              {t("accountExportNoteLabel")}
              <textarea
                id="privacy-request-note"
                className="ke-textarea mt-1 min-h-24 w-full"
                value={note}
                maxLength={500}
                onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <Button type="submit" variant="secondary" className="mt-3 w-full" disabled={filing}>
              {filing ? t("accountExportBusy") : t("accountExportRequestButton")}
            </Button>
            {caseLine ? (
              <p className="mt-3 text-sm" role="status" data-ke="privacy-case">
                {caseLine}
              </p>
            ) : null}
            {requestError ? (
              <p className="mt-3 text-sm text-danger" role="alert">
                {requestError}
              </p>
            ) : null}
          </form>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {privacyOn ? t("accountExportPrivacySignIn") : t("accountExportPrivacyOff")}{" "}
            <a className="inline-flex min-h-11 items-center underline-offset-4 hover:underline" href={`mailto:${PRIVACY_OFFICER_EMAIL}`}>
              {PRIVACY_OFFICER_EMAIL}
            </a>
          </p>
        )}
      </div>

      {isAdmin && privacyOn ? (
        <div className="rounded-xl bg-surface p-5 shadow-card ring-1 ring-border" data-ke="privacy-queue">
          <h2 className="font-display text-xl">{t("accountExportQueueTitle")}</h2>
          <p className="mt-2 text-sm text-muted">{t("accountExportQueueLead")}</p>
          {queue == null ? <p className="mt-3 text-sm text-muted">{t("accountExportBusy")}</p> : null}
          {queue && queue.length === 0 ? <p className="mt-3 text-sm">{t("accountExportQueueEmpty")}</p> : null}
          {queue && queue.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {queue.map((row) => (
                <li key={row.id} className="border-b border-border pb-3 text-sm">
                  <p className="font-medium">{row.kind}</p>
                  <p>{row.name || row.email || row.id}</p>
                  {row.email ? <p className="text-muted">{row.email}</p> : null}
                  <p className="text-muted">{row.routedTo}</p>
                  {row.note ? <p className="mt-1">{row.note}</p> : null}
                  <p className="text-muted">{row.createdAt}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
