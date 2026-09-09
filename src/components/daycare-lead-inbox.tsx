import { useState } from "react";
import { Inbox } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { LeadKindChip, LeadStatusChip } from "@/components/lead-status-chip";
import { Button } from "@/components/ui/button";
import { updateLeadRequest } from "@/lib/server/lead-requests";
import type { LeadAction, LeadRequest } from "@/lib/lead-requests";
import { isOpenLeadStatus, nextLeadStatus } from "@/lib/lead-requests";
import { useCopy } from "@/lib/use-copy";

export function DaycareLeadInbox({
  items,
  onChanged,
}: {
  items: LeadRequest[];
  onChanged: () => void;
}) {
  const { t, locale } = useCopy();
  const waiting = items.filter((row) => isOpenLeadStatus(row.status));
  const later = items.filter((row) => !isOpenLeadStatus(row.status));

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">{t("leadInbox")}</h2>
        <p className="mt-1 text-sm text-muted">{t("leadInboxLead")}</p>
      </div>
      <LeadInboxList
        items={waiting}
        empty={t("providerRequestsEmpty")}
        onChanged={onChanged}
        locale={locale}
        canAct
      />
      {later.length ? (
        <div>
          <h3 className="font-display text-xl">{t("leadInboxLater")}</h3>
          <div className="mt-3">
            <LeadInboxList items={later} empty="" onChanged={onChanged} locale={locale} canAct />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function LeadInboxList({
  items,
  empty,
  onChanged,
  locale,
  canAct,
}: {
  items: LeadRequest[];
  empty: string;
  onChanged: () => void;
  locale: string;
  canAct: boolean;
}) {
  const { t } = useCopy();
  if (!items.length) {
    return empty ? (
      <EmptyState
        icon={Inbox}
        title={empty}
        body={t("providerRequestsEmptyLead")}
      />
    ) : null;
  }
  return (
    <ul className="space-y-3">
      {items.map((lead) => (
        <li key={lead.id} className="rounded-xl bg-surface p-4 ring-1 ring-border">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{lead.parentName || t("parentLabel")}</p>
                <LeadKindChip kind={lead.kind} />
                <LeadStatusChip status={lead.status} />
              </div>
              <Link to="/daycare/$slug" params={{ slug: lead.daycareSlug }} className="mt-1 block text-sm text-muted hover:underline">
                {lead.daycareName}
              </Link>
              {lead.message ? (
                <p className="mt-2 text-sm">
                  <span className="text-subtle">{t("leadParentNote")}: </span>
                  {lead.message}
                </p>
              ) : null}
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
            ) : null}
          </div>
          {canAct ? <LeadActions lead={lead} onChanged={onChanged} /> : null}
        </li>
      ))}
    </ul>
  );
}

function LeadActions({ lead, onChanged }: { lead: LeadRequest; onChanged: () => void }) {
  const { t } = useCopy();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<LeadAction | null>(null);
  const actions = (["confirm", "decline", "answered"] as const).filter((action) => nextLeadStatus(lead.status, action));
  if (!actions.length) return null;

  async function decide(action: LeadAction) {
    setBusy(action);
    try {
      await updateLeadRequest({ data: { leadId: lead.id, action, note: note.trim() || undefined } });
      toast.success(t("leadUpdated"));
      setNote("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tourRespondFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 space-y-2 border-t border-border pt-3">
      <label className="block text-sm">
        {t("leadReplyNote")}
        <textarea
          rows={2}
          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
          placeholder={t("leadReplyNotePh")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {actions.includes("confirm") ? (
          <Button size="sm" disabled={busy !== null} onClick={() => void decide("confirm")}>
            {busy === "confirm" ? t("loading") : t("leadConfirm")}
          </Button>
        ) : null}
        {actions.includes("answered") ? (
          <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void decide("answered")}>
            {busy === "answered" ? t("loading") : t("leadAnswered")}
          </Button>
        ) : null}
        {actions.includes("decline") ? (
          <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void decide("decline")}>
            {busy === "decline" ? t("loading") : t("leadDecline")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
