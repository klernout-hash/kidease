import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
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
      options: (["full", "part"] as const).map((id) => ({ id, label: parentScheduleLabel(id, loc) })),
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
  const returnFocus = useRef<HTMLElement | null>(null);

  return (
    <Dialog.Root open onOpenChange={(next) => { if (!next) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[80] bg-fg/40" />
      <Dialog.Content
        aria-describedby={undefined}
        className="fixed inset-x-0 bottom-0 z-[81] mx-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col rounded-t-xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-fg shadow-card ring-1 ring-border focus:outline-none md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl"
        onOpenAutoFocus={() => {
          const previous = document.activeElement;
          returnFocus.current = previous instanceof HTMLElement ? previous : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnFocus.current?.isConnected) returnFocus.current.focus();
        }}
      >
        <Dialog.Title className="shrink-0 font-display text-2xl">
          {title}
        </Dialog.Title>
        <ul className="mt-4 min-h-0 overflow-y-auto overscroll-contain space-y-2">
          {options.map((opt) => (
            <li key={opt.id}>
              <label className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center gap-3 text-sm">
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
        <div className="mt-5 flex shrink-0 flex-wrap gap-2">
          <Button type="button" onClick={onApply}>
            {t("filterApply")}
          </Button>
          <Button type="button" variant="secondary" onClick={onClear}>
            {t("filterClear")}
          </Button>
          <Dialog.Close asChild>
            <Button type="button" variant="secondary">{t("cancel")}</Button>
          </Dialog.Close>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
    </Dialog.Root>
  );
}
