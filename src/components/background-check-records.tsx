import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  BG_CHECK_KINDS,
  BG_ROLES,
  guideChrome,
  jurisdictionByCode,
  listJurisdictions,
  reminderLabel,
  type BgCheckKind,
  type BgRole,
  type ReminderStatus,
} from "@/lib/background-check-guide";
import { localePath } from "@/lib/locale-path";
import { START_DAYCARE_PTS } from "@/lib/start-daycare-hub";
import {
  loadBackgroundCheckDesk,
  saveBackgroundCheckRecord,
  saveBackgroundCheckSettings,
  type BackgroundCheckCentreView,
  type BackgroundCheckRecordView,
} from "@/lib/server/background-check-records";
import { useCopy } from "@/lib/use-copy";

const COPY = {
  en: {
    title: "Background check records",
    lead: "Record that someone at your centre saw the official result. KidEase does not run the check.",
    guide: "How to get the check",
    person: "Person’s name",
    role: "Role",
    kind: "Check",
    issued: "Issued on",
    expires: "Expiry, if the result shows one",
    reviewer: "Your name (you saw the official result)",
    saw: "I saw the official result. The licence holder still keeps that copy in the personnel file.",
    save: "Save the record",
    saved: "Saved. This is not a KidEase clearance.",
    uploadTitle: "Optional private copy",
    uploadBody:
      "A file here is only a convenience copy for your centre. It does not replace the official copy in the licence holder’s personnel file. Parents and the public cannot open it.",
    file: "PDF or image",
    attach: "Attach to the saved record",
    policy: "Your centre’s repeat schedule, in months",
    policyHelp: "This province does not set a fixed interval. Reminders use the number you enter, or the expiry you type.",
    attest: "Show a sentence on the public listing",
    attestHelp: "The sentence says your centre confirms the checks are on file. It does not say KidEase verified them.",
    expiryOpt: "Show due or expired to connected parents only",
    expiryHelp: "Off unless you turn this on. Other visitors do not see it.",
    settings: "Save these choices",
    empty: "No records yet.",
    sample: "Sample view. These names are not a real centre.",
    off: "Background-check records are off.",
  },
  fr: {
    title: "Dossiers de vérification",
    lead: "Notez qu’une personne de votre centre a vu le résultat officiel. KidEase ne fait pas la vérification.",
    guide: "Comment obtenir la vérification",
    person: "Nom de la personne",
    role: "Rôle",
    kind: "Vérification",
    issued: "Délivrée le",
    expires: "Échéance, si le résultat en montre une",
    reviewer: "Votre nom (vous avez vu le résultat officiel)",
    saw: "J’ai vu le résultat officiel. Le titulaire de permis garde quand même cette copie dans le dossier du personnel.",
    save: "Enregistrer",
    saved: "Enregistré. Ce n’est pas une autorisation de KidEase.",
    uploadTitle: "Copie privée facultative",
    uploadBody:
      "Un fichier ici est seulement une copie pratique pour votre centre. Il ne remplace pas la copie officielle dans le dossier du personnel du titulaire. Les parents et le public ne peuvent pas l’ouvrir.",
    file: "PDF ou image",
    attach: "Joindre au dossier enregistré",
    policy: "Calendrier de reprise de votre centre, en mois",
    policyHelp: "Cette province ne fixe pas d’intervalle. Les rappels utilisent le nombre que vous inscrivez, ou l’échéance que vous tapez.",
    attest: "Afficher une phrase sur la fiche publique",
    attestHelp: "La phrase dit que votre centre confirme que les vérifications sont au dossier. Elle ne dit pas que KidEase les a vérifiées.",
    expiryOpt: "Montrer « bientôt dû » ou « expiré » seulement aux parents déjà liés",
    expiryHelp: "Éteint, sauf si vous l’activez. Les autres visiteurs ne le voient pas.",
    settings: "Enregistrer ces choix",
    empty: "Aucun dossier pour l’instant.",
    sample: "Aperçu. Ces noms ne sont pas un vrai centre.",
    off: "Les dossiers de vérification sont éteints.",
  },
} as const;

