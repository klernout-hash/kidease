import { Button } from "@/components/ui/button";

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
  actionTo?: string;
  onAction?: () => void;
}) {
  return (
    <div className="px-5 py-8 text-center">
      <p className="font-medium">{title}</p>
      {body ? <p className="mt-2 text-sm text-muted">{body}</p> : null}
      {action && actionTo ? (
        <div className="mt-5">
          <Button asChild>
            <a href={actionTo}>{action}</a>
          </Button>
        </div>
      ) : null}
      {action && onAction && !actionTo ? (
        <div className="mt-5">
          <Button type="button" onClick={onAction}>
            {action}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
