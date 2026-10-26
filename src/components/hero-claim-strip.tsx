import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";

const POINTS: CopyKey[] = ["heroTrustLicensed", "heroTrustCount", "heroTrustFounding"];

/** Slim claim line under the home search pills. Server-rendered, fixed copy. */
export function HeroClaimStrip() {
  const { t, locale } = useCopy();
  return (
    <div
      data-ke="home-claim-strip"
      className="mx-auto mt-3 flex w-full max-w-[960px] flex-wrap items-center justify-center gap-x-3 gap-y-2"
    >
      <p className="text-center text-sm font-normal leading-5 text-fg">{t("heroDaycareLead")}</p>
      <Button asChild size="sm" className="min-h-11 px-3.5">
        <Link to={localePath("/claim", locale)}>{t("heroClaimListing")}</Link>
      </Button>
      <ul className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {POINTS.map((key) => (
          <li key={key} className="inline-flex items-center gap-1 text-xs font-normal text-muted">
            <Check className="size-3.5 shrink-0 text-primary" aria-hidden />
            {t(key)}
          </li>
        ))}
      </ul>
    </div>
  );
}
