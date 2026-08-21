import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { StatusBadge } from "@/components/status-badge";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listInbox } from "@/lib/server/family";
import { useCopy } from "@/lib/use-copy";
import type { Conversation } from "@/lib/types";

export function InboxList() {
  const { user, isPending } = useCurrentUserState();
  const { t } = useCopy();
  const [items, setItems] = useState<Conversation[] | null>(null);

  useEffect(() => {
    if (!user) return;
    void listInbox()
      .then(setItems)
      .catch(() => setItems([]));
  }, [user]);

  if (isPending) {
    return (
      <Shell>
        <p className="p-8 text-muted">{t("loading")}</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;

  return (
    <Shell>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="font-display text-3xl">{t("inbox")}</h1>
        <ul className="mt-6 divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
          {items === null ? (
            <li className="p-6 text-muted">{t("loading")}</li>
          ) : items.length === 0 ? (
            <li className="p-8 text-center text-muted">{t("noInbox")}</li>
          ) : (
            items.map((c) => (
              <li key={c.id}>
                <Link to="/inbox/$id" params={{ id: c.id }} className="flex items-center gap-3 p-4 hover:bg-bg">
                  <img src={c.photo} alt="" className="size-12 rounded-md object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{c.daycareName}</p>
                      {c.status ? <StatusBadge status={c.status} /> : null}
                    </div>
                    <p className="truncate text-sm text-muted">{c.lastBody}</p>
                  </div>
                </Link>
              </li>
            ))
          )}
        </ul>
      </main>
    </Shell>
  );
}
