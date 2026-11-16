import { useEffect, useMemo, useState } from "react";
import {
  ATTENTION_DISMISS_KEY,
  parentAttentionFacts,
  providerAttentionFacts,
  readAttentionDismissals,
  splitAttention,
  writeAttentionDismissal,
  type AttentionDetail,
  type AttentionFact,
} from "@/lib/attention-list";
import { listCentreWaitlist, listMySpotOffers } from "@/lib/server/spot-offers";
import { listProviderBills } from "@/lib/server/billing";
import { listChildAgreements } from "@/lib/server/parent-agreement";
import { listInbox } from "@/lib/server/inbox";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";

const DETAIL_KEY: Record<AttentionDetail, CopyKey> = {
  tourUpdate: "attentionTourUpdate",
  spotOffer: "attentionSpotOffer",
  formDue: "attentionFormDue",
  invoiceDue: "attentionInvoiceDue",
  paymentFailed: "attentionPaymentFailed",
  unreadMessage: "attentionUnreadMessage",
  unreadParent: "attentionUnreadParent",
  newRequest: "attentionNewRequest",
  missingDoc: "attentionMissingDoc",
  offerWaiting: "attentionOfferWaiting",
  overdueInvoice: "attentionOverdueInvoice",
  staffCert: "attentionStaffCert",
  listingGap: "attentionListingGap",
};

