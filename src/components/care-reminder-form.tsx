import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { careReminderCopy } from "@/lib/care-reminder-copy";
import type { CareDay } from "@/lib/care-reminders";
import { CANADA_TOUR_TIMEZONES } from "@/lib/tour-calendar";
import { loadCareReminder, saveCareReminder } from "@/lib/server/care-reminders";
import { useCopy } from "@/lib/use-copy";

type Day = CareDay;

const blank = (weekday: number): Day => ({
  weekday,
  dropoff: "",
  pickup: "",
  dropoffOn: false,
  pickupOn: false,
});

export function CareReminderForm({ childId, childName }: { childId: string; childName: string }) {
  const { locale } = useCopy();
  const copy = careReminderCopy(locale);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [masterOn, setMasterOn] = useState(false);
  const [sameEveryDay, setSameEveryDay] = useState(true);
  const [lead, setLead] = useState<15 | 30 | 60>(30);
  const [zone, setZone] = useState("");
  const [days, setDays] = useState<Day[]>([blank(-1)]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadCareReminder({ data: { childId } })
      .then((row) => {
        setEnabled(row.enabled);
        if (!row.enabled || !("found" in row) || !row.found) return;
        setMasterOn(row.masterOn);
        setSameEveryDay(row.sameEveryDay);
        setLead(row.leadMinutes);
        setZone(row.zone);
        setDays(row.days.length ? row.days.map((day) => ({ ...day, dropoff: day.dropoff || "", pickup: day.pickup || "" })) : [blank(row.sameEveryDay ? -1 : 0)]);
      })
      .catch(() => setEnabled(false));
  }, [childId]);

  if (enabled !== true) return null;
  const shown = sameEveryDay ? days.filter((day) => day.weekday === -1).slice(0, 1) : days.filter((day) => day.weekday >= 0);

  function update(weekday: number, patch: Partial<Day>) {
    setDays((rows) => {
      const next = rows.some((row) => row.weekday === weekday) ? rows : [...rows, blank(weekday)];
      return next.map((row) => (row.weekday === weekday ? { ...row, ...patch } : row));
    });
  }

  return (
    <form
      className="mt-4 space-y-3 rounded-xl bg-surface p-4 ring-1 ring-border"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void saveCareReminder({
          data: {
            childId,
            masterOn,
            sameEveryDay,
            leadMinutes: lead,
            zone,
            days: (sameEveryDay ? days.filter((day) => day.weekday === -1) : days.filter((day) => day.weekday >= 0)).map(
              (day) => ({ ...day, dropoff: day.dropoff || null, pickup: day.pickup || null }),
            ),
          },
        })
          .then(() => toast.success(copy.saved))
          .catch(() => toast.error(copy.off))
          .finally(() => setBusy(false));
      }}
    >
      <h3 className="font-display text-lg">{copy.title}</h3>
      <p className="text-sm text-muted">{copy.lead}</p>
      <p className="text-sm">{copy.yours}</p>
      <p className="text-sm text-muted">{childName}</p>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" className="size-5 accent-primary" checked={masterOn} onChange={(event) => setMasterOn(event.target.checked)} />
        {copy.master}
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5 accent-primary"
          checked={sameEveryDay}
          onChange={(event) => {
            const next = event.target.checked;
            setSameEveryDay(next);
            setDays(next ? [days.find((day) => day.weekday === -1) || blank(-1)] : [0, 1, 2, 3, 4, 5, 6].map((weekday) => days.find((day) => day.weekday === weekday) || blank(weekday)));
          }}
        />
        {copy.same}
      </label>
      <label className="block text-sm">
        {copy.leadLabel}
        <select
          className="ke-input mt-1 min-h-11 w-full"
          value={lead}
          onChange={(event) => setLead(event.target.value === "15" ? 15 : event.target.value === "60" ? 60 : 30)}
        >
          <option value="15">{copy.minutes[15]}</option>
          <option value="30">{copy.minutes[30]}</option>
          <option value="60">{copy.minutes[60]}</option>
        </select>
      </label>
      <label className="block text-sm">
        {copy.zone}
        <select className="ke-input mt-1 min-h-11 w-full" value={zone} onChange={(event) => setZone(event.target.value)}>
          <option value="">{copy.zoneHint}</option>
          {CANADA_TOUR_TIMEZONES.map((item) => (
            <option key={item} value={item}>
              {item.replace("America/", "").replace("_", " ")}
            </option>
          ))}
        </select>
      </label>
      {shown.map((day) => (
        <fieldset key={day.weekday} className="space-y-2 rounded-lg p-3 ring-1 ring-border">
          <legend className="px-1 text-sm font-medium">{day.weekday < 0 ? copy.same : copy.days[day.weekday]}</legend>
          <TimeRow
            label={copy.dropoff}
            on={day.dropoffOn}
            time={day.dropoff || ""}
            onToggle={(value) => update(day.weekday, { dropoffOn: value })}
            onTime={(value) => update(day.weekday, { dropoff: value })}
          />
          <TimeRow
            label={copy.pickup}
            on={day.pickupOn}
            time={day.pickup || ""}
            onToggle={(value) => update(day.weekday, { pickupOn: value })}
            onTime={(value) => update(day.weekday, { pickup: value })}
          />
        </fieldset>
      ))}
      <p className="text-sm text-muted">{copy.push}</p>
      <p className="text-sm text-muted">{copy.closed}</p>
      <Button type="submit" disabled={busy}>
        {copy.save}
      </Button>
    </form>
  );
}

function TimeRow({
  label,
  on,
  time,
  onToggle,
  onTime,
}: {
  label: string;
  on: boolean;
  time: string;
  onToggle: (value: boolean) => void;
  onTime: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="size-5 accent-primary" checked={on} onChange={(event) => onToggle(event.target.checked)} />
        {label}
      </label>
      <input
        type="time"
        value={time}
        onChange={(event) => onTime(event.target.value)}
        onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
        className="h-11 min-w-0 flex-1 rounded-md border border-border bg-bg px-3"
      />
    </div>
  );
}
