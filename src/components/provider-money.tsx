import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LedgerHonesty } from "@/components/listing-status-badge";
import { BillStatusBadge } from "@/components/bill-status";
import { EmptyState } from "@/components/empty-state";
import { useCopy } from "@/lib/use-copy";
import { money } from "@/lib/utils";
import type { Locale } from "@/lib/types";
import { currentPeriod, periodLabel, platformFeeBps, splitFee } from "@/lib/stripe-methods";
import { type Bill, type BillParty, billDollars, centsToDollars, receiveCents } from "@/lib/bill";
import { createBill, listBillParties, listProviderBills, sendBill, voidBill } from "@/lib/server/billing";
import { Field } from "@/components/provider-listing-forms";

export function ProviderMoneyPanel() {
  const { t, locale } = useCopy();
  const [bills, setBills] = useState<Bill[]>([]);
  const [parties, setParties] = useState<BillParty[]>([]);
  const [stripeLive, setStripeLive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    partyKey: "",
    childId: "",
    bookingId: "",
    amountCad: "",
    period: currentPeriod(),
    dueAt: "",
    memo: "",
  });

  async function load() {
    const [list, people] = await Promise.all([listProviderBills(), listBillParties()]);
    setBills(list.bills);
    setStripeLive(list.stripeLive);
    setParties(people);
    if (!form.partyKey && people[0]) {
      const first = people[0];
      setForm((cur) => ({
        ...cur,
        partyKey: `${first.userId}:${first.daycareId}`,
        childId: first.children[0]?.id ?? "",
        bookingId: first.bookings[0]?.id ?? "",
        amountCad: first.bookings[0]?.monthlyAmount ? String(first.bookings[0].monthlyAmount) : cur.amountCad,
      }));
    }
  }

  useEffect(() => {
    void load().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first paint only
  }, []);

  const party = parties.find((p) => `${p.userId}:${p.daycareId}` === form.partyKey) ?? null;
  const amountCad = Number(form.amountCad) || 0;
  const preview = splitFee(Math.round(amountCad * 100));

  const open = useMemo(() => bills.filter((b) => b.status === "draft" || b.status === "sent"), [bills]);
  const done = useMemo(() => bills.filter((b) => b.status !== "draft" && b.status !== "sent"), [bills]);

  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-display text-2xl">Money</h2>
        <p className="mt-1 text-sm text-muted">{t("moneyDeskLead")}</p>
        <LedgerHonesty stripeLive={stripeLive} className="mt-2" />
        {!stripeLive ? (
          <p className="mt-2 text-sm text-muted">
            You can draft and Send bills so both desks can rehearse. Pay stays off — internal ledger (not charged).
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Live charges include a KidEase platform fee of about 3%. The parent pays the bill total; you receive the rest.
          </p>
        )}
      </div>

      <form
        className="rounded-xl bg-surface p-5 ring-1 ring-border"
        onSubmit={(e) => {
          e.preventDefault();
          if (!party) {
            toast.error("Approve a family first, then create a bill.");
            return;
          }
          setBusy("create");
          void createBill({
            data: {
              daycareId: party.daycareId,
              parentUserId: party.userId,
              childId: form.childId || null,
              bookingId: form.bookingId || null,
              amountCad,
              period: form.period,
              dueAt: form.dueAt || null,
              memo: form.memo || null,
            },
          })
            .then(() => {
              toast.success("Draft bill saved. Send when the parent should see it.");
              setForm((cur) => ({ ...cur, memo: "" }));
              return load();
            })
            .catch((err) => toast.error(err instanceof Error ? err.message : "Could not save bill"))
            .finally(() => setBusy(null));
        }}
      >
        <h3 className="font-display text-xl">{t("newBill")}</h3>
        {parties.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Incoming requests become billable families after they ask this centre for a spot.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Family</span>
              <select
                className="ke-input"
                value={form.partyKey}
                onChange={(e) => {
                  const next = parties.find((p) => `${p.userId}:${p.daycareId}` === e.target.value);
                  setForm((cur) => ({
                    ...cur,
                    partyKey: e.target.value,
                    childId: next?.children[0]?.id ?? "",
                    bookingId: next?.bookings[0]?.id ?? "",
                    amountCad: next?.bookings[0]?.monthlyAmount
                      ? String(next.bookings[0].monthlyAmount)
                      : cur.amountCad,
                  }));
                }}
              >
                {parties.map((p) => (
                  <option key={`${p.userId}:${p.daycareId}`} value={`${p.userId}:${p.daycareId}`}>
                    {p.name || p.email || "Parent"} · {p.daycareName}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted">{t("child")}</span>
              <select
                className="ke-input"
                value={form.childId}
                onChange={(e) => setForm({ ...form, childId: e.target.value })}
              >
                <option value="">—</option>
                {party?.children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label={`${t("amount")} CAD`}
              value={form.amountCad}
              onChange={(v) => setForm({ ...form, amountCad: v })}
            />
            <Field
              label={t("billPeriod")}
              value={form.period}
              onChange={(v) => setForm({ ...form, period: v })}
            />
            <label className="grid gap-1 text-sm">
              <span className="text-muted">{t("billDue")}</span>
              <input
                type="date"
                className="ke-input"
                value={form.dueAt}
                onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
              />
            </label>
            <Field label={t("billNote")} value={form.memo} onChange={(v) => setForm({ ...form, memo: v })} />
          </div>
        )}
        {amountCad > 0 ? (
          <p className="mt-3 text-sm text-muted">
            {stripeLive ? (
              <>
                {t("youReceive")}{" "}
                <span className="font-medium text-fg">{money(centsToDollars(preview.net), locale)}</span>{" "}
                {t("afterKidEaseFee")} ({(platformFeeBps() / 100).toFixed(1)}%).
              </>
            ) : (
              <>Fee preview {(platformFeeBps() / 100).toFixed(1)}% — not charged on the internal ledger.</>
            )}
          </p>
        ) : null}
        <div className="mt-4">
          <Button type="submit" disabled={!party || amountCad < 1 || busy === "create"}>
            {t("newBill")}
          </Button>
        </div>
        {/* Deposit CTA from an offered spot can deep-link here later (/provider?desk=money). */}
      </form>

      <BillList
        title={t("openBills")}
        empty={t("noBillsLead")}
        items={open}
        stripeLive={stripeLive}
        locale={locale}
        busy={busy}
        onSend={(id) => {
          setBusy(id);
          void sendBill({ data: id })
            .then(() => {
              toast.success("Bill sent. The parent can Pay in KidEase.");
              return load();
            })
            .catch((err) => toast.error(err instanceof Error ? err.message : "Could not send"))
            .finally(() => setBusy(null));
        }}
        onVoid={(id) => {
          setBusy(id);
          void voidBill({ data: id })
            .then(() => {
              toast.success("Bill voided.");
              return load();
            })
            .catch((err) => toast.error(err instanceof Error ? err.message : "Could not void"))
            .finally(() => setBusy(null));
        }}
      />

      <BillList
        title={t("paidBills")}
        empty="Paid bills will land here after the parent Pays."
        items={done}
        stripeLive={stripeLive}
        locale={locale}
        busy={busy}
      />
    </section>
  );
}

function BillList({
  title,
  empty,
  items,
  stripeLive,
  locale,
  busy,
  onSend,
  onVoid,
}: {
  title: string;
  empty: string;
  items: Bill[];
  stripeLive: boolean;
  locale: Locale;
  busy: string | null;
  onSend?: (id: string) => void;
  onVoid?: (id: string) => void;
}) {
  const { t } = useCopy();
  if (!items.length) {
    return (
      <div>
        <h3 className="font-display text-xl">{title}</h3>
        <div className="mt-3">
          <EmptyState title={t("noPayments")} body={empty} />
        </div>
      </div>
    );
  }
  return (
    <div>
      <h3 className="font-display text-xl">{title}</h3>
      <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border">
        {items.map((b) => (
          <li key={b.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{b.parentName || b.parentEmail || "Parent"}</p>
                  <BillStatusBadge status={b.status} />
                </div>
                <p className="mt-1 text-sm text-muted">
                  {b.daycareName}
                  {b.childName ? ` · ${b.childName}` : ""}
                  {` · ${periodLabel(b.period, locale)}`}
                  {b.dueAt ? ` · ${t("billDue")} ${b.dueAt}` : ""}
                </p>
                {b.memo ? <p className="mt-1 text-sm text-subtle">{b.memo}</p> : null}
                {stripeLive && b.status !== "void" ? (
                  <p className="mt-1 text-sm text-muted">
                    {t("youReceive")} {money(centsToDollars(receiveCents(b.amountCents, b.platformFeeCents)), locale)}{" "}
                    {t("afterKidEaseFee")}
                  </p>
                ) : null}
              </div>
              <p className="font-display text-2xl tabular-nums">{money(billDollars(b), locale)}</p>
            </div>
            {b.status === "draft" || b.status === "sent" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {b.status === "draft" && onSend ? (
                  <Button size="sm" disabled={busy !== null} onClick={() => onSend(b.id)}>
                    {t("sendBill")}
                  </Button>
                ) : null}
                {onVoid ? (
                  <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => onVoid(b.id)}>
                    {t("voidBill")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