function kindLabel(kind: BgCheckKind, locale: "en" | "fr"): string {
  for (const row of listJurisdictions()) {
    const match = row.checks.find((check) => check.kind === kind);
    if (match) return locale === "fr" ? match.titleFr : match.titleEn;
  }
  return kind;
}

export function BackgroundCheckRecordBoard({
  centre,
  locale,
  sample = false,
  recordsEnabled = true,
  onSave,
  onSettings,
  onUpload,
}: {
  centre: BackgroundCheckCentreView;
  locale: "en" | "fr";
  sample?: boolean;
  recordsEnabled?: boolean;
  onSave?: (input: {
    personName: string;
    role: BgRole;
    checkKind: BgCheckKind;
    issuedOn: string;
    expiresOn: string;
    reviewerName: string;
    sawOfficial: boolean;
  }) => Promise<string | null>;
  onSettings?: (input: { policyMonths: number | null; attest: boolean; showExpiry: boolean }) => Promise<void>;
  onUpload?: (recordId: string, file: File) => Promise<void>;
}) {
  const copy = COPY[locale];
  const roles = guideChrome(locale).roleLabels;
  const province = START_DAYCARE_PTS.find((row) => row.code === centre.province);
  const guideHref = localePath(`/background-checks/${centre.province.toLowerCase()}`, locale);
  const firstKind = jurisdictionByCode(centre.province)?.checks[0]?.kind ?? "crc_vsc";
  const [form, setForm] = useState({
    personName: "",
    role: "centre_staff" as BgRole,
    checkKind: firstKind,
    issuedOn: "",
    expiresOn: "",
    reviewerName: "",
    sawOfficial: false,
  });
  const [policy, setPolicy] = useState(centre.policyMonths ? String(centre.policyMonths) : "");
  const [attest, setAttest] = useState(centre.attest);
  const [showExpiry, setShowExpiry] = useState(centre.showExpiry);
  const [lastId, setLastId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="space-y-4 rounded-xl bg-surface p-5 ring-1 ring-border" data-ke="bg-check-records">
      <div>
        <h2 className="font-display text-2xl">{copy.title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted">{copy.lead}</p>
        <p className="mt-1 text-sm text-muted">{centre.name}</p>
        {sample ? <p className="mt-2 text-sm font-medium">{copy.sample}</p> : null}
        <p className="mt-2">
          <Link to={guideHref} className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">
            {copy.guide}
            {province ? ` · ${locale === "fr" ? province.nameFr : province.nameEn}` : ""}
          </Link>
        </p>
      </div>

      {recordsEnabled && centre.records.length === 0 ? <p className="text-sm text-muted">{copy.empty}</p> : null}
      {recordsEnabled && centre.records.length > 0 ? (
        <ul className="space-y-2">
          {centre.records.map((row) => (
            <RecordRow key={row.id} row={row} locale={locale} />
          ))}
        </ul>
      ) : null}

      {recordsEnabled && centre.canWrite && onSave ? (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            void onSave(form)
              .then((id) => {
                if (id) {
                  setLastId(id);
                  toast.success(copy.saved);
                  setForm((prev) => ({ ...prev, personName: "", issuedOn: "", expiresOn: "", sawOfficial: false }));
                }
              })
              .catch((err: unknown) => {
                const message = err instanceof Error ? err.message : copy.off;
                setError(message);
              });
          }}
        >
          <label className="block text-sm sm:col-span-2">
            {copy.person}
            <input
              className="ke-input mt-1 min-h-11 w-full"
              value={form.personName}
              onChange={(event) => setForm((prev) => ({ ...prev, personName: event.target.value }))}
              required
              autoComplete="name"
            />
          </label>
          <label className="block text-sm">
            {copy.role}
            <select
              className="ke-input mt-1 min-h-11 w-full"
              value={form.role}
              onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value as BgRole }))}
            >
              {BG_ROLES.map((role) => (
                <option key={role} value={role}>{roles[role]}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            {copy.kind}
            <select
              className="ke-input mt-1 min-h-11 w-full"
              value={form.checkKind}
              onChange={(event) => setForm((prev) => ({ ...prev, checkKind: event.target.value as BgCheckKind }))}
            >
              {BG_CHECK_KINDS.map((kind) => (
                <option key={kind} value={kind}>{kindLabel(kind, locale)}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            {copy.issued}
            <input
              className="ke-input mt-1 min-h-11 w-full"
              type="date"
              value={form.issuedOn}
              onChange={(event) => setForm((prev) => ({ ...prev, issuedOn: event.target.value }))}
            />
          </label>
          <label className="block text-sm">
            {copy.expires}
            <input
              className="ke-input mt-1 min-h-11 w-full"
              type="date"
              value={form.expiresOn}
              onChange={(event) => setForm((prev) => ({ ...prev, expiresOn: event.target.value }))}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            {copy.reviewer}
            <input
              className="ke-input mt-1 min-h-11 w-full"
              value={form.reviewerName}
              onChange={(event) => setForm((prev) => ({ ...prev, reviewerName: event.target.value }))}
              required
              autoComplete="name"
            />
          </label>
          <label className="flex min-h-11 items-start gap-2 text-sm sm:col-span-2">
            <input
              className="mt-1 size-4"
              type="checkbox"
              checked={form.sawOfficial}
              onChange={(event) => setForm((prev) => ({ ...prev, sawOfficial: event.target.checked }))}
              required
            />
            <span>{copy.saw}</span>
          </label>
          {error ? <p className="text-sm text-danger sm:col-span-2" role="alert">{error}</p> : null}
          <div>
            <Button type="submit">{copy.save}</Button>
          </div>
        </form>
      ) : null}

      {recordsEnabled && centre.canWrite && onUpload && lastId ? (
        <details className="rounded-lg bg-bg p-3 ring-1 ring-border">
          <summary className="min-h-11 cursor-pointer font-medium">{copy.uploadTitle}</summary>
          <p className="mt-2 text-sm leading-6 text-muted">{copy.uploadBody}</p>
          <form
            className="mt-3 flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const file = new FormData(event.currentTarget).get("file");
              if (!(file instanceof File) || !file.size) return;
              void onUpload(lastId, file).then(() => toast.success(copy.saved)).catch((err: unknown) => {
                setError(err instanceof Error ? err.message : copy.off);
              });
            }}
          >
            <label className="block text-sm">
              {copy.file}
              <input className="mt-1 block min-h-11" type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
            </label>
            <Button type="submit" variant="secondary">{copy.attach}</Button>
          </form>
        </details>
      ) : null}

      {centre.canWrite && onSettings && ((recordsEnabled && centre.policyAllowed) || centre.attestationOn) ? (
        <form
          className="space-y-3 border-t border-border pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            const months = policy.trim() ? Number(policy) : null;
            void onSettings({
              policyMonths: months && Number.isInteger(months) ? months : null,
              attest,
              showExpiry: attest && showExpiry,
            }).then(() => toast.success(copy.saved)).catch((err: unknown) => {
              setError(err instanceof Error ? err.message : copy.off);
            });
          }}
        >
          {centre.policyAllowed ? (
            <label className="block text-sm">
              {copy.policy}
              <input
                className="ke-input mt-1 min-h-11 w-full max-w-xs"
                inputMode="numeric"
                value={policy}
                onChange={(event) => setPolicy(event.target.value)}
              />
              <span className="mt-1 block text-muted">{copy.policyHelp}</span>
            </label>
          ) : null}
          {centre.attestationOn ? (
            <>
              <label className="flex min-h-11 items-start gap-2 text-sm">
                <input className="mt-1 size-4" type="checkbox" checked={attest} onChange={(event) => setAttest(event.target.checked)} />
                <span>
                  {copy.attest}
                  <span className="mt-1 block text-muted">{copy.attestHelp}</span>
                </span>
              </label>
              <label className="flex min-h-11 items-start gap-2 text-sm">
                <input
                  className="mt-1 size-4"
                  type="checkbox"
                  checked={showExpiry}
                  disabled={!attest}
                  onChange={(event) => setShowExpiry(event.target.checked)}
                />
                <span>
                  {copy.expiryOpt}
                  <span className="mt-1 block text-muted">{copy.expiryHelp}</span>
                </span>
              </label>
            </>
          ) : null}
          <Button type="submit" variant="secondary">{copy.settings}</Button>
        </form>
      ) : null}
    </section>
  );
}

