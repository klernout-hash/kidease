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
}: {
  title: string;
  body?: string;
  action?: string;
  actionTo?: string;
  onAction?: () => void;
  secondary?: string;
  secondaryTo?: string;
  onSecondary?: () => void;
}) {
  return (
    <div className="mx-auto max-w-md px-5 py-10 text-center">
      <p className="font-display text-xl tracking-tight">{title}</p>
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
