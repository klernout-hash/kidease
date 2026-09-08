import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { signedPdfPath, type DocusignTemplateOption } from "@/lib/docusign-packs";
import { ds } from "@/lib/docusign-copy";
import type { DocusignConnectIssue } from "@/lib/docusign-errors";
import { useCopy } from "@/lib/use-copy";
import type { Locale } from "@/lib/types";
import {
  sendCentreContract,
  syncCentreContract,
  voidCentreContract,
  type AdminContractRow,
  type AdminPackRow,
} from "@/lib/server/contracts";

export function AdminContractsPanel({
  rows,
  mode,
  templates = [],
  defaultTemplateIds = { provider_agreement: null, enrolment_pack: null },
  docusignError = null,
  busy,
  setBusy,
  onRefresh,
}: {
  rows: AdminContractRow[];
  mode: "live" | "demo";
  templates?: DocusignTemplateOption[];
  defaultTemplateIds?: { provider_agreement: string | null; enrolment_pack: string | null };
  docusignError?: DocusignConnectIssue | null;
  busy: string | null;
  setBusy: (v: string | null) => void;
  onRefresh: () => Promise<void>;
}) {
  const { locale } = useCopy();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"need" | "out" | "signed" | "all">("need");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      const statuses = r.packs.map((p) => p.status);
      if (filter === "need" && !statuses.some((s) => s === "none" || s === "draft" || s === "declined" || s === "voided")) {
        return false;
      }
      if (filter === "out" && !statuses.some((s) => s === "sent" || s === "viewed")) return false;
      if (filter === "signed" && !statuses.some((s) => s === "signed")) return false;
      if (!needle) return true;
      return [r.name, r.city, r.province, r.providerName, r.providerEmail, r.contactEmail, ...r.packs.map((p) => p.signerEmail)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, q, filter]);

  const counts = useMemo(() => {
    return {
      need: rows.filter((r) => r.packs.some((p) => p.status === "none" || p.status === "draft" || p.status === "declined" || p.status === "voided")).length,
      out: rows.filter((r) => r.packs.some((p) => p.status === "sent" || p.status === "viewed")).length,
      signed: rows.filter((r) => r.packs.some((p) => p.status === "signed")).length,
      all: rows.length,
    };
  }, [rows]);

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={ds(locale, "needSign")} value={counts.need} accent />
        <Stat label={ds(locale, "out")} value={counts.out} />
        <Stat label={ds(locale, "signed")} value={counts.signed} />
        <Stat label={ds(locale, "centres")} value={counts.all} />
      </dl>
      <p className="mt-4 text-sm text-muted">{mode === "live" ? ds(locale, "leadLive") : ds(locale, "leadOff")}</p>
      {docusignError ? (
        <p
          role="status"
          data-ke="docusign-consent-banner"
          className="mt-3 rounded-xl bg-primary/10 px-5 py-4 text-sm text-fg ring-1 ring-border"
        >
          {docusignError.message || ds(locale, "consentBanner")}
        </p>
      ) : mode !== "live" ? (
        <p className="mt-3 rounded-xl bg-surface px-5 py-4 text-sm text-muted ring-1 ring-border">{ds(locale, "envHint")}</p>
      ) : null}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={ds(locale, "search")}
          className="h-11 flex-1 rounded-full bg-surface px-4 text-sm ring-1 ring-border"
        />
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["need", ds(locale, "filterNeed")],
              ["out", ds(locale, "filterSent")],
              ["signed", ds(locale, "filterSigned")],
              ["all", ds(locale, "filterAll")],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={filter === key ? "rounded-full bg-primary px-3 py-2 text-sm text-primary-fg" : "rounded-full bg-surface px-3 py-2 text-sm ring-1 ring-border"}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ul className="mt-6 divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border">
        {filtered.length === 0 ? (
          <li className="p-8 text-center text-muted">{ds(locale, "noMatch")}</li>
        ) : (
          filtered.map((r) => (
            <li key={r.daycareId} className="p-4">
              <div className="min-w-0">
                <p className="font-medium">{r.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {[r.city, r.province].filter(Boolean).join(", ")}
                  {r.licence ? ` · licence ${r.licence}` : ""}
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  {r.providerName || "—"} · {r.providerEmail || r.contactEmail || ds(locale, "noEmail")}
                </p>
              </div>
              <div className="mt-4 space-y-3">
                {r.packs.map((pack) => (
                  <PackRow
                    key={pack.packKind}
                    centre={r}
                    pack={pack}
                    mode={mode}
                    templates={templates}
                    defaultTemplateId={defaultTemplateIds[pack.packKind]}
                    busy={busy}
                    setBusy={setBusy}
                    onRefresh={onRefresh}
                  />
                ))}
              </div>
            </li>
          ))
        )}
      </ul>
    </>
  );
}

