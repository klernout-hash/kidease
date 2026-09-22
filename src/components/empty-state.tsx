import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  title,
  body,
  action,
  actionTo,
  onAction,
  secondary,
  secondaryTo,
  onSecondary,
  icon: Icon = Search,
}: {
  title: string;
  body?: string;
  action?: string;
  actionTo?: string;
  onAction?: () => void;
  secondary?: string;
  secondaryTo?: string;
  onSecondary?: () => void;
  icon?: LucideIcon;
}) {
  return (
    <div className="mx-auto max-w-md px-4 py-5 text-center">
      <span className="mx-auto grid size-9 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-4" strokeWidth={1.8} />
      </span>
      <p className="mt-2 font-display text-lg tracking-tight">{title}</p>
      {body ? <p className="mt-1 text-sm leading-5 text-muted">{body}</p> : null}
      {action && (actionTo || onAction) ? (
        <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
          {actionTo ? (
            <Button asChild>
              <a href={actionTo}>{action}</a>
            </Button>
          ) : (
            <Button type="button" onClick={onAction}>
              {action}
            </Button>
          )}
          {secondary && secondaryTo ? (
            <Button asChild variant="secondary">
              <a href={secondaryTo}>{secondary}</a>
            </Button>
          ) : null}
          {secondary && onSecondary && !secondaryTo ? (
            <Button type="button" variant="secondary" onClick={onSecondary}>
              {secondary}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
