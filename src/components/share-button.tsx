import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { toast } from "sonner";
import { hapticLight } from "@/lib/native";
import {
  appSharePayload,
  listingSharePayload,
  shareFeedbackKey,
  shareOrCopy,
  type SharePayload,
} from "@/lib/share";
import { noteHappyMoment } from "@/lib/store-review";
import { captureMarketplaceFunnel } from "@/lib/marketplace-funnel";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

export type ShareAppearance = "icon" | "labeled" | "menu" | "nav" | "drawer" | "photo" | "row";

const FEEDBACK_MS = 2800;

async function runShare(
  payload: SharePayload,
  messages: { started: string; copied: string; failed: string },
): Promise<"shared" | "copied" | "failed" | "cancelled"> {
  const outcome = await shareOrCopy(payload);
  if (outcome === "copied") {
    toast.success(messages.copied);
    return outcome;
  }
  if (outcome === "shared") {
    toast.success(messages.started);
    void hapticLight();
    noteHappyMoment("share");
    return outcome;
  }
  if (outcome === "failed") toast.error(messages.failed);
  return outcome;
}

function ShareControl({
  payload,
  label,
  ariaLabel,
  appearance,
  className,
  onDone,
}: {
  payload: SharePayload;
  label: string;
  ariaLabel: string;
  appearance: ShareAppearance;
  className?: string;
  onDone?: () => void;
}) {
  const { t } = useCopy();
  const [feedback, setFeedback] = useState<string | null>(null);

  async function onShare(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    const outcome = await runShare(payload, {
      started: t("shareStarted"),
      copied: t("shareCopiedFallback"),
      failed: t("shareFailed"),
    });
    if ((outcome === "shared" || outcome === "copied") && payload.url?.includes("/daycare/")) {
      captureMarketplaceFunnel({ step: "share", source: "listing", dest_path: "/daycare" });
    }
    const key = shareFeedbackKey(outcome);
    if (key) {
      setFeedback(t(key));
      window.setTimeout(() => setFeedback(null), FEEDBACK_MS);
    }
    onDone?.();
  }

  const iconClass =
    appearance === "photo"
      ? "size-[22px] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
      : appearance === "icon"
        ? "size-5"
        : "size-4";

  const shown = feedback ?? label;

  return (
    <button
      type="button"
      role={appearance === "menu" ? "menuitem" : undefined}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => void onShare(e)}
      aria-label={feedback ? feedback : ariaLabel}
      aria-live="polite"
      className={cn(
        appearance === "icon" && "grid size-11 place-items-center rounded-full text-fg hover:bg-surface-2",
        appearance === "photo" && "grid size-11 place-items-center rounded-full",
        appearance === "labeled" &&
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-medium text-fg hover:bg-surface-2",
        appearance === "menu" && "block w-full px-3 py-2.5 text-left text-sm text-fg hover:bg-surface-2",
        appearance === "nav" && "whitespace-nowrap text-[13px] font-medium text-muted hover:text-fg",
        appearance === "drawer" &&
          "flex min-h-12 w-full items-center rounded-xl px-3 text-left text-[15px] font-medium text-fg hover:bg-surface",
        appearance === "row" &&
          "flex min-h-14 w-full items-center justify-between gap-3 border-b border-border px-1 text-left text-[15px] text-fg last:border-b-0",
        className,
      )}
    >
      {appearance === "menu" || appearance === "nav" || appearance === "drawer" || appearance === "row" ? (
        <>
          {shown}
          {appearance === "row" ? <Share2 className="size-4 text-muted" strokeWidth={1.7} aria-hidden /> : null}
        </>
      ) : (
        <>
          {feedback ? (
            <Check className={iconClass} strokeWidth={2.2} aria-hidden />
          ) : (
            <Share2 className={iconClass} strokeWidth={1.7} aria-hidden />
          )}
          {appearance === "labeled" ? <span>{shown}</span> : null}
        </>
      )}
    </button>
  );
}

export function ShareKidEaseButton({
  appearance = "labeled",
  className,
  onDone,
}: {
  appearance?: ShareAppearance;
  className?: string;
  onDone?: () => void;
}) {
  const { t } = useCopy();
  const label = t("shareKidEase");
  return (
    <ShareControl
      payload={appSharePayload({ title: t("app"), text: t("shareKidEaseText") })}
      label={label}
      ariaLabel={label}
      appearance={appearance}
      className={className}
      onDone={onDone}
    />
  );
}

export function ShareListingButton({
  slug,
  name,
  appearance = "icon",
  className,
  onDone,
}: {
  slug: string;
  name: string;
  appearance?: ShareAppearance;
  className?: string;
  onDone?: () => void;
}) {
  const { t } = useCopy();
  return (
    <ShareControl
      payload={listingSharePayload({ name, slug, text: t("shareListingText") })}
      label={t("shareListing")}
      ariaLabel={`${t("shareListingAria")}: ${name}`}
      appearance={appearance}
      className={className}
      onDone={onDone}
    />
  );
}
