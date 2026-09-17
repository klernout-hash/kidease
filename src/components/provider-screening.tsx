import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  addScreeningPerson,
  generateScreeningLetter,
  listProviderScreening,
  type ScreeningCentreView,
  type ScreeningDocView,
  type ScreeningPersonView,
} from "@/lib/server/provider-screening";
import { docKindLabel, type ScreeningDocStatus } from "@/lib/provider-screening";
import { isPrivateDocTooBig } from "@/lib/upload-limits";
import { UploadLimitHint } from "@/components/upload-limit-hint";
import {
  openPrivateDocHref,
  postPrivateDocForm,
  SCREENING_DOC_API,
  screeningDocHref,
} from "@/lib/private-docs";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";

const STATUS_COPY: Record<ScreeningDocStatus, CopyKey> = {
  missing: "screeningStatusMissing",
  letter_ready: "screeningStatusLetter",
  uploaded: "screeningStatusUploaded",
  admin_review: "screeningStatusReview",
  cleared: "screeningStatusCleared",
  rejected: "screeningStatusRejected",
  expired: "screeningStatusExpired",
};

const STATUS_TONE: Record<ScreeningDocStatus, string> = {
  missing: "bg-surface-2 text-muted",
  letter_ready: "bg-surface-2 text-fg",
  uploaded: "bg-warn/15 text-fg",
  admin_review: "bg-warn/15 text-fg",
  cleared: "bg-ok/15 text-ok",
  rejected: "bg-danger/10 text-danger",
  expired: "bg-danger/10 text-danger",
};

const ROLE_COPY: Record<string, CopyKey> = {
  owner: "screeningRoleOwner",
  director: "screeningRoleDirector",
  staff: "screeningRoleStaff",
  volunteer: "screeningRoleVolunteer",
  home_resident: "screeningRoleResident",
};

function readScreeningFile(file: File | undefined, onReady: (file: File) => void, onBad: () => void) {
  if (!file) return;
  if (isPrivateDocTooBig(file.size)) {
    onBad();
    return;
  }
  onReady(file);
}

