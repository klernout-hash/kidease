import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Lock } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { LedgerHonesty } from "@/components/listing-status-badge";
import { BillStatusBadge } from "@/components/bill-status";
import { createBillCheckout, getBill } from "@/lib/server/billing";
import { useCopy } from "@/lib/use-copy";
import { money } from "@/lib/utils";
import { periodLabel } from "@/lib/stripe-methods";
import { type Bill, billDollars } from "@/lib/bill";

export const Route = createFileRoute("/pay/bill/$billId")({
  validateSearch: (s: Record<string, unknown>) => {
    if (s.paid === "1" || s.paid === 1 || s.paid === true) return { paid: "1" as const };
    return {};
  },
  component: PayBillPage,
});

function PayBillPage() {
  const { billId } = Route.useParams();
  const search = Route.useSearch();
  const { user, isPending } = useCurrentUserState();
  const { t, locale } = useCopy();
  const [bill, setBill] = useState<Bill | null>(null);
  const [stripeLive, setStripeLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);

  async function load() {
    try {
      const res = await getBill({ data: billId });
      setBill(res.bill);
      setStripeLive(res.stripeLive);
      setMissing(false);
    } catch {
      setMissing(true);
    }
  }

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, billId]);

  useEffect(() => {
    if (!search.paid || !user) return;
    const tmr = window.setTimeout(() => void load(), 1200);
    return () => window.clearTimeout(tmr);
  }, [search.paid, user, billId]);

  if (isPending) {
    return (
      <Shell>
        <p className="p-8 text-muted">{t("loading")}</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;

  const alreadyPaid = bill?.status === "paid";
  const canPay = Boolean(stripeLive && bill?.status === "sent");

  async function pay() {
    if (!canPay || !bill) return;
    setBusy(true);
    try {
      const res = await createBillCheckout({ data: bill.id });
      if (res.alreadyPaid) {
        toast.success(t("paid"));
        await load();
        return;
      }
      if (res.url) {
        window.location.assign(res.url);
        return;
      }
      toast.error("Pay link was not ready.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("billInternalPay"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <main className="mx-auto max-w-lg px-4 py-8">
        <Link to="/parent" search={{ tab: "payments" }} className="text-sm text-muted hover:text-fg">
          ← {t("payments")}
        </Link>
        <h1 className="mt-3 font-display text-3xl">{alreadyPaid ? t("receiptTitle") : t("payBillTitle")}</h1>
        <p className="mt-2 text-sm text-muted">{alreadyPaid ? t("receiptLead") : t("payBillLead")}</p>
        <LedgerHonesty stripeLive={stripeLive} className="mt-3" />

        {missing ? (
          <p className="mt-6 rounded-xl bg-surface p-4 text-sm text-muted ring-1 ring-border">
            This bill is not available. Drafts stay with the centre until they Send.
          </p>
        ) : null}

        {bill ? (
          <div className="mt-6 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-subtle">{t("bill")}</p>
              <BillStatusBadge status={bill.status} />
            </div>
            <p className="mt-1 font-display text-2xl">{bill.daycareName}</p>
            <p className="mt-1 text-sm text-muted">
              {bill.childName ? `${bill.childName} · ` : ""}
              {periodLabel(bill.period, locale)}
              {bill.dueAt ? ` · ${t("billDue")} ${bill.dueAt}` : ""}
            </p>
            {bill.memo ? <p className="mt-2 text-sm text-muted">{bill.memo}</p> : null}
            <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
              <span className="text-sm text-muted">{t("amount")}</span>
              <span className="font-display text-2xl tabular-nums">{money(billDollars(bill), locale)}</span>
            </div>
            <p className="mt-1 text-xs text-subtle">{bill.number}</p>
          </div>
        ) : null}

        {bill && !canPay && !alreadyPaid ? (
          <p className="mt-6 rounded-xl bg-surface-2 p-4 text-sm text-muted">
            {bill.status === "void"
              ? "This bill was voided."
              : bill.status === "refunded"
                ? "This bill was refunded."
                : t("billInternalPay")}
          </p>
        ) : null}

        {search.paid && bill?.status === "sent" ? (
          <p className="mt-4 text-sm text-muted">We’re confirming your payment. This page updates when the bill is Paid.</p>
        ) : null}

        {canPay ? (
          <div className="mt-6 space-y-3 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border">
            <Button className="w-full" disabled={busy} onClick={() => void pay()}>
              <Lock className="size-4" />
              {t("pay")} · {money(billDollars(bill!), locale)}
            </Button>
            <p className="text-center text-xs text-subtle">{t("stripeMark")}</p>
          </div>
        ) : null}

        {alreadyPaid && bill ? (
          <div className="mt-6 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border">
            <span className="grid size-12 place-items-center rounded-full bg-ok text-primary-fg">
              <Check className="size-6" />
            </span>
            <p className="mt-3 font-display text-2xl">{t("paid")}</p>
            <p className="mt-1 text-sm text-muted">
              {t("paidTo")} {bill.daycareName} · {money(billDollars(bill), locale)}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {bill.receiptUrl ? (
                <Button asChild>
                  <a href={bill.receiptUrl} target="_blank" rel="noreferrer">
                    {t("viewReceipt")}
                  </a>
                </Button>
              ) : (
                <Button onClick={() => window.print()}>{t("printReceipt")}</Button>
              )}
              <Button variant="secondary" asChild>
                <Link to="/parent" search={{ tab: "payments" }}>
                  {t("payments")}
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
      </main>
    </Shell>
  );
}
