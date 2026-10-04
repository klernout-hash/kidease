import { Link } from "@tanstack/react-router";
import { capturePostHogEvent } from "@/lib/posthog";
import { SIGNUP_FUNNEL_EVENT, signupFunnelPayload } from "@/lib/signup-funnel";
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
  const { t } = useCopy();
  const id = daycareId.trim();
  const q = name.trim();
  const onCard = source === "card";
  return (
    <Link
      to="/claim"
      search={{ ...(id ? { id } : {}), ...(q ? { q } : {}) }}
      data-ke="claim-free-listing"
      data-source={source}
      onClick={() => {
        capturePostHogEvent(SIGNUP_FUNNEL_EVENT, signupFunnelPayload("claim_cta", { source }));
      }}
      className={cn(
        "box-border max-w-full bg-[#1f9d55] text-center font-semibold text-white touch-manipulation hover:bg-[#187a43] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f9d55]/50",
        onCard
          ? "block w-fit max-w-full break-words min-h-8 self-start rounded-full px-2.5 py-1 text-left text-[11px] leading-4"
          : "inline-flex min-h-11 items-center justify-center rounded-[14px] px-4 text-sm shadow-card",
        className,
      )}
    >
      {t("claimFreeListing")}
    </Link>
  );
}
