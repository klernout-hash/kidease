import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { confirmInterac, createPayment, getFamily } from "@/lib/server/family";
import { useCopy } from "@/lib/use-copy";
import { useSessionDesks } from "@/components/desk-switcher";
import { LedgerHonesty } from "@/components/listing-status-badge";
import { money } from "@/lib/utils";
import { SUPPORT_INBOX_EMAIL } from "@/lib/support";
import type { Booking } from "@/lib/types";

export const Route = createFileRoute("/pay/$bookingId")({ component: PayPage });

function PayPage() {
  const { bookingId } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  const { t, locale } = useCopy();
  const { session: desks } = useSessionDesks();
  const stripeLive = Boolean(desks?.stripeLive);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [result, setResult] = useState<{ id: string; status: string; reference: string | null; amount: number } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    void getFamily()
      .then((f) => {
        const b = f.bookings.find((row) => row.id === bookingId) ?? null;
        setBooking(b);
        const paid = f.payments.find((p) => p.daycareId === b?.daycareId && p.status === "paid");
        if (b?.paymentStatus === "paid" && paid) {
          setResult({ id: paid.id, status: paid.status, reference: paid.reference, amount: paid.amount });
        }
      })
      .catch(() => undefined);
  }, [user, bookingId]);

  if (isPending) {
    return (
      <Shell>
        <p className="p-8 text-muted">{t("loading")}</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;

  const alreadyPaid = booking?.status === "active" || booking?.paymentStatus === "paid" || result?.status === "paid";
  const canStartInterac = Boolean(booking?.status === "accepted" && booking.paymentStatus !== "paid" && !result);

  async function startInterac() {
    if (!canStartInterac) return;
    setBusy(true);
    try {
      const res = await createPayment({ data: { bookingId, method: "interac", locale } });
      setResult(res);
      if (res.status === "paid") toast.error(t("interacPendingReview"));
      else toast.success(t("interacPendingReview"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("notApprovedPay"));
    } finally {
      setBusy(false);
    }
  }

  async function reportSent() {
    if (!result?.id) return;
    setBusy(true);
    try {
      const res = await confirmInterac({ data: { paymentId: result.id, locale } });
      setResult({ ...result, status: res.status || "pending_review" });
      toast.success(t("interacPendingReview"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("interacPendingReview"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <main className="mx-auto max-w-lg px-4 py-8">
        <Link to="/account" className="text-sm text-muted hover:text-fg">
          ← {t("account")}
        </Link>
        <h1 className="mt-3 font-display text-3xl">{alreadyPaid ? t("receiptTitle") : t("payTitle")}</h1>
        <p className="mt-2 text-sm text-muted">{alreadyPaid ? t("receiptLead") : t("bookingPayLeadHonest")}</p>
        <LedgerHonesty stripeLive={stripeLive} surface="booking" className="mt-3" />
        <p className="mt-4 rounded-xl bg-surface p-4 text-sm text-muted ring-1 ring-border">{t("bookingPayDisabled")}</p>

        {booking ? (
          <div className="mt-6 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border">
            <p className="text-xs font-medium uppercase tracking-wide text-subtle">{t("payWhat")}</p>
            <p className="mt-1 font-display text-2xl">{booking.daycareName}</p>
            <p className="mt-1 text-sm text-muted">
              {booking.childName ? `${booking.childName} · ` : ""}
              {t(booking.ageGroup)} · {t("desiredStart")} {booking.startDate ?? booking.startMonth}
            </p>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
              <span className="text-sm text-muted">{t("payFor")}</span>
              <span className="font-display text-2xl tabular-nums">{money(booking.monthlyAmount, locale)}</span>
            </div>
          </div>
        ) : null}

        {booking && !canStartInterac && !alreadyPaid && !result ? (
          <p className="mt-6 rounded-xl bg-surface-2 p-4 text-sm text-muted">{t("notApprovedPay")}</p>
        ) : null}

        {canStartInterac ? (
          <div className="mt-6 space-y-4 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border">
            <p className="text-sm font-medium">{t("interac")}</p>
            <p className="text-sm text-muted">{t("interacHint")}</p>
            <Button className="w-full" disabled={busy} onClick={() => void startInterac()}>
              {t("interacSentCta")}
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" asChild>
                <Link to="/parent">{t("payUseBill")}</Link>
              </Button>
              <Button variant="secondary" asChild>
                <a href={`mailto:${SUPPORT_INBOX_EMAIL}`}>{SUPPORT_INBOX_EMAIL}</a>
              </Button>
            </div>
          </div>
        ) : null}

        {result && !alreadyPaid ? (
          <div className="mt-6 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border">
            <p className="font-display text-2xl">{t("pending")}</p>
            <p className="mt-1 text-sm text-muted">{t("interacPendingReview")}</p>
            {result.reference ? (
              <p className="mt-3 text-sm">
                {t("receiptNo")} <span className="font-medium tabular-nums">{result.reference}</span>
              </p>
            ) : null}
            {booking ? (
              <p className="mt-1 text-sm text-muted">
                {booking.daycareName} · {money(result.amount, locale)}
              </p>
            ) : null}
            <Button className="mt-4" disabled={busy} onClick={() => void reportSent()}>
              {t("interacSentCta")}
            </Button>
          </div>
        ) : null}

        {alreadyPaid && result ? (
          <div className="mt-6 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border">
            <p className="font-display text-2xl">{t("paid")}</p>
            <p className="mt-1 text-sm text-muted">{t("receiptLead")}</p>
            {result.reference ? (
              <p className="mt-3 text-sm">
                {t("receiptNo")} <span className="font-medium tabular-nums">{result.reference}</span>
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => window.print()}>{t("printReceipt")}</Button>
              <Button variant="secondary" asChild>
                <Link to="/account">{t("account")}</Link>
              </Button>
            </div>
          </div>
        ) : null}
      </main>
    </Shell>
  );
}
