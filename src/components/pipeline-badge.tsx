import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import {
  PIPELINE_COPY_KEY,
  threadPipelineStage,
  type PipelineStage,
} from "@/lib/tour-pipeline";
import type { BookingStatus, TourStatus } from "@/lib/types";

function tone(stage: PipelineStage) {
  switch (stage) {
    case "requested":
      return "bg-primary/10 text-primary ring-primary/20";
    case "confirmed":
      return "bg-ok/10 text-ok ring-ok/20";
    case "completed":
      return "bg-surface-2 text-fg ring-border";
    case "enrolled":
      return "bg-ok/10 text-ok ring-ok/20";
    case "lost":
      return "bg-danger/10 text-danger ring-danger/20";
    default:
      return "bg-surface-2 text-muted ring-border";
  }
}

export function PipelineBadge({
  tourStatus,
  bookingStatus,
  className,
}: {
  tourStatus?: TourStatus | string | null;
  bookingStatus?: BookingStatus | null;
  className?: string;
}) {
  const { t } = useCopy();
  const stage = threadPipelineStage({ tourStatus, bookingStatus });
  if (!stage) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        tone(stage),
        className,
      )}
    >
      {t(PIPELINE_COPY_KEY[stage])}
    </span>
  );
}
