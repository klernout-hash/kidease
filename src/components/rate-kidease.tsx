import { useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { rateKidEaseFromMenu } from "@/lib/store-review";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

/**
 * Rate KidEase is public — not Account-only.
 *
 * Surfaces: guest www homepage (`/`), Account, app Menu, website drawer, footer.
 * All of them call `rateKidEaseFromMenu()` (PR 98): native write-review / OS sheet,
 * web → `/get-app`. No live App Store / Play fetches. Cookie consent is unchanged.
 */
export type RateKidEaseAppearance = "button" | "row" | "drawer" | "footer" | "nav";

async function runRate(onGetApp: () => void): Promise<void> {
  const result = await rateKidEaseFromMenu();
  if (result === "get-app") onGetApp();
}

export function RateKidEaseControl({
  appearance = "button",
  className,
  onDone,
}: {
  appearance?: RateKidEaseAppearance;
  className?: string;
  onDone?: () => void;
}) {
  const { t } = useCopy();
  const navigate = useNavigate();
  const label = t("rateKidEase");

  function onClick() {
    void runRate(() => void navigate({ to: "/get-app", search: { dev: undefined } })).then(
      () => onDone?.(),
    );
  }

  if (appearance === "button") {
    return (
      <Button type="button" variant="secondary" className={className} onClick={onClick}>
        {label}
      </Button>
    );
  }

  return (
    <button
      type="button"
      data-ke="rate-kidease"
      className={cn(
        appearance === "row" &&
          "flex min-h-14 w-full items-center justify-between gap-3 border-b border-border px-1 text-left text-[15px] text-fg last:border-b-0",
        appearance === "drawer" &&
          "flex min-h-12 w-full items-center rounded-xl px-3 text-left text-[15px] font-medium text-fg hover:bg-surface",
        appearance === "footer" && "ke-footer-link cursor-pointer border-0 bg-transparent p-0 text-left",
        appearance === "nav" && "whitespace-nowrap text-[13px] font-medium text-muted hover:text-fg",
        className,
      )}
      onClick={onClick}
    >
      {label}
      {appearance === "row" ? <ChevronRight className="size-4 text-muted" /> : null}
    </button>
  );
}

export function RateKidEaseMenuRow() {
  return <RateKidEaseControl appearance="row" />;
}

export function RateKidEaseButton({ className }: { className?: string }) {
  return <RateKidEaseControl appearance="button" className={className} />;
}

/** Same prompt as authenticated Account — reused on guest www home. */
export function RateKidEasePrompt({ className }: { className?: string }) {
  const { t } = useCopy();
  return (
    <div className={className} data-ke="rate-kidease-prompt">
      <RateKidEaseButton className="w-full" />
      <p className="mt-2 text-center text-xs text-subtle">{t("writeStoreReview")}</p>
    </div>
  );
}
