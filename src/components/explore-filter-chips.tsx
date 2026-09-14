import { useEffect, useId, useState } from "react";
import { ChipButton } from "@/components/chip";
import { Button } from "@/components/ui/button";
import {
  parentAgeLabel,
  parentFacilityLabel,
  parentOpeningLabel,
  parentScheduleLabel,
  type ParentAgeBand,
  type ParentChipVisibility,
  type ParentFacility,
  type ParentListingSearch,
  type ParentOpening,
  type ParentSchedule,
} from "@/lib/parent-listing";
import { useCopy } from "@/lib/use-copy";

type ChipKey = "ages" | "open" | "sched" | "fac";

function toggle<T extends string>(list: T[], token: T): T[] {
  return list.includes(token) ? list.filter((item) => item !== token) : [...list, token];
}

export function ExploreFilterChips({
  value,
  visible,
  onApply,
  hideKeys,
}: {
  value: ParentListingSearch;
  visible: ParentChipVisibility;
  onApply: (next: ParentListingSearch) => void;
  hideKeys?: ChipKey[];
}) {
  const { t, locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const [open, setOpen] = useState<ChipKey | null>(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const groups = [
    {
      key: "ages" as ChipKey,
      label: t("chipAge"),
      options: visible.ages.map((id) => ({ id, label: parentAgeLabel(id, loc) })),
      selected: value.ages,
    },
    {
      key: "open" as ChipKey,
      label: t("chipOpenings"),
      options: visible.openings.map((id) => ({ id, label: parentOpeningLabel(id, loc) })),
      selected: value.open,
    },
    {
      key: "sched" as ChipKey,
      label: t("chipSchedule"),
      options: visible.schedules.map((id) => ({ id, label: parentScheduleLabel(id, loc) })),
      selected: value.sched,
    },
    {
      key: "fac" as ChipKey,
      label: t("chipFacility"),
      options: visible.facilities.map((id) => ({ id, label: parentFacilityLabel(id, loc) })),
      selected: value.fac,
    },
  ].filter((group) => group.options.length > 0 && !hideKeys?.includes(group.key));

  if (!groups.length) return null;

  const active = groups.find((group) => group.key === open);

  return (
    <div className="flex flex-wrap gap-2" data-parent-filter-chips>
      {groups.map((group) => (
        <ChipButton
          key={group.key}
          on={group.selected.length > 0 || open === group.key}
          aria-pressed={group.selected.length > 0}
          onClick={() => setOpen(open === group.key ? null : group.key)}
        >
          {group.label}
          {group.selected.length ? ` · ${group.selected.length}` : ""}
        </ChipButton>
      ))}
      {active ? (
        <FilterModal
          title={active.label}
          options={active.options}
          selected={
            active.key === "ages"
              ? draft.ages
              : active.key === "open"
                ? draft.open
                : active.key === "sched"
                  ? draft.sched
                  : draft.fac
          }
          onToggle={(id) => {
            if (active.key === "ages") setDraft({ ...draft, ages: toggle(draft.ages, id as ParentAgeBand) });
            if (active.key === "open") setDraft({ ...draft, open: toggle(draft.open, id as ParentOpening) });
            if (active.key === "sched") setDraft({ ...draft, sched: toggle(draft.sched, id as ParentSchedule) });
            if (active.key === "fac") setDraft({ ...draft, fac: toggle(draft.fac, id as ParentFacility) });
          }}
          onApply={() => {
            onApply(draft);
            setOpen(null);
          }}
          onClear={() => {
            const next = {
              ...draft,
              [active.key === "open" ? "open" : active.key === "sched" ? "sched" : active.key === "fac" ? "fac" : "ages"]:
                [],
            };
            setDraft(next);
            onApply(next);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}

function FilterModal({
  title,
  options,
  selected,
  onToggle,
  onApply,
  onClear,
  onClose,
}: {
  title: string;
  options: Array<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string) => void;
  onApply: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { t } = useCopy();
  const titleId = useId();
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="presentation">
      <button type="button" className="absolute inset-0 bg-fg/40" aria-label={t("cancel")} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-t-xl bg-surface p-5 shadow-card ring-1 ring-border md:rounded-xl"
      >
        <h2 id={titleId} className="font-display text-2xl">
          {title}
        </h2>
        <ul className="mt-4 space-y-2">
          {options.map((opt) => (
            <li key={opt.id}>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={selected.includes(opt.id)}
                  onChange={() => onToggle(opt.id)}
                />
                {opt.label}
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" onClick={onApply}>
            {t("filterApply")}
          </Button>
          <Button type="button" variant="secondary" onClick={onClear}>
            {t("filterClear")}
          </Button>
        </div>
      </div>
    </div>
  );
}
