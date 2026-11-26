import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  downloadEceCertFile,
  listCentreEceCerts,
  listMyEceCerts,
  saveCentreEceCert,
  saveMyEceCert,
  uploadEceCertFile,
} from "@/lib/server/staff-certs";
import { staffCertCopy, type CertStatus } from "@/lib/staff-certs";
import { useCopy } from "@/lib/use-copy";

type Cert = {
  id: string;
  staffName: string;
  level: string;
  certificateNumber: string;
  expiresOn: string;
  status: CertStatus;
  hasFile: boolean;
  fileName: string | null;
  centre?: string;
};

type Copy = ReturnType<typeof staffCertCopy>;

const MAX_BYTES = 4 * 1024 * 1024;

function readFile(
  file: File | null | undefined,
): Promise<{ dataUrl: string; filename: string } | undefined> {
  if (!file) return Promise.resolve(undefined);
  if (file.size > MAX_BYTES) return Promise.reject(new Error("Upload a PDF or image under 4 MB."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: String(reader.result || ""), filename: file.name });
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

function errorText(err: unknown, copy: Copy) {
  return err instanceof Error && err.message ? err.message : copy.error;
}

function StatusChip({ status, copy }: { status: CertStatus; copy: Copy }) {
  const label =
    status === "expired"
      ? copy.statusExpired
      : status === "due"
        ? copy.statusDue
        : status === "ok"
          ? copy.statusOk
          : copy.statusUnknown;
  const tone =
    status === "expired"
      ? "bg-danger/10 text-danger"
      : status === "due"
        ? "bg-warning/15 text-fg"
        : "bg-surface-2 text-muted";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
      data-ke={`cert-${status}`}
    >
      {label}
    </span>
  );
}

