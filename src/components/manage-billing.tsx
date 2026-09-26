import { useEffect } from "react";
import { confirmSuccess } from "@/lib/success-confirm";
import { Button } from "@/components/ui/button";
import {
  PAYMENT_FAILED_NOTICE,
  billingPriceLabel,
  billingProductName,
  billingStatusLine,
  cancelEndCopy,
  subscriptionAccessOpen,
  type BillingProduct,
} from "@/lib/subscription-lifecycle";

export function announceCancel(input: {
  product: BillingProduct;
  periodEnd: string | null;
  locale: "en" | "fr";
}) {
  const key = `kidease-cancel-notice:${input.product}:${input.periodEnd || "period"}`;
  try {
    if (window.sessionStorage.getItem(key) === "1") return;
    window.sessionStorage.setItem(key, "1");
  } catch {
    /* Still show the notice. A refresh may show it once more. */
  }
  const copy = cancelEndCopy({
    product: input.product,
    endsAtIso: input.periodEnd,
    locale: input.locale,
  });
  confirmSuccess({
    variant: "modal",
    kicker: input.locale === "fr" ? "Planifié" : "Scheduled",
    title: copy.title,
    body: copy.body,
    quiet: true,
  });
}

export function ManageBillingCard({
  locale,
  product,
  interval,
  status,
  periodEnd,
  cancelAtPeriodEnd,
  billingReturn,
  busy,
  onPortal,
  onCancel,
  onResume,
}: {
  locale: "en" | "fr";
  product: BillingProduct;
  interval: "month" | "year";
  status: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  billingReturn?: boolean;
  busy: boolean;
  onPortal: () => void;
  onCancel: () => void;
  onResume: () => void;
}) {
  const open = subscriptionAccessOpen(status);
  useEffect(() => {
    if (!billingReturn || !cancelAtPeriodEnd) return;
    announceCancel({ product, periodEnd, locale });
  }, [billingReturn, cancelAtPeriodEnd, product, periodEnd, locale]);

  if (!open) return null;
  const pastDue = String(status || "").toLowerCase() === "past_due";
  const statusLine = billingStatusLine({ cancelAtPeriodEnd, periodEnd, locale });
  return (
    <section className="rounded-xl bg-surface px-5 py-5 ring-1 ring-border" data-ke="manage-or-cancel">
      <h3 className="font-display text-lg">{locale === "fr" ? "Gérer ou annuler" : "Manage or cancel"}</h3>
      <p className="mt-2 text-sm font-medium" data-ke="billing-plan">
        {billingProductName(product, locale)}
      </p>
      <p className="text-sm text-muted" data-ke="billing-price">
        {billingPriceLabel({ product, interval, locale })}
      </p>
      <p className="mt-1 text-sm" data-ke={cancelAtPeriodEnd ? "billing-cancels-on" : "billing-renewal"}>
        {statusLine}
      </p>
      {cancelAtPeriodEnd ? (
        <p className="mt-1 text-sm text-muted">
          {product === "featured_city"
            ? locale === "fr"
              ? "La mise en avant s’arrête alors. Le forfait du centre ne change pas."
              : "The search pin turns off then. Your centre plan is unchanged."
            : locale === "fr"
              ? "Vous resterez sur Gratuit."
              : "You'll stay on Free."}
        </p>
      ) : null}
      {pastDue ? (
        <p className="mt-3 text-sm text-muted" data-ke="billing-payment-notice">
          {PAYMENT_FAILED_NOTICE[locale]}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" className="min-h-11" disabled={busy} onClick={onPortal}>
          {locale === "fr" ? "Gérer ou annuler" : "Manage or cancel"}
        </Button>
        {cancelAtPeriodEnd ? (
          <Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={onResume} data-ke="billing-resume">
            {locale === "fr" ? "Reprendre" : "Resume"}
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            disabled={busy}
            onClick={onCancel}
            data-ke="billing-cancel-period-end"
          >
            {locale === "fr" ? "Annuler en fin de période" : "Cancel at period end"}
          </Button>
        )}
      </div>
    </section>
  );
}
