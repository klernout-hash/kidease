import { createFileRoute } from "@tanstack/react-router";
import { InboxMessageRow } from "@/components/inbox-row";
import { Shell } from "@/components/shell";
import { ensureFrenchCopy } from "@/lib/copy-runtime";
import { messageReceipt } from "@/lib/engagement";
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
  const receipt = messageReceipt({ userId: "preview", seenInApp: true, pushState: "not_sent" });
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
        <p className="text-sm font-medium text-primary" data-ke="engagement-not-inbox">
          {locale === "fr" ? "Ceci n’est pas la boîte de réception." : "This is not the inbox."}
        </p>
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
          {receipt.phone === "not_sent" ? t("inboxPhoneNotSentTo").replace("{name}", "Alex") : t("inboxSeenHere")}
        </p>
        <p className="mt-4 text-sm" data-ke="waitlist-not-a-spot">{t("waitlistNotASpot")}</p>
        <p className="mt-4 text-sm">{t("inboxAssignLead")}</p>
      </main>
    </Shell>
  );
}
