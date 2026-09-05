import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export type EmptyHref = "/search" | "/claim" | "/inbox" | "/parent" | "/login";

/** One empty-state voice for guest, parent, provider, and admin desks. */
export function EmptyState({
  title,
  body,
  action,
  actionTo,
  onAction,
}: {
  title: string;
  body?: string;
  action?: string;
  actionTo?: EmptyHref;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-xl bg-surface px-5 py-8 text-center ring-1 ring-border">
      <p className="font-medium text-fg">{title}</p>
      {body ? <p className="mt-2 text-sm text-muted">{body}</p> : null}
      {action && actionTo ? (
        <div className="mt-5">
          <Button asChild>
            <Link to={actionTo}>{action}</Link>
          </Button>
        </div>
      ) : action && onAction ? (
        <div className="mt-5">
          <Button type="button" onClick={onAction}>
            {action}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
