import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { safetyText } from "@/lib/safety";
import { listMyBlocks, type BlockedListItem } from "@/lib/server/safety";
import { useCopy } from "@/lib/use-copy";
import { UnblockButton } from "@/components/block-user";

export function BlockedListScreen() {
  const { locale, t } = useCopy();
  const text = safetyText(locale);
  const { user, isPending } = useCurrentUserState();
  const [rows, setRows] = useState<BlockedListItem[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let live = true;
    void listMyBlocks()
      .then((items) => {
        if (live) setRows(items);
      })
      .catch(() => {
        if (live) setRows([]);
      });
    return () => {
      live = false;
    };
  }, [user]);

  return (
    <main className="ke-menu-main ke-gutter mx-auto w-full max-w-lg pb-10 pt-6" data-ke="blocked-list">
      <Link to="/menu" search={{ section: "legal" }} className="inline-flex min-h-11 items-center text-sm font-medium text-primary">
        {t("menuPrivacyLegal")}
      </Link>
      <h1 className="mt-2 font-display text-3xl">{text.blockedListTitle}</h1>
      <p className="mt-2 text-sm leading-6 text-muted">{text.blockConfirmBody}</p>
      {!user && !isPending ? (
        <p className="mt-6 text-sm">
          <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            {text.blockedSignIn}
          </Link>
        </p>
      ) : null}
      {user && rows && rows.length === 0 ? <p className="mt-6 text-sm text-muted">{text.blockedEmpty}</p> : null}
      {rows && rows.length ? (
        <ul className="mt-4 divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
          {rows.map((row) => (
            <li key={row.key} className="flex min-h-14 items-center justify-between gap-3 px-3" data-ke="blocked-row">
              <span className="min-w-0 truncate text-[15px]">{row.title}</span>
              <UnblockButton
                daycareId={row.daycareId}
                blockedUserId={row.blockedUserId}
                onDone={() => setRows((current) => current?.filter((item) => item.key !== row.key) ?? [])}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
