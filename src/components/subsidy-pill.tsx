import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { feePillPulses } from "@/lib/card-photo-pills";
import { listingSubsidy, subsidyLabel, subsidyNote } from "@/lib/fee-program";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

/** Photo and header program label. Open it for eligibility details and provenance. */
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
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          data-ke="card-fee-pill"
          data-subsidy-type={subsidy.subsidy_type}
          title={note}
          className={cn(
            "pointer-events-auto inline-flex min-h-11 items-center px-3 touch-manipulation",
            className,
            pulse && "ke-priority-pill bg-primary text-primary-fg",
          )}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          {subsidyLabel(subsidy, loc)}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          data-ke="card-fee-note"
          aria-label={loc === "fr" ? "Détails du programme de frais" : "Fee program details"}
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          className="z-[80] w-72 max-w-[calc(100vw-2rem)] rounded-xl bg-surface p-4 text-left text-sm font-normal leading-6 text-fg shadow-xl ring-1 ring-border"
          onClick={(event) => event.stopPropagation()}
        >
          <p>{note}</p>
          <a
            data-ke="card-fee-source"
            href={subsidy.subsidy_source}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex min-h-11 items-center text-primary underline underline-offset-4 touch-manipulation"
          >
            {loc === "fr" ? "Voir la source" : "View source"}
          </a>
          {subsidy.verified_at ? (
            <p className="text-xs text-subtle">
              {loc === "fr" ? "Règle vérifiée le" : "Rule checked"} {subsidy.verified_at}
            </p>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