function PackRow({
  centre,
  pack,
  mode,
  templates,
  defaultTemplateId,
  busy,
  setBusy,
  onRefresh,
}: {
  centre: AdminContractRow;
  pack: AdminPackRow;
  mode: "live" | "demo";
  templates: DocusignTemplateOption[];
  defaultTemplateId: string | null;
  busy: string | null;
  setBusy: (v: string | null) => void;
  onRefresh: () => Promise<void>;
}) {
  const { locale } = useCopy();
  const [templateId, setTemplateId] = useState(defaultTemplateId || "");
  const [signerEmail, setSignerEmail] = useState(pack.signerEmail || centre.providerEmail || centre.contactEmail || "");
  const [signerName, setSignerName] = useState(pack.signerName || centre.providerName || "");
  const packLabel = pack.packKind === "enrolment_pack" ? ds(locale, "packEnrolment") : ds(locale, "packAgreement");

  async function send() {
    setBusy(`send:${centre.daycareId}:${pack.packKind}`);
    try {
      await sendCentreContract({
        data: {
          daycareId: centre.daycareId,
          packKind: pack.packKind,
          templateId: templateId || undefined,
          signerName: signerName || undefined,
          signerEmail: signerEmail || undefined,
        },
      });
      await onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not send contract");
    } finally {
      setBusy(null);
    }
  }

  async function voidRow() {
    if (!pack.contractId) return;
    setBusy(`void:${pack.contractId}`);
    try {
      await voidCentreContract({ data: { contractId: pack.contractId } });
      await onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not void contract");
    } finally {
      setBusy(null);
    }
  }

  async function refreshStatus() {
    if (!pack.contractId) return;
    setBusy(`sync:${pack.contractId}`);
    try {
      await syncCentreContract({ data: { contractId: pack.contractId } });
      await onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not refresh status");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl bg-bg p-3 ring-1 ring-border">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{packLabel}</p>
            <StatusChip status={pack.status} locale={locale} />
          </div>
          {pack.sentAt ? <p className="mt-0.5 text-xs text-subtle">Sent {new Date(pack.sentAt).toLocaleString()}</p> : null}
          {pack.signedAt ? <p className="mt-0.5 text-xs text-subtle">Signed {new Date(pack.signedAt).toLocaleString()}</p> : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {mode === "live" ? (
            <Button size="sm" disabled={busy !== null} onClick={() => void send()}>
              {pack.status === "signed" ? ds(locale, "resend") : pack.status === "sent" || pack.status === "viewed" ? ds(locale, "sendAgain") : ds(locale, "send")}
            </Button>
          ) : (
            <Button size="sm" disabled>
              {ds(locale, "sendOff")}
            </Button>
          )}
          {pack.signingUrl && pack.status !== "signed" && pack.status !== "voided" ? (
            <Button size="sm" variant="secondary" asChild>
              <a href={pack.signingUrl}>{ds(locale, "openSigning")}</a>
            </Button>
          ) : null}
          {pack.contractId && mode === "live" ? (
            <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void refreshStatus()}>
              {ds(locale, "refresh")}
            </Button>
          ) : null}
          {pack.hasSignedPdf && pack.contractId ? (
            <Button size="sm" variant="secondary" asChild>
              <a href={signedPdfPath(pack.contractId)}>{ds(locale, "download")}</a>
            </Button>
          ) : null}
          {pack.contractId && pack.status !== "voided" && pack.status !== "signed" ? (
            <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void voidRow()}>
              {ds(locale, "void")}
            </Button>
          ) : null}
        </div>
      </div>
      {mode === "live" ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="block text-xs text-subtle">
            {ds(locale, "template")}
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg bg-surface px-3 text-sm ring-1 ring-border"
            >
              <option value="">{ds(locale, "templateInApp")}</option>
              {defaultTemplateId ? <option value={defaultTemplateId}>{ds(locale, "templateDefault")}</option> : null}
              {templates.map((t) => (
                <option key={t.templateId} value={t.templateId}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-subtle">
            {ds(locale, "signerName")}
            <input
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg bg-surface px-3 text-sm ring-1 ring-border"
            />
          </label>
          <label className="block text-xs text-subtle">
            {ds(locale, "signerEmail")}
            <input
              type="email"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg bg-surface px-3 text-sm ring-1 ring-border"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

function StatusChip({ status, locale }: { status: string; locale: Locale }) {
  const label = status === "none" ? ds(locale, "statusNone") : status;
  const cls =
    status === "signed"
      ? "bg-ok/15 text-ok"
      : status === "sent" || status === "viewed"
        ? "bg-primary/10 text-primary"
        : status === "declined"
          ? "bg-danger/10 text-danger"
          : "bg-surface-2 text-muted";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${cls}`}>{label}</span>;
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={accent ? "rounded-xl bg-primary px-4 py-3 text-primary-fg" : "rounded-xl bg-surface px-4 py-3 ring-1 ring-border"}>
      <dt className={`text-[11px] uppercase tracking-[0.14em] ${accent ? "text-primary-fg/70" : "text-subtle"}`}>{label}</dt>
      <dd className="mt-1 font-display text-2xl">{value}</dd>
    </div>
  );
}

export function CentrePackChips({ packs }: { packs: AdminPackRow[] }) {
  const { locale } = useCopy();
  if (!packs.length) return null;
  return (
    <p className="mt-2 flex flex-wrap gap-2 text-xs">
      {packs.map((pack) => {
        const label = pack.packKind === "enrolment_pack" ? ds(locale, "packEnrolment") : ds(locale, "packAgreement");
        return (
          <span key={pack.packKind} className="inline-flex items-center gap-1">
            <StatusChip status={pack.status} locale={locale} />
            <span className="text-muted">{label}</span>
            {pack.hasSignedPdf && pack.contractId ? (
              <a className="text-primary underline" href={signedPdfPath(pack.contractId)}>
                PDF
              </a>
            ) : null}
          </span>
        );
      })}
    </p>
  );
}

