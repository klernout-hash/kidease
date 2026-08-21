import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Lock } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { confirmInterac, createPayment, getFamily } from "@/lib/server/family";
import { useCopy } from "@/lib/use-copy";
import { money } from "@/lib/utils";
import type { Booking, PayMethod } from "@/lib/types";

export const Route = createFileRoute("/pay/$bookingId")({ component: PayPage });

const METHODS: PayMethod[] = ["apple", "google", "card", "interac", "paypal"];

function PayPage() {
  const { bookingId } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  const { t, locale } = useCopy();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [method, setMethod] = useState<PayMethod>("apple");
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

  const canPay = booking?.status === "accepted" && booking.paymentStatus !== "paid";
  const alreadyPaid = booking?.status === "active" || booking?.paymentStatus === "paid" || result?.status === "paid";

  async function pay() {
    if (!canPay) return;
    setBusy(true);
    try {
      const res = await createPayment({ data: { bookingId, method, locale } });
      setResult(res);
      if (res.status === "paid") toast.success(t("paid"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("notApprovedPay"));
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
        <p className="mt-2 text-sm text-muted">{alreadyPaid ? t("receiptLead") : t("payLead")}</p>

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

        {booking && !canPay && !alreadyPaid ? (
          <p className="mt-6 rounded-xl bg-surface-2 p-4 text-sm text-muted">{t("notApprovedPay")}</p>
        ) : null}

        {canPay && !result ? (
          <div className="mt-6 space-y-4 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border">
            <p className="text-sm font-medium">{t("method")}</p>
            <div className="grid gap-2">
              {METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={
                    method === m
                      ? "rounded-md bg-primary px-3 py-3 text-left text-sm text-primary-fg"
                      : "rounded-md px-3 py-3 text-left text-sm ring-1 ring-border"
                  }
                >
                  {t(m)}
                </button>
              ))}
            </div>
            {method === "card" ? (
              <div className="grid gap-2">
                <input className="ke-input" placeholder={t("cardNumber")} autoComplete="cc-number" />
                <div className="grid grid-cols-2 gap-2">
                  <input className="ke-input" placeholder={t("expiry")} autoComplete="cc-exp" />
                  <input className="ke-input" placeholder={t("cvc")} autoComplete="cc-csc" />
                </div>
              </div>
            ) : null}
            {method === "interac" ? <p className="text-sm text-muted">{t("interacHint")}</p> : null}
            <Button className="w-full" disabled={busy} onClick={() => void pay()}>
              <Lock className="size-4" />
              {t("payNow")} · {booking ? money(booking.monthlyAmount, locale) : ""}
            </Button>
            <p className="text-center text-xs text-subtle">{t("stripeMark")}</p>
          </div>
        ) : null}

        {result ? (
          <div className="mt-6 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border">
            <span className="grid size-12 place-items-center rounded-full bg-ok text-primary-fg">
              <Check className="size-6" />
            </span>
            <p className="mt-3 font-display text-2xl">{result.status === "paid" ? t("paid") : t("pending")}</p>
            <p className="mt-1 text-sm text-muted">{t("receiptLead")}</p>
            {result.reference ? (
              <p className="mt-3 text-sm">
                {t("receiptNo")} <span className="font-medium tabular-nums">{result.reference}</span>
              </p>
            ) : null}
            {booking ? (
              <p className="mt-1 text-sm text-muted">
                {t("paidTo")} {booking.daycareName} · {money(result.amount, locale)}
              </p>
            ) : null}
            {result.status === "pending" ? (
              <Button
                className="mt-4"
                onClick={() =>
                  void confirmInterac({ data: { paymentId: result.id, locale } }).then(() => {
                    setResult({ ...result, status: "paid" });
                    toast.success(t("paid"));
                  })
                }
              >
                {t("paid")}
              </Button>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => window.print()}>{t("printReceipt")}</Button>
                <Button variant="secondary" onClick={() => void navigate({ to: "/account" })}>
                  {t("account")}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </main>
    </Shell>
  );
}
