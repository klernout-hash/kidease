import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  assignCareRoster,
  assignChildRoom,
  saveCareRoom,
  type CareOpsPayload,
} from "@/lib/server/care-ops";
import { buildRoomCounts, canAssignRoster, canManageRooms, type CareDeskRole } from "@/lib/daily-care";
import type { AttendanceRow } from "@/lib/server/ops";
import { useCopy } from "@/lib/use-copy";

export function CareOpsPanel({
  role,
  day,
  ops,
  attendance,
  busy,
  setBusy,
  onReload,
}: {
  role: CareDeskRole;
  day: string;
  ops: CareOpsPayload;
  attendance: AttendanceRow[];
  busy: string | null;
  setBusy: (value: string | null) => void;
  onReload: () => Promise<void>;
}) {
  const { t } = useCopy();
  const [roomName, setRoomName] = useState("");
  const [capacity, setCapacity] = useState("8");
  const [staffPick, setStaffPick] = useState<Record<string, string>>({});
  const daycareOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of attendance) map.set(row.daycareId, row.daycareName);
    for (const room of ops.rooms) map.set(room.daycareId, room.daycareName);
    for (const member of ops.staff) {
      if (!map.has(member.daycareId)) map.set(member.daycareId, member.daycareId);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [attendance, ops.rooms, ops.staff]);
  const [daycareId, setDaycareId] = useState(daycareOptions[0]?.id ?? "");
  const selectedDaycareId = daycareId || daycareOptions[0]?.id || "";

  const counts = useMemo(
    () =>
      buildRoomCounts({
        rooms: ops.rooms,
        assignments: ops.assignments,
        attendance,
        roster: ops.roster,
      }),
    [ops.rooms, ops.assignments, ops.roster, attendance],
  );

  async function addRoom() {
    if (!selectedDaycareId || !canManageRooms(role)) return;
    setBusy("room:add");
    try {
      await saveCareRoom({
        data: { daycareId: selectedDaycareId, name: roomName, capacity: Number(capacity) || 8 },
      });
      toast.success(t("careRoomAdded"));
      setRoomName("");
      await onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tourRespondFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function putStaffOnRoom(roomId: string) {
    const staffUserId = staffPick[roomId];
    const room = ops.rooms.find((r) => r.id === roomId);
    if (!staffUserId || !room || !canAssignRoster(role)) return;
    setBusy(`roster:${roomId}`);
    try {
      await assignCareRoster({
        data: { daycareId: room.daycareId, roomId, staffUserId, day },
      });
      toast.success(t("careRosterAdded"));
      await onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tourRespondFailed"));
    } finally {
      setBusy(null);
    }
  }

  if (role === "parent" && counts.length === 0) return null;

  return (
    <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="care-ops-rooms">
      <h3 className="font-medium">{t("careRooms")}</h3>
      <p className="mt-1 text-sm text-muted">{t("careRoomsLead")}</p>
      {counts.length ? (
        <ul className="mt-3 space-y-2">
          {counts.map((row) => (
            <li key={row.roomId} className="rounded-lg bg-bg p-3 ring-1 ring-border">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{row.roomName}</p>
                <p className="text-sm">
                  {row.present} {t("careHere")} / {row.capacity}
                  {row.overCapacity ? (
                    <span className="ml-2 text-xs font-medium text-danger">{t("careRoomOver")}</span>
                  ) : null}
                </p>
              </div>
              <p className="mt-1 text-xs text-subtle">
                {row.daycareName}
                {row.staffNames.length ? ` · ${row.staffNames.join(", ")}` : ` · ${t("careRosterEmpty")}`}
              </p>
              {role === "provider" ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`roster-${row.roomId}`}>
                    {t("careStaffPick")}
                  </label>
                  <select
                    id={`roster-${row.roomId}`}
                    className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm"
                    value={staffPick[row.roomId] ?? ""}
                    onChange={(e) => setStaffPick((prev) => ({ ...prev, [row.roomId]: e.target.value }))}
                  >
                    <option value="">{t("careStaffPick")}</option>
                    {ops.staff
                      .filter((s) => s.daycareId === row.daycareId)
                      .map((s) => (
                        <option key={s.userId} value={s.userId}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy !== null || !staffPick[row.roomId]}
                    onClick={() => void putStaffOnRoom(row.roomId)}
                  >
                    {busy === `roster:${row.roomId}` ? t("loading") : t("careRosterAdd")}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">{t("careRosterEmpty")}</p>
      )}

      {role === "provider" ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="font-medium">{t("careRoster")}</p>
          <p className="mt-1 text-sm text-muted">{t("careRosterLead")}</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            {daycareOptions.length > 1 ? (
              <label className="text-sm">
                {t("careCentre")}
                <select
                  className="mt-1 block rounded-md border border-border bg-bg px-2 py-1.5 text-sm"
                  value={selectedDaycareId}
                  onChange={(e) => setDaycareId(e.target.value)}
                >
                  {daycareOptions.map((centre) => (
                    <option key={centre.id} value={centre.id}>
                      {centre.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="text-sm">
              {t("careRoomName")}
              <input
                className="mt-1 block w-44 rounded-md border border-border bg-bg px-3 py-2 text-sm"
                placeholder={t("careRoomNamePh")}
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
              />
            </label>
            <label className="text-sm">
              {t("careRoomCapacity")}
              <input
                type="number"
                min={1}
                max={80}
                className="mt-1 block w-24 rounded-md border border-border bg-bg px-3 py-2 text-sm"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </label>
            <Button size="sm" disabled={busy !== null || !roomName.trim() || !selectedDaycareId} onClick={() => void addRoom()}>
              {busy === "room:add" ? t("loading") : t("careRoomAdd")}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function CareChildRoomSelect({
  role,
  row,
  ops,
  busy,
  setBusy,
  onReload,
}: {
  role: CareDeskRole;
  row: AttendanceRow;
  ops: CareOpsPayload;
  busy: string | null;
  setBusy: (value: string | null) => void;
  onReload: () => Promise<void>;
}) {
  const { t } = useCopy();
  const rooms = ops.rooms.filter((room) => room.daycareId === row.daycareId);
  const current =
    ops.assignments.find(
      (a) => a.daycareId === row.daycareId && (a.bookingId === row.bookingId || a.childName === row.childName),
    )?.roomId ?? "";

  if (role !== "provider" || rooms.length === 0) {
    const name = rooms.find((r) => r.id === current)?.name;
    return name ? <p className="text-sm text-muted">{t("careRoomAssign")}: {name}</p> : null;
  }

  return (
    <label className="text-sm">
      {t("careRoomAssign")}
      <select
        className="mt-1 block rounded-md border border-border bg-bg px-2 py-1.5 text-sm"
        value={current}
        disabled={busy !== null}
        onChange={(e) => {
          const roomId = e.target.value;
          if (!roomId) return;
          setBusy(`room:${row.daycareId}:${row.childName}`);
          void assignChildRoom({
            data: {
              daycareId: row.daycareId,
              roomId,
              bookingId: row.bookingId,
              childName: row.childName,
              parentUserId: row.parentUserId,
            },
          })
            .then(() => onReload())
            .catch((err) => toast.error(err instanceof Error ? err.message : t("tourRespondFailed")))
            .finally(() => setBusy(null));
        }}
      >
        <option value="">{t("careUnassigned")}</option>
        {rooms.map((room) => (
          <option key={room.id} value={room.id}>
            {room.name}
          </option>
        ))}
      </select>
    </label>
  );
}