export function AttentionList({
  userId,
  facts,
}: {
  userId: string;
  facts: readonly AttentionFact[];
}) {
  const { t } = useCopy();
  const [raw, setRaw] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(ATTENTION_DISMISS_KEY);
    } catch {
      return null;
    }
  });
  const [showDone, setShowDone] = useState(false);
  const buckets = splitAttention(facts, { dismissed: readAttentionDismissals(raw, userId) });

  function dismiss(id: string) {
    const next = writeAttentionDismissal(raw, userId, id, new Date().toISOString());
    try {
      window.localStorage.setItem(ATTENTION_DISMISS_KEY, next);
    } catch {
      /* private mode */
    }
    setRaw(next);
  }

  return (
    <section className="space-y-3" data-ke="attention-list">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-2xl">{t("attentionTitle")}</h2>
        <span className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full bg-primary px-2 text-xs font-medium text-primary-fg" data-ke="attention-count">
          {buckets.open.length}
        </span>
      </div>
      {buckets.open.length === 0 ? <p className="text-sm text-muted">{t("attentionEmpty")}</p> : null}
      <ul className="space-y-2">
        {buckets.open.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
            <div className="min-w-0">
              <a href={item.href} className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline">
                {item.title}
              </a>
              <p className="text-sm text-muted">{t(DETAIL_KEY[item.detail])}</p>
            </div>
            {item.dismissible ? (
              <Button type="button" variant="secondary" className="min-h-11 touch-manipulation" onClick={() => dismiss(item.id)}>
                {t("attentionDismiss")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {buckets.done.length ? (
        <div>
          <button
            type="button"
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary"
            aria-expanded={showDone}
            onClick={() => setShowDone((value) => !value)}
          >
            {t("attentionDone")} · {buckets.done.length}
          </button>
          {showDone ? (
            <ul className="mt-2 space-y-2">
              {buckets.done.map((item) => (
                <li key={item.id} className="rounded-xl border border-border bg-surface-2 p-4 text-sm text-muted">
                  <span className="font-medium text-fg">{item.title}</span>
                  <span> · {t(DETAIL_KEY[item.detail])}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function ParentAttention({
  userId,
  tours,
  bills,
  childIds = [],
}: {
  userId: string;
  tours: readonly { id: string; daycareId: string; daycareName: string; status: string; respondedAt?: string | null }[];
  bills: readonly { id: string; daycareId: string; daycareName: string; number: string; status: string; dueAt?: string | null; paidAt?: string | null }[];
  childIds?: readonly string[];
}) {
  const { locale } = useCopy();
  const [offers, setOffers] = useState<NonNullable<Parameters<typeof parentAttentionFacts>[0]["offers"]>>([]);
  const [messages, setMessages] = useState<NonNullable<Parameters<typeof parentAttentionFacts>[0]["messages"]>>([]);
  const [forms, setForms] = useState<NonNullable<Parameters<typeof parentAttentionFacts>[0]["forms"]>>([]);
  useEffect(() => {
    let live = true;
    void listMySpotOffers()
      .then((result) => {
        if (!live) return;
        setOffers(
          (result.rows ?? [])
            .filter((row) => row.offerId && row.offerStatus)
            .map((row) => ({
              id: row.offerId as string,
              daycareId: row.daycareId,
              daycareName: row.daycareName,
              status: row.offerStatus as string,
              expiresAt: row.expiresAt,
              resolvedAt: row.offerStatus === "open" ? null : row.expiresAt,
            })),
        );
      })
      .catch(() => {
        if (live) setOffers([]);
      });
    void listInbox({ data: { view: "family" } })
      .then((rows) => {
        if (!live) return;
        setMessages(
          rows
            .filter((row) => row.unread && row.daycareId)
            .map((row) => ({
              id: row.id,
              daycareId: row.daycareId,
              daycareName: row.daycareName,
              unread: true,
            })),
        );
      })
      .catch(() => {
        if (live) setMessages([]);
      });
    const ids = childIds.filter(Boolean);
    void Promise.all(ids.map((childId) => listChildAgreements({ data: { childId } }).catch(() => null))).then((packs) => {
      if (!live) return;
      const next = packs.flatMap((pack) =>
        (pack?.rows ?? [])
          .filter((row) => row.status === "sent")
          .map((row) => ({
            id: row.agreementId,
            daycareId: row.daycareId,
            daycareName: row.daycareName,
            title: row.childName || row.daycareName,
            status: "sent",
          })),
      );
      setForms(next);
    });
    return () => {
      live = false;
    };
  }, [userId, childIds.join("|")]);
  const facts = useMemo(
    () => parentAttentionFacts({ locale: locale === "fr" ? "fr" : "en", tours, bills, offers, messages, forms }),
    [locale, tours, bills, offers, messages, forms],
  );
  return <AttentionList userId={userId} facts={facts} />;
}

export function ProviderAttention({
  userId,
  requests,
  documents,
  listings,
  certs = [],
}: {
  userId: string;
  requests: readonly { id: string; daycareId: string; title: string; status: string; respondedAt?: string | null }[];
  documents: readonly { id: string; daycareId: string; title: string; status: string }[];
  listings: readonly { id: string; name: string; open: boolean }[];
  certs?: readonly { id: string; daycareId: string; title: string; expiresAt: string }[];
}) {
  const { locale } = useCopy();
  const [bills, setBills] = useState<Parameters<typeof providerAttentionFacts>[0]["bills"]>([]);
  const [offers, setOffers] = useState<Parameters<typeof providerAttentionFacts>[0]["offers"]>([]);
  const [messages, setMessages] = useState<Parameters<typeof providerAttentionFacts>[0]["messages"]>([]);
  useEffect(() => {
    let live = true;
    void listProviderBills()
      .then((result) => {
        if (!live) return;
        setBills(
          (result.bills ?? []).map((bill) => ({
            id: bill.id,
            daycareId: bill.daycareId,
            title: bill.number || bill.daycareName,
            status: bill.status,
            dueAt: bill.dueAt,
            paidAt: bill.paidAt,
          })),
        );
      })
      .catch(() => {
        if (live) setBills([]);
      });
    void listCentreWaitlist()
      .then((result) => {
        if (!live) return;
        const next = (result.centres ?? []).flatMap((centre) =>
          centre.families
            .filter((family) => family.status === "offered")
            .map((family) => ({
              id: family.id,
              daycareId: centre.daycareId,
              title: family.parentName || centre.daycareName,
              status: "open",
              expiresAt: null,
              resolvedAt: null,
            })),
        );
        setOffers(next);
      })
      .catch(() => {
        if (live) setOffers([]);
      });
    void listInbox({ data: { view: "centre" } })
      .then((rows) => {
        if (!live) return;
        setMessages(
          rows
            .filter((row) => row.unread && row.daycareId)
            .map((row) => ({
              id: row.id,
              daycareId: row.daycareId,
              // Centre inbox puts the parent's name in daycareName.
              title: row.daycareName.trim(),
              unread: true,
            })),
        );
      })
      .catch(() => {
        if (live) setMessages([]);
      });
    return () => {
      live = false;
    };
  }, [userId, requests.length]);
  const facts = useMemo(
    () =>
      providerAttentionFacts({
        locale: locale === "fr" ? "fr" : "en",
        requests,
        messages,
        documents,
        bills,
        offers,
        certs,
        listingGaps: listings.map((row) => ({ id: row.id, daycareId: row.id, title: row.name, open: row.open })),
      }),
    [locale, requests, messages, documents, bills, offers, certs, listings],
  );
  return <AttentionList userId={userId} facts={facts} />;
}
