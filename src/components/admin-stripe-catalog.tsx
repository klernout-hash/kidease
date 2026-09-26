import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DAYCARE_UPGRADE_PLANS,
  PAID_PLAN_PRICE_KEYS,
  PAID_PLAN_PRICES,
  PARENT_UPGRADE_PLANS,
  RECOMMENDED_LABEL,
  paidPlanPrice,
  yearlySavingsPercent,
  yearlySavingsPercentFromCents,
} from "@/lib/upgrade-plans";

type CatalogRow = {
  key: string;
  envName: string;
  amountCad: number;
  required: boolean;
  envPriceId: string | null;
  action: string;
  expectedKind?: "recurring" | "one_time";
  expectedInterval?: "month" | "year" | null;
  priceOk?: boolean | null;
  priceNote?: string;
  proposal?: boolean;
  liveUnitAmountCents?: number | null;
};

type CheckoutErrorRow = {
  id: string;
  at: string;
  surface: string | null;
  publicMessage: string;
  detail: string;
};

type CatalogPayload = {
  ok?: boolean;
  live?: boolean;
  secret?: string;
  rows?: CatalogRow[];
  vercel?: Record<string, string>;
  recentErrors?: CheckoutErrorRow[];
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
      <div className="mt-4 grid gap-3 md:grid-cols-2" data-ke="admin-plan-benefits">
        {[...PARENT_UPGRADE_PLANS, ...DAYCARE_UPGRADE_PLANS].map((plan) => (
          <div key={`${plan.role}-${plan.id}`} className="rounded-lg bg-bg px-3 py-2 text-sm ring-1 ring-border">
            <p className="font-medium">
              {plan.role === "parent" ? "Families" : "Daycares"} · {plan.name.en}
              {plan.recommended ? ` · ${RECOMMENDED_LABEL.en}` : ""}
            </p>
            <p className="mt-1 text-muted">{plan.pitch.en}</p>
            <ul className="mt-1 list-disc pl-4 text-muted">
              {plan.benefits.map((benefit) => (
                <li key={benefit.en}>{benefit.en}</li>
              ))}
            </ul>
            {plan.id !== "free" ? (
              <p className="mt-2 text-xs text-subtle">
                {(() => {
                  const price = paidPlanPrice(plan.id);
                  const percent = price ? yearlySavingsPercent(price.monthlyCad, price.yearlyCad) : null;
                  if (!price || percent == null) return "Yearly saving cannot be computed.";
                  const proposal =
                    price.hideUntilBothPrices || price.yearlyProposal
                      ? " Proposal — hidden until the Stripe price env is set. Needs Kyle’s OK."
                      : "";
                  return `Yearly saves ${percent}% (rounded down from $${price.monthlyCad} × 12 vs $${price.yearlyCad}).${proposal}`;
                })()}
              </p>
            ) : null}
          </div>
        ))}
      </div>
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
        <ul className="mt-3 space-y-2 text-sm">
          {data.rows.map((row) => (
            <li key={row.key} className="rounded-lg bg-bg px-3 py-2 ring-1 ring-border">
              <div className="flex flex-wrap justify-between gap-2">
                <span>
                  {row.envName}
                  {row.required ? "" : " (optional)"} · ${row.amountCad} CAD
                  {row.expectedKind === "recurring"
                    ? ` · recurring${row.expectedInterval ? ` ${row.expectedInterval}` : ""}`
                    : " · one-time"}
                </span>
                <span className="text-muted">
                  {row.envPriceId || data.vercel?.[row.envName] || row.action}
                </span>
              </div>
              {row.priceNote || !row.envPriceId ? (
                <p className={!row.envPriceId || row.priceOk === false ? "mt-1 text-danger" : "mt-1 text-xs text-subtle"}>
                  {!row.envPriceId ? "Missing price. " : ""}
                  {row.proposal ? "Proposal. " : ""}
                  {row.priceNote}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {data?.rows?.length ? (
        <div className="mt-4" data-ke="admin-yearly-savings">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">Yearly savings</p>
          <ul className="mt-2 space-y-2 text-sm">
            {PAID_PLAN_PRICES.map((price) => {
              const keys = PAID_PLAN_PRICE_KEYS[price.id];
              const month = data.rows?.find((row) => row.key === keys.month);
              const year = data.rows?.find((row) => row.key === keys.year);
              const catalog = yearlySavingsPercent(price.monthlyCad, price.yearlyCad);
              const live =
                typeof month?.liveUnitAmountCents === "number" && typeof year?.liveUnitAmountCents === "number"
                  ? yearlySavingsPercentFromCents(month.liveUnitAmountCents, year.liveUnitAmountCents)
                  : null;
              const missing = !month?.envPriceId || !year?.envPriceId;
              return (
                <li key={price.id} className={missing || (live != null && live !== catalog) ? "text-danger" : "text-muted"}>
                  {price.id}: catalog saves {catalog ?? "—"}% (rounded down)
                  {live != null ? ` · Stripe prices save ${live}%` : " · Stripe amounts not both readable"}
                  {live != null && catalog != null && live !== catalog
                    ? " · Stripe and catalog percents differ. Checkout stays off until the amounts match."
                    : ""}
                  {missing ? " · missing price" : ""}
                  {price.yearlyProposal || price.hideUntilBothPrices ? " · proposal" : ""}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {data?.recentErrors?.length ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">Recent checkout errors</p>
          <ul className="mt-2 space-y-2 text-sm">
            {data.recentErrors.map((row) => (
              <li key={row.id} className="rounded-lg bg-bg px-3 py-2 ring-1 ring-border">
                <p>{row.publicMessage}</p>
                <p className="mt-1 text-xs text-subtle">
                  {row.surface || "checkout"} · {row.at}
                </p>
                <p className="mt-1 text-xs text-danger">{row.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {note ? <p className="mt-2 text-sm text-muted">{note}</p> : null}
    </div>
  );
}