function StatusPill({ status }: { status: ScreeningDocStatus }) {
  const { t } = useCopy();
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_TONE[status]}`}>
      {t(STATUS_COPY[status])}
    </span>
  );
}

function DocRow({
  centre,
  person,
  doc,
  locale,
  busy,
  onLetter,
  onUpload,
}: {
  centre: ScreeningCentreView;
  person: ScreeningPersonView;
  doc: ScreeningDocView;
  locale: "en" | "fr";
  busy: boolean;
  onLetter: () => void;
  onUpload: (file: File, issuedOn: string, expiresOn: string) => void;
}) {
  const { t } = useCopy();
  const [issuedOn, setIssuedOn] = useState(doc.issuedOn ?? "");
  const [expiresOn, setExpiresOn] = useState(doc.expiresOn ?? "");
  const [fileError, setFileError] = useState<string | null>(null);
  return (
    <li className="rounded-lg bg-bg p-3 ring-1 ring-border">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{docKindLabel(doc.kind, locale)}</p>
          <p className="mt-1 text-xs leading-5 text-muted">{doc.notes}</p>
        </div>
        <StatusPill status={doc.status} />
      </div>
      {doc.reviewerNotes ? <p className="mt-2 text-xs text-danger">{doc.reviewerNotes}</p> : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-muted">
          {t("screeningIssued")}
          <input
            type="date"
            className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg"
            value={issuedOn}
            onChange={(e) => setIssuedOn(e.target.value)}
          />
        </label>
        <label className="text-xs text-muted">
          {t("screeningExpires")}
          <input
            type="date"
            className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {doc.kind === "vsc" ? (
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onLetter}>
            {t("screeningGenerateLetter")}
          </Button>
        ) : null}
        {doc.hasFile && doc.id ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => openPrivateDocHref(screeningDocHref(doc.id as string))}
          >
            {t("screeningViewFile")}
            {doc.filename ? ` · ${doc.filename}` : ""}
          </Button>
        ) : null}
        <label className="inline-flex h-11 min-h-11 cursor-pointer items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-fg">
          {t("screeningUpload")}
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (isPrivateDocTooBig(file.size)) {
                const message = t("uploadDocTooBig");
                setFileError(message);
                toast.error(message);
                e.target.value = "";
                return;
              }
              setFileError(null);
              onUpload(file, issuedOn, expiresOn);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <UploadLimitHint hint={t("uploadDocHint")} error={fileError} />
    </li>
  );
}

export function ProviderScreeningPanel() {
  const { t, locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const [centres, setCentres] = useState<ScreeningCentreView[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ daycareId: "", name: "", role: "volunteer" });

  async function load() {
    const next = await listProviderScreening();
    setCentres(next.centres);
    setCanManage(next.canManage);
    setForm((prev) => ({
      ...prev,
      daycareId: prev.daycareId || next.centres[0]?.daycareId || "",
    }));
  }

  useEffect(() => {
    void load().catch(() => undefined);
  }, []);

  async function onLetter(centre: ScreeningCentreView, person: ScreeningPersonView) {
    setBusy(true);
    try {
      const result = await generateScreeningLetter({
        data: { daycareId: centre.daycareId, personId: person.id, kind: "vsc", locale: loc },
      });
      const blob = new Blob([result.html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      toast.success(t("screeningStatusLetter"));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("screeningGenerateLetter"));
    } finally {
      setBusy(false);
    }
  }

  function onUpload(
    centre: ScreeningCentreView,
    person: ScreeningPersonView,
    doc: ScreeningDocView,
    file: File,
    issuedOn: string,
    expiresOn: string,
  ) {
    readScreeningFile(
      file,
      (next) => {
        setBusy(true);
        void postPrivateDocForm(
          SCREENING_DOC_API,
          {
            daycareId: centre.daycareId,
            personId: person.id,
            kind: doc.kind,
            issuedOn,
            expiresOn,
          },
          next,
        )
          .then(() => {
            toast.success(t("screeningStatusReview"));
            return load();
          })
          .catch((err) => toast.error(err instanceof Error ? err.message : t("uploadDocTooBig")))
          .finally(() => setBusy(false));
      },
      () => toast.error(t("uploadDocTooBig")),
    );
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setBusy(true);
    try {
      await addScreeningPerson({
        data: { daycareId: form.daycareId, name: form.name, role: form.role },
      });
      toast.success(t("screeningAddPerson"));
      setForm((prev) => ({ ...prev, name: "" }));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("screeningAddPerson"));
    } finally {
      setBusy(false);
    }
  }

  if (!centres.length) {
    return (
      <p id="listing-coach-screening" className="rounded-xl bg-surface px-5 py-8 text-sm text-muted ring-1 ring-border">
        {t("screeningNoPeople")}
      </p>
    );
  }

  return (
    <div id="listing-coach-screening" className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">{t("screeningDesk")}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{t("screeningLead")}</p>
      </div>
      {centres.map((centre) => (
        <section key={centre.daycareId} className="rounded-xl bg-surface p-4 ring-1 ring-border sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-display text-xl">{centre.daycareName}</h3>
              <p className="mt-1 text-xs text-muted">
                {centre.province}
                {centre.packStatus === "stub" ? ` · ${t("screeningPackStub")}` : ""}
              </p>
            </div>
            {centre.screeningOnFile ? (
              <span className="rounded-full bg-ok/15 px-2.5 py-1 text-xs font-medium text-ok">{t("trustScreeningOnFile")}</span>
            ) : null}
          </div>
          {centre.people.length === 0 ? (
            <p className="mt-4 text-sm text-muted">{t("screeningNoPeople")}</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {centre.people.map((person) => (
                <li key={person.id}>
                  <p className="text-sm font-semibold">
                    {person.name}
                    <span className="ml-2 text-xs font-normal text-muted">{t(ROLE_COPY[person.role] || "screeningRoleStaff")}</span>
                  </p>
                  <ul className="mt-2 space-y-2">
                    {person.docs.map((doc) => (
                      <DocRow
                        key={`${person.id}-${doc.kind}`}
                        centre={centre}
                        person={person}
                        doc={doc}
                        locale={loc}
                        busy={busy}
                        onLetter={() => void onLetter(centre, person)}
                        onUpload={(file, issuedOn, expiresOn) =>
                          onUpload(centre, person, doc, file, issuedOn, expiresOn)
                        }
                      />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {canManage ? (
        <form className="rounded-xl bg-surface p-4 ring-1 ring-border sm:p-5" onSubmit={(e) => void onAdd(e)}>
          <h3 className="font-medium">{t("screeningAddPerson")}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              {t("screeningAddName")}
              <input
                className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              {t("screeningAddRole")}
              <select
                className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
                value={form.role}
                onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
              >
                <option value="volunteer">{t("screeningVolunteer")}</option>
                <option value="home_resident">{t("screeningHomeResident")}</option>
              </select>
            </label>
            {centres.length > 1 ? (
              <label className="text-sm">
                Centre
                <select
                  className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
                  value={form.daycareId}
                  onChange={(e) => setForm((prev) => ({ ...prev, daycareId: e.target.value }))}
                >
                  {centres.map((c) => (
                    <option key={c.daycareId} value={c.daycareId}>
                      {c.daycareName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <Button type="submit" size="sm" className="mt-3" disabled={busy}>
            {t("screeningAddPerson")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
