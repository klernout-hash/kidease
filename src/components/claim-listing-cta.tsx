import { Link } from "@tanstack/react-router";
import { capturePostHogEvent } from "@/lib/posthog";
import { SIGNUP_FUNNEL_EVENT, signupFunnelPayload } from "@/lib/signup-funnel";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

/** Claim your free listing. Prefills the claim flow with this centre. */
export function ClaimListingCta({
  daycareId,
  name,
  source,
  className,
}: {
  daycareId: string;
  name: string;
  source: "card" | "listing";
  className?: string;
}) {
  const { t, locale } = useCopy();
  const id = daycareId.trim();
  const q = name.trim();
  const onCard = source === "card";
  return (
    <Link
      to={localePath("/claim", locale)}
      search={{ ...(id ? { id } : {}), ...(q ? { q } : {}) }}
      data-ke="claim-free-listing"
      data-source={source}
      onClick={() => {
        capturePostHogEvent(SIGNUP_FUNNEL_EVENT, signupFunnelPayload("claim_cta", { source }));
      }}
      className={cn(
        "box-border inline-flex min-h-[44px] min-w-[44px] max-w-full items-center justify-center bg-surface text-center font-semibold text-fg ring-1 ring-border touch-manipulation hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        onCard
          ? "w-fit break-words self-start rounded-full px-2.5 py-1 text-[11px] leading-4"
          : "rounded-md px-4 text-sm shadow-card",
        className,
      )}
    >
      {t("claimFreeListing")}
    </Link>
  );
}
