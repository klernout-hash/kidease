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
import { WalletMethodHints } from "@/components/wallet-methods";
import { openStripeCheckout } from "@/lib/wallets";
import { NativePayNote } from "@/components/native-pay-note";
import { useInNativeShell } from "@/lib/use-native-shell";
import { CaslConsentFields } from "@/components/casl-consent-fields";
import { getMyCaslConsents, saveMyCaslConsents } from "@/lib/server/casl-consent-api";
import type { CaslPrefs } from "@/lib/casl";

export const Route = createFileRoute("/pay/bill/$billId")({
  validateSearch: (s: Record<string, unknown>) => {
    if (s.paid === "1" || s.paid === 1 || s.paid === true) return { paid: "1" as const };
    return {};
  },
  component: PayBillPage,
});

function PayBillPage() {
  const nativePay = useInNativeShell();
  const { billId } = Route.useParams();
  const search = Route.useSearch();
  const { user, isPending } = useCurrentUserState();
  const { t, locale } = useCopy();
  const [bill, setBill] = useState<Bill | null>(null);
  const [stripeLive, setStripeLive] = useState(false);
  const [serviceFee, setServiceFee] = useState<{
    feeCents: number;
    parentPaysCents: number;
    label: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const [consents, setConsents] = useState<CaslPrefs>({
    smsService: false,
    emailService: false,
    emailCommercial: false,
  });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void getBill({ data: billId })
      .then((res) => {
        if (cancelled) return;
        setBill(res.bill);
        setStripeLive(res.stripeLive);
        setServiceFee(res.serviceFee ?? null);
        setMissing(false);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    void getMyCaslConsents()
      .then((row) => {
        if (cancelled) return;
        setConsents({
          smsService: row.smsService,
          emailService: row.emailService,
          emailCommercial: row.emailCommercial,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user, billId]);

  useEffect(() => {
    if (!search.paid || !user) return;
    const tmr = window.setTimeout(() => {
      void getBill({ data: billId })
        .then((res) => {
          setBill(res.bill);
          setStripeLive(res.stripeLive);
          setServiceFee(res.serviceFee ?? null);
        })
        .catch(() => undefined);
    }, 1200);
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
  if (nativePay) {
    return (
      <Shell>
        <NativePayNote locale={locale} />
      </Shell>
    );
  }

  const alreadyPaid = bill?.status === "paid";
  const canPay = Boolean(stripeLive && bill?.status === "sent");

  async function pay() {
    if (!canPay || !bill) return;
    setBusy(true);
    try {
      await saveMyCaslConsents({
        data: { ...consents, locale: locale === "fr" ? "fr" : "en", method: "checkout_checkbox" },
      }).catch(() => undefined);
      const res = await createBillCheckout({
        data: { billId: bill.id, locale: locale === "fr" ? "fr" : "en" },
      });
      if (res.alreadyPaid) {
        toast.success(t("paid"));
        const latest = await getBill({ data: bill.id });
        setBill(latest.bill);
        setStripeLive(latest.stripeLive);
        setServiceFee(latest.serviceFee ?? null);
        return;
      }
      if (res.url) {
        await openStripeCheckout(res.url);
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
        <LedgerHonesty stripeLive={stripeLive} surface="bill" className="mt-3" />

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
            <div className="mt-4 space-y-2 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted">{t("centreBill")}</span>
                <span className="tabular-nums">{money(billDollars(bill), locale)}</span>
              </div>
              {serviceFee && serviceFee.feeCents > 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted">{serviceFee.label}</span>
                  <span className="tabular-nums">{money(serviceFee.feeCents / 100, locale)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
                <span className="text-sm font-medium">{alreadyPaid ? t("paid") : t("youPay")}</span>
                <span className="font-display text-2xl tabular-nums">
                  {money((serviceFee?.parentPaysCents ?? bill.amountCents) / 100, locale)}
                </span>
              </div>
            </div>
            <p className="mt-1 text-xs text-subtle">
              {t("payCadNote")} · {bill.number}
            </p>
            <p className="mt-3 text-sm text-muted">{t("connectFeeParentPay")}</p>
          </div>
        ) : null}

        {bill && !canPay && !alreadyPaid ? (
          <div className="mt-6 space-y-3 rounded-xl bg-surface-2 p-4">
            <p className="text-sm text-muted">
              {bill.status === "void"
                ? "This bill was voided."
                : bill.status === "refunded"
                  ? "This bill was refunded."
                  : t("billInternalPay")}
            </p>
            {!stripeLive ? <WalletMethodHints stripeLive={false} /> : null}
          </div>
        ) : null}

        {search.paid && bill?.status === "sent" ? (
          <p className="mt-4 text-sm text-muted">We’re confirming your payment. This page updates when the bill is Paid.</p>
        ) : null}

        {canPay ? (
          <div className="mt-6 space-y-3 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border">
            <CaslConsentFields value={consents} onChange={setConsents} showEmailService={false} />
            <Button className="w-full" disabled={busy} onClick={() => void pay()}>
              <Lock className="size-4" />
              {t("pay")} · {money((serviceFee?.parentPaysCents ?? bill!.amountCents) / 100, locale)}
            </Button>
            <WalletMethodHints stripeLive={stripeLive} />
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
              {t("paidTo")} {bill.daycareName} · {money((serviceFee?.parentPaysCents ?? bill.amountCents) / 100, locale)}
            </p>
            {serviceFee && serviceFee.feeCents > 0 ? (
              <p className="mt-2 text-sm text-muted">
                {serviceFee.label} · {money(serviceFee.feeCents / 100, locale)}
              </p>
            ) : null}
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
