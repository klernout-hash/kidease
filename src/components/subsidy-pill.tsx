import { useState } from "react";
import { feePillPulses } from "@/lib/card-photo-pills";
import { listingSubsidy, subsidyLabel, subsidyNote } from "@/lib/fee-program";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

/** Photo and header pill. Tap or hover shows the one-line fact and the official source. */
export function SubsidyPill({
  item,
  className,
}: {
  item: {
    province?: string | null;
    city?: string | null;
    name?: string | null;
    amenities?: string | null;
    facilityType?: string | null;
    agesKnown?: boolean | null;
    ageMinMonths?: number | null;
    ageMaxMonths?: number | null;
    feeProgram?: string | null;
  };
  className?: string;
}) {
  const { locale } = useCopy();
  const subsidy = listingSubsidy(item);
  const [open, setOpen] = useState(false);
  if (!subsidy) return null;
  const loc = locale === "fr" ? "fr" : "en";
  const note = subsidyNote(subsidy, loc);
  const pulse = feePillPulses(subsidy.subsidy_type);
  return (
    <span className="pointer-events-auto relative inline-flex max-w-full flex-col items-start">
      <button
        type="button"
        data-ke="card-fee-pill"
        data-subsidy-type={subsidy.subsidy_type}
        data-verified-at={subsidy.verified_at}
        title={note}
        aria-expanded={open}
        className={cn("inline-flex min-h-11 items-center px-3 touch-manipulation", pulse && "ke-priority-pill", className)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {subsidyLabel(subsidy, loc)}
      </button>
      <span data-ke="card-fee-source" className="mt-0.5 inline-flex max-w-[16rem] items-center rounded bg-black/75 text-left text-[11px] font-normal leading-4 text-white">
        <a
          href={subsidy.subsidy_source}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center px-3 underline touch-manipulation"
          onClick={(event) => event.stopPropagation()}
        >
          {loc === "fr" ? "Source" : "Source"}
        </a>
        {subsidy.verified_at ? ` · ${subsidy.verified_at}` : ""}
      </span>
      {open ? (
        <span
          data-ke="card-fee-note"
          className="mt-1 max-w-[240px] rounded-lg bg-black/80 px-2 py-1 text-left text-[11px] font-normal leading-4 text-white"
        >
          {note}
        </span>
      ) : null}
    </span>
  );
}
