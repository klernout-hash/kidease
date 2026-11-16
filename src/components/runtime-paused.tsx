import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { localePath } from "@/lib/locale-path";
import { runtimeSwitchCopy, runtimeSwitchKey, type RuntimeSwitches } from "@/lib/runtime-switches";
import { useCopy } from "@/lib/use-copy";

/** Friendly pause. One next step, in English or French. */
export function RuntimePaused({
  id,
  compact = false,
  onContinue,
  continueLabel,
}: {
  id: keyof RuntimeSwitches;
  compact?: boolean;
  onContinue?: () => void;
  continueLabel?: string;
}) {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const copy = runtimeSwitchCopy(runtimeSwitchKey(id), locale);
  const next = continueLabel || (fr ? "Chercher une garderie" : "Search daycares");
  return (
    <div
      className={compact ? "rounded-xl bg-surface px-4 py-4 ring-1 ring-border" : "rounded-xl bg-surface px-5 py-8 ring-1 ring-border"}
      data-ke="runtime-paused"
      data-switch={runtimeSwitchKey(id)}
      role="status"
    >
      <h2 className="font-display text-2xl text-fg">{copy.title}</h2>
      <p className="mt-2 max-w-prose text-sm text-muted">{copy.body}</p>
      <div className="mt-4">
        {onContinue ? (
          <Button type="button" className="min-h-11 min-w-11 touch-manipulation" onClick={onContinue}>
            {next}
          </Button>
        ) : (
          <Button asChild className="min-h-11 min-w-11 touch-manipulation">
            <Link to={localePath("/search", locale)}>{next}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
