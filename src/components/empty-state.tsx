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
    <div className="mx-auto max-w-md px-5 py-10 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-5" strokeWidth={1.8} />
      </span>
      <p className="mt-4 font-display text-xl tracking-tight">{title}</p>
      {body ? <p className="mt-2 text-sm leading-6 text-muted">{body}</p> : null}
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
