import { Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/empty-state";
import { LeadKindChip, LeadStatusChip } from "@/components/lead-status-chip";
import { Button } from "@/components/ui/button";
import type { LeadRequest } from "@/lib/lead-requests";
import { useCopy } from "@/lib/use-copy";

export function ParentRequestsList({ items }: { items: LeadRequest[] }) {
  const { t, locale } = useCopy();
  if (!items.length) {
    return (
      <EmptyState title={t("noRequests")} body={t("noRequestsLead")} action={t("emptyFindCare")} actionTo="/search" />
    );
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
      {items.map((lead) => (
        <li key={lead.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/daycare/$slug" params={{ slug: lead.daycareSlug }} className="font-medium hover:underline">
                {lead.daycareName}
              </Link>
              <LeadKindChip kind={lead.kind} />
              <LeadStatusChip status={lead.status} />
            </div>
            {lead.message ? <p className="mt-1 text-sm text-muted">{lead.message}</p> : null}
            {lead.replyNote ? (
              <p className="mt-1 text-sm">
                <span className="text-subtle">{t("leadCentreReply")}: </span>
                {lead.replyNote}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-subtle">
              {new Date(lead.createdAt).toLocaleString(locale === "fr" ? "fr-CA" : "en-CA", {
                dateStyle: "medium",
              })}
            </p>
          </div>
          {lead.conversationId ? (
            <Button size="sm" variant="secondary" asChild>
              <Link to="/inbox/$id" params={{ id: lead.conversationId }}>
                {t("openChat")}
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="secondary" asChild>
              <Link to="/daycare/$slug" params={{ slug: lead.daycareSlug }}>
                {t("viewListing")}
              </Link>
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
