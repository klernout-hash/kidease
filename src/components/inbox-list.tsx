import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { DeskShell } from "@/components/desk-shell";
import { EmptyState } from "@/components/empty-state";
import { DeskSkeleton } from "@/components/page-skeleton";
import { InboxMessageRow } from "@/components/inbox-row";
import { PipelineBadge } from "@/components/pipeline-badge";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/session-desks";
import { parentNavSearch, providerNavSearch } from "@/lib/desk-nav";
import { resolveInboxView, type InboxView } from "@/lib/inbox-view";
import { listInbox } from "@/lib/server/inbox";
import { filterInboxList, MESSAGE_FILTERS, messageFilterCopyKey, parseMessageFilter, type MessageFilter } from "@/lib/inbox-thread-ui";
import { useCopy } from "@/lib/use-copy";
import type { CentreInboxThread } from "@/lib/inbox-stages";
import { cn } from "@/lib/utils";

export function InboxList({ bare = false }: { bare?: boolean }) {
  const { user, isPending } = useCurrentUserState();
  const { t } = useCopy();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { view?: unknown };
  const { sticky } = useSessionDesks();
  const view: InboxView = resolveInboxView({ search: search.view, sticky });
  const [items, setItems] = useState<CentreInboxThread[] | null>(null);
  const [filter, setFilter] = useState<MessageFilter>("all");

  useEffect(() => {
    if (!user?.id) return;
    void listInbox({ data: { view } })
      .then((rows) => setItems(rows as CentreInboxThread[]))
      .catch(() => setItems([]));
  }, [user?.id, view]);

  const visible = useMemo(
    () => (items ? filterInboxList(items, { filter }) : []),
    [items, filter],
  );

  if (isPending) {
    if (bare) return <DeskSkeleton />;
    return (
      <Shell>
        <DeskSkeleton />
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;

  const list = (
    <div>
      <h2 className="font-display text-[clamp(1.6rem,4vw,2rem)]">{t("messages")}</h2>
      {view === "centre" ? (
        <p className="mt-1 text-sm text-muted">{t("inboxCentreTitle")}</p>
      ) : items && items.length ? (
        <p className="mt-1 text-sm text-muted">{t("inboxHasThreads")}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-1.5" data-ke="inbox-stage-filters" role="group" aria-label={t("messages")}>
        {MESSAGE_FILTERS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(parseMessageFilter(id))}
            className={cn(
              "min-h-11 whitespace-nowrap rounded-full px-4 text-sm font-medium touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              filter === id ? "bg-fg text-bg" : "bg-surface text-fg ring-1 ring-border",
            )}
          >
            {t(messageFilterCopyKey(id, view === "centre" ? "centre" : "family"))}
          </button>
        ))}
      </div>
      <ul className="mt-2">
        {items === null ? (
          <li className="space-y-3 p-4" aria-hidden="true">
            <div className="ke-skel h-16 w-full rounded-xl" />
            <div className="ke-skel h-16 w-full rounded-xl" />
            <div className="ke-skel h-16 w-full rounded-xl" />
          </li>
        ) : visible.length === 0 ? (
          <li className="p-2">
            {items.length === 0 ? (
              view === "centre" ? (
                <EmptyState
                  title={t("noInboxCentre")}
                  body={t("noInboxCentreLead")}
                  action={t("emptyProviderInboxCta")}
                  actionTo="/inbox?view=centre"
                />
              ) : (
                <EmptyState title={t("noInbox")} body={t("noInboxLead")} action={t("emptyFindCare")} actionTo="/search" />
              )
            ) : (
              <EmptyState
                title={t("inboxNothingInFilter").replace("{filter}", t(messageFilterCopyKey(filter, view === "centre" ? "centre" : "family")))}
                body={t("inboxClearFilters")}
                action={t("inboxClearFilters")}
                onAction={() => setFilter("all")}
              />
            )}
          </li>
        ) : (
          visible.map((row) => (
            <li key={row.id}>
              <InboxMessageRow row={row} view={view} />
              <PipelineBadge className="sr-only" tourStatus={row.tourStatus} bookingStatus={row.status} />
            </li>
          ))
        )}
      </ul>
    </div>
  );

  if (bare) return list;

  if (view === "centre") {
    return (
      <DeskShell
        desk="daycare"
        active="messages"
        onSelect={(id) => {
          if (id === "messages") return;
          void navigate({ to: "/provider", search: providerNavSearch(id) });
        }}
      >
        {list}
      </DeskShell>
    );
  }

  return (
    <DeskShell
      desk="parent"
      active="messages"
      onSelect={(id) => {
        if (id === "messages") return;
        void navigate({ to: "/parent", search: parentNavSearch(id) });
      }}
    >
      {list}
    </DeskShell>
  );
}
