import { createFileRoute } from "@tanstack/react-router";
import { InboxMessageRow } from "@/components/inbox-row";
import { Shell } from "@/components/shell";
import { ensureFrenchCopy } from "@/lib/copy-runtime";
import { ENGAGEMENT_FOLLOWUPS, messageReceipt } from "@/lib/engagement";
import { isVercelProduction } from "@/lib/channel-readiness";
import { useCopy } from "@/lib/use-copy";
import { useEffect, useState } from "react";

export function engagementPreviewEnabled(): boolean {
  return !isVercelProduction();
}

export const Route = createFileRoute("/preview/engagement")({
  validateSearch: (search: Record<string, unknown>) => ({
    look: search.look === "dark" ? ("dark" as const) : ("light" as const),
  }),
  head: () => ({
    meta: [
      { title: "Engagement preview · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EngagementPreview,
});

function EngagementPreview() {
  const { look } = Route.useSearch();
  const { t, locale } = useCopy();
  const open = engagementPreviewEnabled();
  const receipt = messageReceipt({ seenInApp: true });
  const [copyReady, setCopyReady] = useState(locale !== "fr");
  useEffect(() => {
    document.documentElement.setAttribute("data-resolved-theme", look);
  }, [look]);
  useEffect(() => {
    if (locale !== "fr") {
      setCopyReady(true);
      return;
    }
    let live = true;
    void ensureFrenchCopy().then(() => {
      if (live) setCopyReady(true);
    });
    return () => {
      live = false;
    };
  }, [locale]);
  if (!open) {
    return (
      <Shell>
        <main className="mx-auto max-w-lg px-4 py-10">
          <h1 className="font-display text-2xl">{locale === "fr" ? "Aperçu fermé" : "Preview closed"}</h1>
        </main>
      </Shell>
    );
  }
  if (!copyReady) {
    return (
      <Shell>
        <main className="mx-auto max-w-lg px-4 py-10" />
      </Shell>
    );
  }
  return (
    <Shell>
      <main className="mx-auto w-full max-w-lg px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))]" data-ke="engagement-preview">
        <p className="text-sm text-muted">{locale === "fr" ? "Aperçu. Aucun message n’a été envoyé." : "Preview. No message was sent."}</p>
        <h1 className="mt-2 font-display text-2xl">{locale === "fr" ? "Messages" : "Messages"}</h1>
        <ul className="mt-4 overflow-hidden rounded-xl bg-surface ring-1 ring-border">
          <li>
            <InboxMessageRow
              view="centre"
              row={{
                id: "preview-thread",
                parentName: "Alex",
                preview: "Can we visit this week?",
                daycareName: "Example centre",
                unread: true,
                tourStatus: "pending",
                status: null,
              }}
            />
          </li>
        </ul>
        <p className="mt-4 text-sm" data-ke="engagement-receipt">
          {t(receipt.label === "seen_in_kidease" ? "inboxSeenHere" : "inboxPhoneNotSent")}
        </p>
        <p className="mt-2 text-sm" data-ke="engagement-phone">{t("inboxPhoneNotSent")}</p>
        <p className="mt-4 text-sm" data-ke="waitlist-not-a-spot">{t("waitlistNotASpot")}</p>
        <p className="mt-4 text-sm">{t("inboxAssignLead")}</p>
        <ul className="mt-6 space-y-2 text-sm text-muted">
          {ENGAGEMENT_FOLLOWUPS.map((item) => (
            <li key={item.id}>{item.reason}</li>
          ))}
        </ul>
      </main>
    </Shell>
  );
}
