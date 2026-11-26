import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { confirmSuccess } from "@/lib/success-confirm";
import { Button } from "@/components/ui/button";
import { LedgerHonesty } from "@/components/listing-status-badge";
import { BillStatusBadge, PaymentStateBadge } from "@/components/bill-status";
import { EmptyState } from "@/components/empty-state";
import { FirstRunExample } from "@/components/first-run";
import { useCopy } from "@/lib/use-copy";
import { money } from "@/lib/utils";
import type { Locale } from "@/lib/types";
import { currentPeriod, periodLabel, platformFeePercentLabel } from "@/lib/stripe-methods";
import { type Bill, type BillParty, billDollars, earningsSummary, receiveCents } from "@/lib/bill";
import {
  createBill,
  listBillParties,
  listProviderBills,
  sendBill,
  sendBillReminder,
  voidBill,
} from "@/lib/server/billing";
import { StripeInvoiceList } from "@/components/stripe-invoice-list";
import { PayoutStatusCard } from "@/components/payout-status-card";
import { loadEarningsDesk } from "@/lib/server/earnings-desk";
import { Field } from "@/components/provider-listing-forms";

export function ProviderMoneyPanel({
  showPayouts = true,
  canEdit = true,
}: {
  showPayouts?: boolean;
  canEdit?: boolean;
}) {
  const { t, locale } = useCopy();
  const [bills, setBills] = useState<Bill[]>([]);
  const [parties, setParties] = useState<BillParty[]>([]);
  const [stripeLive, setStripeLive] = useState(false);
  const [remindersOn, setRemindersOn] = useState(false);
  const [feeBps, setFeeBps] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [payouts, setPayouts] = useState<"on" | "off" | "unknown" | null>(null);
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
    setRemindersOn(list.remindersOn === true);
    setFeeBps(typeof list.platformFeeBps === "number" ? list.platformFeeBps : null);
    setParties(people);
    setReady(true);
    if (!form.partyKey && people[0]) {
      const first = people[0];
      setForm((cur) => ({
        ...cur,
        partyKey: `${first.userId}:${first.daycareId}`,
        childId: first.children[0]?.id ?? "",
        bookingId: first.bookings[0]?.id ?? "",
        amountCad: first.bookings[0]?.monthlyAmount
          ? String(first.bookings[0].monthlyAmount)
          : cur.amountCad,
      }));
    }
  }

  useEffect(() => {
    void load().catch(() => undefined);
    if (showPayouts) {
      void loadEarningsDesk()
        .then((desk) => {
          if (desk.ok) setPayouts(desk.payouts);
        })
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first paint only
  }, [showPayouts]);

  const party = parties.find((p) => `${p.userId}:${p.daycareId}` === form.partyKey) ?? null;
  const amountCad = Number(form.amountCad) || 0;

  const open = useMemo(
    () => bills.filter((b) => b.status === "draft" || b.status === "sent"),
    [bills],
  );
  const done = useMemo(
    () => bills.filter((b) => b.status !== "draft" && b.status !== "sent"),
    [bills],
  );
  const summary = useMemo(() => earningsSummary(bills), [bills]);
  const fr = locale === "fr";

  return (
    <section className="space-y-8" data-tour="provider-money">
      <div>
        <h2 className="font-display text-2xl" data-tour="provider-money-title">
          {t("deskNavMoney")}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {canEdit ? t("moneyDeskLead") : t("moneyDeskViewLead")}
        </p>
        {canEdit && ready && stripeLive ? (
          <p className="mt-2 text-sm text-muted">{t("newBillLiveHint")}</p>
        ) : canEdit ? (
          <LedgerHonesty stripeLive={stripeLive} className="mt-2" ready={ready} />
        ) : null}
        {canEdit && ready ? (
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3" data-ke="earnings-summary">
            <div className="rounded-xl bg-surface p-4 ring-1 ring-border">
              <dt className="text-sm text-muted">{fr ? "À recevoir" : "Owed to you"}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {money(summary.owedCents / 100, locale)}
              </dd>
              <dd className="text-xs text-muted">
                {fr
                  ? `${summary.owedCount} facture(s) envoyée(s)`
                  : `${summary.owedCount} sent ${summary.owedCount === 1 ? "bill" : "bills"}`}
              </dd>
            </div>
            <div className="rounded-xl bg-surface p-4 ring-1 ring-border">
              <dt className="text-sm text-muted">{fr ? "Payé ce mois-ci" : "Paid this month"}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {money(summary.paidThisMonthCents / 100, locale)}
              </dd>
              <dd className="text-xs text-muted">
                {fr ? "Après les frais KidEase" : "After the KidEase fee"}
              </dd>
            </div>
            <div className="rounded-xl bg-surface p-4 ring-1 ring-border">
              <dt className="text-sm text-muted">{fr ? "Brouillons" : "Drafts"}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{summary.draftCount}</dd>
              <dd>
                <a
                  href="#new-bill"
                  className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  {fr ? "Nouvelle facture" : "New bill"}
                </a>
              </dd>
            </div>
          </dl>
        ) : null}
        {showPayouts && payouts ? (
          <div className="mt-4">
            <PayoutStatusCard status={payouts} />
          </div>
        ) : null}
      </div>

      {canEdit ? (
        <form
          id="new-bill"
          className="scroll-mt-24 rounded-xl bg-surface p-5 ring-1 ring-border"
          onSubmit={(e) => {
            e.preventDefault();
            if (!party) {
              toast.error(t("billNeedApprovedFamily"));
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
                confirmSuccess({
                  variant: "toast",
                  title: t("billDraftSavedTitle"),
                  body: t("billDraftSavedBody"),
                });
                setForm((cur) => ({ ...cur, memo: "" }));
                return load();
              })
              .catch((err) => toast.error(err instanceof Error ? err.message : t("billSaveFailed")))
              .finally(() => setBusy(null));
          }}
        >
          <h3 className="font-display text-xl">{t("newBill")}</h3>
          {parties.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{t("billIncomingFamilies")}</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-muted">{t("billFamilyLabel")}</span>
                <select
                  className="ke-input"
                  value={form.partyKey}
                  onChange={(e) => {
                    const next = parties.find(
                      (p) => `${p.userId}:${p.daycareId}` === e.target.value,
                    );
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
              <Field
                label={t("billNote")}
                value={form.memo}
                onChange={(v) => setForm({ ...form, memo: v })}
              />
            </div>
          )}
          {amountCad > 0 ? (
            <p className="mt-3 text-sm text-muted">
              {stripeLive ? (
                <>
                  {t("youReceive")}{" "}
                  <span className="font-medium text-fg">
                    {money(
                      receiveCents(Math.round(amountCad * 100), undefined, feeBps ?? undefined) /
                        100,
                      locale,
                    )}
                  </span>{" "}
                  {t("afterKidEaseFee")}
                  {platformFeePercentLabel(feeBps) ? ` (${platformFeePercentLabel(feeBps)})` : ""}
                </>
              ) : (
                <>
                  {t("connectFeePreviewOff")}
                  {platformFeePercentLabel(feeBps) ? ` ${platformFeePercentLabel(feeBps)}` : ""}
                </>
              )}
            </p>
          ) : null}
          <div className="mt-4">
            <Button type="submit" disabled={!ready || !party || amountCad < 1 || busy === "create"}>
              {t("newBill")}
            </Button>
            {ready && !party ? (
              <p className="mt-2 text-sm text-muted">{t("newBillNeedFamily")}</p>
            ) : null}
            {ready && party && amountCad < 1 ? (
              <p className="mt-2 text-sm text-muted">{t("newBillNeedAmount")}</p>
            ) : null}
          </div>
          {/* Deposit CTA from an offered spot can deep-link here later (/provider?desk=money). */}
        </form>
      ) : null}

      <BillList
        title={t("openBills")}
        empty={t("noBillsLead")}
        items={open}
        stripeLive={stripeLive}
        locale={locale}
        busy={busy}
        onSend={
          canEdit
            ? (id) => {
                setBusy(id);
                void sendBill({ data: id })
                  .then(() => {
                    confirmSuccess({ variant: "toast", title: t("billSentToast") });
                    return load();
                  })
                  .catch((err) => toast.error(err instanceof Error ? err.message : t("sendFailed")))
                  .finally(() => setBusy(null));
              }
            : undefined
        }
        onRemind={
          canEdit && remindersOn
            ? (id) => {
                setBusy(id);
                void sendBillReminder({ data: id })
                  .then((res) => {
                    if (!res.ok) {
                      toast.error(
                        fr ? "Le rappel n’a pas été envoyé." : "The reminder was not sent.",
                      );
                      return;
                    }
                    if (res.result === "sent")
                      toast.success(
                        fr ? "Rappel envoyé au parent." : "Reminder sent to the parent.",
                      );
                    else if (res.result === "duplicate")
                      toast.message(
                        fr
                          ? "Un rappel a déjà été envoyé aujourd’hui."
                          : "A reminder already went out today.",
                      );
                    else if (res.result === "dry_run")
                      toast.message(
                        fr
                          ? "Rappel enregistré en mode test. Aucun courriel envoyé."
                          : "Reminder logged in test mode. No email went out.",
                      );
                    else
                      toast.message(
                        fr
                          ? "Rappel retenu (règles d’envoi)."
                          : "Reminder held by the sending rules.",
                      );
                  })
                  .catch((err) => toast.error(err instanceof Error ? err.message : t("sendFailed")))
                  .finally(() => setBusy(null));
              }
            : undefined
        }
        onVoid={
          canEdit
            ? (id) => {
                setBusy(id);
                void voidBill({ data: id })
                  .then(() => {
                    toast.success(t("billVoided"));
                    return load();
                  })
                  .catch((err) =>
                    toast.error(err instanceof Error ? err.message : t("billVoidFailed")),
                  )
                  .finally(() => setBusy(null));
              }
            : undefined
        }
      />

      <BillList
        title={t("paidBills")}
        empty={t("paidBillsEmpty")}
        items={done}
        stripeLive={stripeLive}
        locale={locale}
        busy={busy}
      />

      {canEdit ? <StripeInvoiceList audience="daycare" /> : null}
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
  onRemind,
}: {
  title: string;
  empty: string;
  items: Bill[];
  stripeLive: boolean;
  locale: Locale;
  busy: string | null;
  onSend?: (id: string) => void;
  onVoid?: (id: string) => void;
  onRemind?: (id: string) => void;
}) {
  const { t, locale: copyLocale } = useCopy();
  const fr = copyLocale === "fr";
  if (!items.length) {
    return (
      <div>
        <h3 className="font-display text-xl">{title}</h3>
        <div className="mt-3">
          <EmptyState
            title={t("noPayments")}
            body={empty}
            extra={<FirstRunExample id="provider-money" />}
          />
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
                  <p className="font-medium">{b.parentName || "Parent"}</p>
                  <BillStatusBadge status={b.status} />
                  <PaymentStateBadge state={b.paymentState} />
                </div>
                <p className="mt-1 text-sm text-muted">
                  {b.daycareName}
                  {b.childName ? ` · ${b.childName}` : ""}
                  {` · ${periodLabel(b.period, locale)}`}
                  {b.dueAt ? ` · ${t("billDue")} ${b.dueAt}` : ""}
                </p>
                {b.memo ? <p className="mt-1 text-sm text-subtle">{b.memo}</p> : null}
                {b.status !== "void" && b.platformFeeCents > 0 ? (
                  <p className="mt-1 text-sm text-muted" data-ke="bill-centre-fee">
                    {t("earningsServiceFee")}: {money(b.platformFeeCents / 100, locale)} ·{" "}
                    {t("youReceive")}{" "}
                    {money(receiveCents(b.amountCents, b.platformFeeCents) / 100, locale)}{" "}
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
                {b.status === "sent" && !b.paidAt && onRemind ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy !== null}
                    onClick={() => onRemind(b.id)}
                    data-ke="bill-send-reminder"
                  >
                    {fr ? "Envoyer un rappel" : "Send reminder"}
                  </Button>
                ) : null}
                {onVoid ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy !== null}
                    onClick={() => onVoid(b.id)}
                  >
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
