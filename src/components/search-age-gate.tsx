import { ChipButton } from "@/components/chip";
import {
  SEARCH_AGES,
  SEARCH_STARTS,
  type SearchAge,
  type SearchStart,
} from "@/lib/now-loops";
import type { CopyKey } from "@/lib/copy";
import { useCopy } from "@/lib/use-copy";

const AGE_COPY: Record<SearchAge, CopyKey> = {
  infant: "infant",
  toddler: "toddler",
  preschool: "preschool",
  "school-age": "schoolAge",
};

const START_COPY: Record<SearchStart, CopyKey> = {
  now: "searchStartNow",
  "this-month": "searchStartThisMonth",
  "next-month": "searchStartNextMonth",
};

export function SearchAgeGate({
  age,
  start,
  onAge,
  onStart,
  compact = false,
}: {
  age?: SearchAge | "";
  start?: SearchStart | "";
  onAge: (age: SearchAge) => void;
  onStart: (start: SearchStart) => void;
  compact?: boolean;
}) {
  const { t } = useCopy();
  return (
    <div className={compact ? "space-y-3" : "mt-4 space-y-4 rounded-xl bg-surface p-4 ring-1 ring-border"}>
      {compact ? null : (
        <div>
          <p className="font-semibold">{t("searchAgeGateTitle")}</p>
          <p className="mt-1 text-sm text-muted">{t("searchAgeGateLead")}</p>
        </div>
      )}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-subtle">{t("searchAgeLabel")}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("searchAgeLabel")}>
          {SEARCH_AGES.map((band) => (
            <ChipButton
              key={band}
              on={age === band}
              aria-pressed={age === band}
              onClick={() => onAge(band)}
            >
              {t(AGE_COPY[band])}
            </ChipButton>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-subtle">{t("searchStartLabel")}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("searchStartLabel")}>
          {SEARCH_STARTS.map((window) => (
            <ChipButton
              key={window}
              on={start === window}
              aria-pressed={start === window}
              onClick={() => onStart(window)}
            >
              {t(START_COPY[window])}
            </ChipButton>
          ))}
        </div>
      </div>
    </div>
  );
}
