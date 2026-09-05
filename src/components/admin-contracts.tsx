import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { sendCentreContract, voidCentreContract, type AdminContractRow } from "@/lib/server/contracts";

export function AdminContractsPanel({
  rows,
  mode,
  busy,
  setBusy,
  onRefresh,
}: {
  rows: AdminContractRow[];
  mode: "live" | "demo";
  busy: string | null;
  setBusy: (v: string | null) => void;
  onRefresh: () => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"need" | "out" | "signed" | "all">("need");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      const status = r.status;
      if (filter === "need" && status !== "none" && status !== "draft" && status !== "declined" && status !== "voided") return false;
      if (filter === "out" && status !== "sent" && status !== "viewed") return false;
      if (filter === "signed" && status !== "signed") return false;
      if (!needle) return true;
      return [r.name, r.city, r.province, r.providerName, r.providerEmail, r.contactEmail, r.signerEmail]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, q, filter]);

  const counts = useMemo(() => {
    return {
      need: rows.filter((r) => r.status === "none" || r.status === "draft" || r.status === "declined" || r.status === "voided").length,
      out: rows.filter((r) => r.status === "sent" || r.status === "viewed").length,
      signed: rows.filter((r) => r.status === "signed").length,
      all: rows.length,
    };
  }, [rows]);

  async function send(row: AdminContractRow) {
    setBusy(`send:${row.daycareId}`);
    try {
      await sendCentreContract({
        data: {
          daycareId: row.daycareId,
          signerName: row.providerName || undefined,
          signerEmail: row.providerEmail || row.contactEmail || undefined,
        },
      });
      await onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not send contract");
    } finally {
      setBusy(null);
    }
  }

  async function voidRow(row: AdminContractRow) {
    if (!row.contractId) return;
    setBusy(`void:${row.contractId}`);
    try {
      await voidCentreContract({ data: { contractId: row.contractId } });
      await onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not void contract");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Need a signature" value={counts.need} accent />
        <Stat label="Out for signature" value={counts.out} />
        <Stat label="Signed" value={counts.signed} />
        <Stat label="Centres" value={counts.all} />
      </dl>
      <p className="mt-4 text-sm text-muted">
        Each claimed centre signs the KidEase licensed centre agreement.
        {mode === "live" ? " Envelopes go through DocuSign." : " DocuSign keys are not set yet, so centres sign in-app until you add them on Vercel."}
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search centre, city, signer…"
          className="h-11 flex-1 rounded-full bg-surface px-4 text-sm ring-1 ring-border"
        />
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["need", "Need sign"],
              ["out", "Sent"],
              ["signed", "Signed"],
              ["all", "All"],
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
          <li className="p-8 text-center text-muted">No centres match that filter.</li>
        ) : (
          filtered.map((r) => (
            <li key={r.daycareId} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.slug ? (
                      <Link to="/daycare/$slug" params={{ slug: r.slug }} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                    ) : (
                      <p className="font-medium">{r.name}</p>
                    )}
                    <StatusChip status={r.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {[r.city, r.province].filter(Boolean).join(", ")}
                    {r.licence ? ` · licence ${r.licence}` : ""}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">
                    {r.signerName || r.providerName || "—"} · {r.signerEmail || r.providerEmail || r.contactEmail || "no email"}
                  </p>
                  {r.lastEvent ? <p className="mt-0.5 text-xs text-subtle">Last event · {r.lastEvent}</p> : null}
                  {r.sentAt ? <p className="mt-0.5 text-xs text-subtle">Sent {new Date(r.sentAt).toLocaleString()}</p> : null}
                  {r.signedAt ? <p className="mt-0.5 text-xs text-subtle">Signed {new Date(r.signedAt).toLocaleString()}</p> : null}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button size="sm" disabled={busy !== null} onClick={() => void send(r)}>
                    {mode === "demo"
                      ? r.status === "signed"
                        ? "Resend in-app"
                        : "Send in-app signing"
                      : r.status === "signed"
                        ? "Resend"
                        : r.status === "sent" || r.status === "viewed"
                          ? "Send again"
                          : "Send to sign"}
                  </Button>
                  {r.signingUrl && r.status !== "signed" && r.status !== "voided" ? (
                    <Button size="sm" variant="secondary" asChild>
                      <a href={r.signingUrl}>Open signing</a>
                    </Button>
                  ) : null}
                  {r.contractId && r.status !== "voided" && r.status !== "signed" ? (
                    <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void voidRow(r)}>
                      Void
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))
        )}
      </ul>
    </>
  );
}

function StatusChip({ status }: { status: string }) {
  const label = status === "none" ? "Not sent" : status;
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