function CertList({
  certs,
  copy,
  onChanged,
}: {
  certs: Cert[];
  copy: Copy;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState("");
  async function onDownload(cert: Cert) {
    setBusy(cert.id);
    try {
      const file = await downloadEceCertFile({ data: { certId: cert.id } });
      const a = document.createElement("a");
      a.href = file.dataUrl;
      a.download = file.filename || "certificate";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      toast.error(errorText(err, copy));
    } finally {
      setBusy("");
    }
  }
  async function onUpload(cert: Cert, file: File | undefined) {
    setBusy(cert.id);
    try {
      const read = await readFile(file);
      if (!read) return;
      await uploadEceCertFile({ data: { certId: cert.id, ...read } });
      toast.success(copy.uploaded);
      onChanged();
    } catch (err) {
      toast.error(errorText(err, copy));
    } finally {
      setBusy("");
    }
  }
  if (!certs.length) return <p className="mt-3 text-sm text-muted">{copy.none}</p>;
  return (
    <ul className="mt-3 space-y-2">
      {certs.map((cert) => (
        <li
          key={cert.id}
          className="rounded-lg bg-bg p-3 ring-1 ring-border"
          data-ke="ece-cert-row"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{cert.staffName}</span>
            <StatusChip status={cert.status} copy={copy} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {[
              cert.centre,
              cert.level,
              cert.certificateNumber,
              copy.expiresOn.replace("{day}", cert.expiresOn),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {cert.hasFile ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy === cert.id}
                onClick={() => void onDownload(cert)}
              >
                {copy.download}
              </Button>
            ) : (
              <span className="text-xs text-muted">{copy.noFile}</span>
            )}
            <label className="inline-flex min-h-9 cursor-pointer items-center rounded-full px-3 text-sm font-medium text-primary ring-1 ring-border">
              {copy.upload}
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={busy === cert.id}
                onChange={(e) => void onUpload(cert, e.target.files?.[0])}
              />
            </label>
          </div>
        </li>
      ))}
    </ul>
  );
}

function CertFields({
  form,
  setForm,
  copy,
}: {
  form: { level: string; certificateNumber: string; expiresOn: string };
  setForm: (next: { level: string; certificateNumber: string; expiresOn: string }) => void;
  copy: Copy;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="block text-sm">
        {copy.level}
        <input
          className="ke-input mt-1 min-h-11 w-full"
          value={form.level}
          onChange={(e) => setForm({ ...form, level: e.target.value })}
        />
      </label>
      <label className="block text-sm">
        {copy.number}
        <input
          className="ke-input mt-1 min-h-11 w-full"
          value={form.certificateNumber}
          onChange={(e) => setForm({ ...form, certificateNumber: e.target.value })}
          autoComplete="off"
        />
      </label>
      <label className="block text-sm">
        {copy.expires}
        <input
          type="date"
          className="ke-input mt-1 min-h-11 w-full"
          value={form.expiresOn}
          onChange={(e) => setForm({ ...form, expiresOn: e.target.value })}
          required
        />
      </label>
    </div>
  );
}

const EMPTY = { level: "", certificateNumber: "", expiresOn: "" };

/** Owner view: every staff member's certificate for one centre. */
export function CentreEceCerts() {
  const { locale } = useCopy();
  const copy = staffCertCopy(locale);
  const [state, setState] = useState<Awaited<ReturnType<typeof listCentreEceCerts>> | null>(null);
  const [daycareId, setDaycareId] = useState("");
  const [staffUserId, setStaffUserId] = useState("");
  const [staffName, setStaffName] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback((id: string) => {
    void listCentreEceCerts({ data: { daycareId: id } })
      .then((next) => {
        setState(next);
        setDaycareId(next.daycareId);
      })
      .catch(() => setState(null));
  }, []);
  useEffect(() => load(""), [load]);

  if (!state || !state.centres.length) return null;

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!staffUserId && staffName.trim().length < 2) {
      toast.error(copy.badName);
      return;
    }
    setBusy(true);
    try {
      const read = await readFile(file);
      await saveCentreEceCert({ data: { daycareId, staffUserId, staffName, ...form, file: read } });
      toast.success(copy.saved);
      setForm(EMPTY);
      setStaffUserId("");
      setStaffName("");
      setFile(null);
      load(daycareId);
    } catch (err) {
      toast.error(errorText(err, copy));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="rounded-xl bg-surface px-5 py-6 ring-1 ring-border"
      data-ke="centre-ece-certs"
    >
      <h2 className="font-display text-xl">{copy.ownerTitle}</h2>
      <p className="mt-1 text-sm text-muted">{copy.ownerLead}</p>
      {state.centres.length > 1 ? (
        <label className="mt-3 block text-sm">
          {copy.centre}
          <select
            className="ke-input mt-1 min-h-11 w-full"
            value={daycareId}
            onChange={(e) => load(e.target.value)}
          >
            {state.centres.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <CertList certs={state.certs} copy={copy} onChanged={() => load(daycareId)} />
      {state.canWrite ? (
        <form className="mt-4 space-y-3" onSubmit={(e) => void onSave(e)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              {copy.staff}
              <select
                className="ke-input mt-1 min-h-11 w-full"
                value={staffUserId}
                onChange={(e) => setStaffUserId(e.target.value)}
              >
                <option value="">{copy.staffPick}</option>
                {state.members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name || m.userId}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              {copy.staffNameOther}
              <input
                className="ke-input mt-1 min-h-11 w-full"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
              />
            </label>
          </div>
          <CertFields form={form} setForm={setForm} copy={copy} />
          <label className="block text-sm">
            {copy.file}
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="mt-1 block text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <Button type="submit" variant="secondary" disabled={busy}>
            {copy.save}
          </Button>
        </form>
      ) : null}
    </section>
  );
}

/** Staff self-view: my own certificates, add one, upload the file. */
export function MyEceCerts() {
  const { locale } = useCopy();
  const copy = staffCertCopy(locale);
  const [state, setState] = useState<Awaited<ReturnType<typeof listMyEceCerts>> | null>(null);
  const [daycareId, setDaycareId] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void listMyEceCerts()
      .then((next) => {
        setState(next);
        setDaycareId((current) => current || next.centres[0]?.id || "");
      })
      .catch(() => setState(null));
  }, []);
  useEffect(() => load(), [load]);

  if (!state) return null;

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const read = await readFile(file);
      await saveMyEceCert({ data: { daycareId, ...form, file: read } });
      toast.success(copy.saved);
      setForm(EMPTY);
      setFile(null);
      load();
    } catch (err) {
      toast.error(errorText(err, copy));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="mt-4 rounded-xl bg-surface px-5 py-6 ring-1 ring-border"
      data-ke="my-ece-certs"
    >
      <h2 className="font-display text-xl">{copy.mineTitle}</h2>
      <p className="mt-1 text-sm text-muted">{copy.mineLead}</p>
      <CertList certs={state.certs} copy={copy} onChanged={load} />
      {state.centres.length ? (
        <form className="mt-4 space-y-3" onSubmit={(e) => void onSave(e)}>
          {state.centres.length > 1 ? (
            <label className="block text-sm">
              {copy.centre}
              <select
                className="ke-input mt-1 min-h-11 w-full"
                value={daycareId}
                onChange={(e) => setDaycareId(e.target.value)}
              >
                {state.centres.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <CertFields form={form} setForm={setForm} copy={copy} />
          <label className="block text-sm">
            {copy.file}
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="mt-1 block text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <Button type="submit" variant="secondary" disabled={busy}>
            {copy.save}
          </Button>
        </form>
      ) : (
        <p className="mt-3 text-sm text-muted">{copy.noCentre}</p>
      )}
    </section>
  );
}
