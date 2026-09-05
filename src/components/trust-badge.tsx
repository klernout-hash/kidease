import { useState } from "react";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import {
  formatAttestedOn,
  trustBadgesFor,
  type TrustBadge as TrustBadgeModel,
  type TrustListing,
  type TrustSurface,
  type TrustTone,
} from "@/lib/trust";
import type { CopyKey } from "@/lib/copy";

const TONE: Record<TrustTone, string> = {
  ok: "bg-ok/15 text-ok",
  neutral: "bg-surface-2 text-muted",
  warn: "bg-surface-2 text-fg",
  danger: "bg-danger/10 text-danger",
};

const TONE_INVERT: Record<TrustTone, string> = {
  ok: "bg-white/20 text-primary-fg",
  neutral: "bg-white/12 text-primary-fg/85",
  warn: "bg-white/15 text-primary-fg",
  danger: "bg-white/20 text-primary-fg",
};

export function TrustBadge({
  badge,
  invert,
  compact,
  extra,
}: {
  badge: TrustBadgeModel;
  invert?: boolean;
  compact?: boolean;
  extra?: string;
}) {
  const { t } = useCopy();
  const [open, setOpen] = useState(false);
  const label = extra ? `${t(badge.labelKey as CopyKey)} (${extra})` : t(badge.labelKey as CopyKey);
  const tip = t(badge.tipKey as CopyKey);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className={cn(
          "rounded-full font-medium leading-none",
          compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
          invert ? TONE_INVERT[badge.tone] : TONE[badge.tone],
        )}
        aria-label={`${label}. ${tip}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
      >
        {label}
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-30 mt-1.5 w-64 rounded-lg bg-fg px-3 py-2 text-left text-xs font-normal leading-5 text-surface shadow-lift"
        >
          {tip}
        </span>
      ) : null}
    </span>
  );
}

export function TrustSignals({
  item,
  surface,
  stripeLive,
  invert,
  compact,
  className,
}: {
  item: TrustListing;
  surface: TrustSurface;
  stripeLive?: boolean;
  invert?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const { locale } = useCopy();
  const badges = trustBadgesFor(item, surface, stripeLive);
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {badges.map((badge) => (
        <TrustBadge
          key={badge.id}
          badge={badge}
          invert={invert}
          compact={compact}
          extra={
            badge.id === "staff_attested"
              ? formatAttestedOn(item.staffScreeningAttestedAt, locale === "fr" ? "fr-CA" : "en-CA")
              : undefined
          }
        />
      ))}
    </div>
  );
}

export function TrustExplainer({ className }: { className?: string }) {
  const { t } = useCopy();
  return (
    <div className={cn("rounded-lg bg-surface p-3 text-sm ring-1 ring-border", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">{t("trustWhatMeans")}</p>
      <p className="mt-1.5 text-muted">{t("trustWhatMeansLead")}</p>
    </div>
  );
}
