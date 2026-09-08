import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { DeskShell } from "@/components/desk-shell";
import { EmptyState } from "@/components/empty-state";
import { DeskSkeleton } from "@/components/page-skeleton";
import { PipelineBadge } from "@/components/pipeline-badge";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/session-desks";
import { parentNavSearch, providerNavSearch } from "@/lib/desk-nav";
import { inboxSearch, resolveInboxView, type InboxView } from "@/lib/inbox-view";
import { listInbox } from "@/lib/server/inbox";
import { useCopy } from "@/lib/use-copy";
import type { Conversation } from "@/lib/types";

export function InboxList() {
  const { user, isPending } = useCurrentUserState();
  const { t } = useCopy();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { view?: unknown };
  const { sticky } = useSessionDesks();
  const view: InboxView = resolveInboxView({ search: search.view, sticky });
  const [items, setItems] = useState<Conversation[] | null>(null);

  useEffect(() => {
    if (!user) return;
    void listInbox({ data: { view } })
      .then(setItems)
      .catch(() => setItems([]));
  }, [user, view]);

  if (isPending) {
    return (
      <Shell>
        <DeskSkeleton />
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;

  const list = (
    <div>
      {view === "centre" ? (
        <>
          <h2 className="font-display text-2xl">{t("inboxCentreTitle")}</h2>
          <p className="mt-2 text-sm text-muted">{items && items.length ? t("inboxHasThreads") : t("noInboxCentreLead")}</p>
        </>
      ) : (
        <>
          <h2 className="font-display text-2xl">{t("inboxFamilyTitle")}</h2>
          {items && items.length ? <p className="mt-2 text-sm text-muted">{t("inboxHasThreads")}</p> : null}
        </>
      )}
      <ul className="mt-6 divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
        {items === null ? (
          <li className="space-y-3 p-4" aria-hidden="true">
            <div className="ke-skel h-14 w-full rounded-xl" />
            <div className="ke-skel h-14 w-full rounded-xl" />
            <div className="ke-skel h-14 w-full rounded-xl" />
          </li>
        ) : items.length === 0 ? (
          <li className="p-2">
            {view === "centre" ? (
              <EmptyState
                title={t("noInboxCentre")}
                body={t("noInboxCentreLead")}
                action={t("emptyProviderInboxCta")}
                actionTo="/provider"
              />
            ) : (
              <EmptyState title={t("noInbox")} body={t("noInboxLead")} action={t("emptyFindCare")} actionTo="/search" />
            )}
          </li>
        ) : (
          items.map((c) => (
            <li key={c.id}>
              <Link
                to="/inbox/$id"
                params={{ id: c.id }}
                search={inboxSearch(view)}
                className="flex items-center gap-3 p-4 hover:bg-bg"
              >
                <img src={c.photo} alt="" className="size-12 rounded-md object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{c.daycareName}</p>
                    {c.tourStatus || c.status ? (
                      <PipelineBadge tourStatus={c.tourStatus} bookingStatus={c.status} />
                    ) : null}
                    {c.unread ? (
                      <span className="grid size-2 shrink-0 place-items-center rounded-full bg-danger" aria-label="Unread" />
                    ) : null}
                  </div>
                  <p className="truncate text-sm text-muted">{c.lastBody}</p>
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );

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