function tone(status: ReminderStatus): string {
  if (status === "expired") return "bg-danger/10 text-danger";
  if (status === "due_soon") return "bg-warn/15 text-fg";
  if (status === "current") return "bg-ok/15 text-ok";
  return "bg-surface-2 text-muted";
}

function RecordRow({ row, locale }: { row: BackgroundCheckRecordView; locale: "en" | "fr" }) {
  const roles = guideChrome(locale).roleLabels;
  return (
    <li className="rounded-lg bg-bg p-3 ring-1 ring-border">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{row.personName}</p>
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tone(row.status)}`}>
          {reminderLabel(row.status, locale)}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        {roles[row.role]} · {kindLabel(row.checkKind, locale)}
      </p>
      <p className="text-sm text-muted">
        {row.issuedOn || "—"}
        {row.expiresOn ? ` → ${row.expiresOn}` : ""}
        {row.dueOn && row.dueOn !== row.expiresOn ? ` · ${row.dueOn}` : ""}
      </p>
      {row.reviewedName ? (
        <p className="text-sm text-muted">
          {row.reviewedName}
          {row.reviewedAt ? ` · ${row.reviewedAt.slice(0, 10)}` : ""}
        </p>
      ) : null}
    </li>
  );
}

export function BackgroundCheckDesk() {
  const { locale } = useCopy();
  const lang = locale === "fr" ? "fr" : "en";
  const [desk, setDesk] = useState<Awaited<ReturnType<typeof loadBackgroundCheckDesk>> | null>(null);
  const [daycareId, setDaycareId] = useState("");

  async function refresh() {
    const next = await loadBackgroundCheckDesk();
    setDesk(next);
    setDaycareId((current) => current || next.centres[0]?.daycareId || "");
  }

  useEffect(() => {
    void refresh().catch(() => setDesk({ enabled: false, guide: false, records: false, centres: [] }));
  }, []);

  if (!desk || (!desk.guide && !desk.records)) return null;
  const centre = desk.centres.find((item) => item.daycareId === daycareId) ?? desk.centres[0];
  if (!centre) {
    return desk.guide ? (
      <p className="text-sm">
        <Link to={localePath("/background-checks", lang)} className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">
          {COPY[lang].guide}
        </Link>
      </p>
    ) : null;
  }

  return (
    <div className="space-y-3">
      {desk.centres.length > 1 ? (
        <label className="block text-sm">
          <select
            className="ke-input min-h-11"
            value={centre.daycareId}
            onChange={(event) => setDaycareId(event.target.value)}
          >
            {desk.centres.map((item) => (
              <option key={item.daycareId} value={item.daycareId}>{item.name}</option>
            ))}
          </select>
        </label>
      ) : null}
      <BackgroundCheckRecordBoard
        centre={centre}
        locale={lang}
        recordsEnabled={desk.records}
        onSave={desk.records && centre.canWrite ? async (input) => {
          const saved = await saveBackgroundCheckRecord({ data: { daycareId: centre.daycareId, ...input } });
          await refresh();
          return saved.id;
        } : undefined}
        onSettings={centre.canWrite && (desk.records || centre.attestationOn) ? async (input) => {
          await saveBackgroundCheckSettings({ data: { daycareId: centre.daycareId, ...input } });
          await refresh();
        } : undefined}
        onUpload={desk.records && centre.canWrite ? async (recordId, file) => {
          const body = new FormData();
          body.set("recordId", recordId);
          body.set("file", file);
          const response = await fetch("/api/background-check-files", { method: "POST", body });
          if (!response.ok) {
            const payload = await response.json().catch(() => null) as { error?: string } | null;
            throw new Error(payload?.error || COPY[lang].off);
          }
          await refresh();
        } : undefined}
      />
    </div>
  );
}

