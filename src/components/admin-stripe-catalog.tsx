import { useState } from "react";
import { Button } from "@/components/ui/button";

type CatalogRow = {
  key: string;
  envName: string;
  amountCad: number;
  required: boolean;
  envPriceId: string | null;
  action: string;
};

type CatalogPayload = {
  ok?: boolean;
  live?: boolean;
  secret?: string;
  rows?: CatalogRow[];
  vercel?: Record<string, string>;
  error?: string;
};

export function AdminStripeCatalog() {
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<CatalogPayload | null>(null);
  const [note, setNote] = useState("");

  async function run(method: "GET" | "POST") {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch("/api/admin/stripe-catalog", { method, credentials: "same-origin" });
      const json = (await res.json()) as CatalogPayload;
      if (!res.ok || !json.ok) {
        setNote(json.error || "Request failed");
        return;
      }
      setData(json);
      setNote(
        method === "POST"
          ? "Created any missing LIVE prices. Copy the price IDs into Vercel — the secret is never shown."
          : "Catalog status loaded. Price IDs only — no secret keys.",
      );
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 rounded-xl bg-surface p-4 ring-1 ring-border">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">Stripe catalog</p>
      <p className="mt-1 text-sm text-muted">
        Admin-only. Creates KidEase Products/Prices on the LIVE account when missing, then prints
        price IDs to set on Vercel. Never logs the secret key.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void run("GET")}>
          Check prices
        </Button>
        <Button type="button" disabled={busy} onClick={() => void run("POST")}>
          {busy ? "Working…" : "Create missing LIVE prices"}
        </Button>
      </div>
      {data ? (
        <p className="mt-3 text-xs text-subtle">
          {data.live ? "sk_live_ is set" : "Not live"} · secret {data.secret}
        </p>
      ) : null}
      {data?.rows?.length ? (
        <ul className="mt-3 space-y-1 text-sm">
          {data.rows.map((row) => (
            <li key={row.key} className="flex flex-wrap justify-between gap-2">
              <span>
                {row.envName}
                {row.required ? "" : " (optional)"} · ${row.amountCad} CAD
              </span>
              <span className="text-muted">
                {row.envPriceId || data.vercel?.[row.envName] || row.action}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {note ? <p className="mt-2 text-sm text-muted">{note}</p> : null}
    </div>
  );
}
