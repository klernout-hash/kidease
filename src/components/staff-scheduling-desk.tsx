import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { staffCopy } from "@/lib/staff-scheduling-copy";
import { ROOM_BANDS, SHIFT_ROLES } from "@/lib/staff-scheduling";
import {
  checkRoomRatio,
  listStaffDesk,
  saveEceCertificate,
  saveStaffShift,
  sendEceExpiryReminders,
  staffDeskStatus,
} from "@/lib/server/staff-scheduling";
import { useCopy } from "@/lib/use-copy";

type Desk = Awaited<ReturnType<typeof listStaffDesk>>;

export function StaffDeskLink() {
  const { locale } = useCopy();
  const copy = staffCopy(locale);
  const [on, setOn] = useState(false);
  useEffect(() => {
    void staffDeskStatus()
      .then((row) => setOn(row.enabled))
      .catch(() => setOn(false));
  }, []);
  if (!on) return null;
  return (
    <p className="mt-3">
      <Link
        to="/provider"
        search={{ desk: "staff" }}
        className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
      >
        {copy.title}
      </Link>
    </p>
  );
}

export function StaffSchedulingDesk() {
  const { locale } = useCopy();
  const copy = staffCopy(locale);
  const [desk, setDesk] = useState<Desk | null>(null);
  const [daycareId, setDaycareId] = useState("");
  const [shift, setShift] = useState({ staffName: "", role: "ece", roomBand: "preschool", startsAt: "", endsAt: "" });
  const [cert, setCert] = useState({ staffName: "", level: "", certificateNumber: "", expiresOn: "" });
  const [children, setChildren] = useState("");
  const [ratioBand, setRatioBand] = useState("preschool");
  const [ratio, setRatio] = useState<null | { staffOnShift: number; staffToChildren: number; maxGroup: number; status: string }>(null);
  const [busy, setBusy] = useState(false);

  function load(id = daycareId) {
    void listStaffDesk({ data: { daycareId: id } })
      .then((row) => {
        setDesk(row);
        if (row.enabled && row.daycareId && row.daycareId !== id) setDaycareId(row.daycareId);
        else if (row.enabled && row.centres[0] && !id) setDaycareId(row.centres[0].id);
      })
      .catch(() => setDesk({ enabled: false, centres: [], shifts: [], certs: [], province: "", daycareId: "" }));
  }

  useEffect(() => {
    load();
    // First paint only. Centre changes call load directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!desk) return <p className="text-sm text-muted">{copy.lead}</p>;
  if (!desk.enabled) {
    return <EmptyState title={copy.offTitle} body={copy.offBody} action={copy.home} actionTo="/provider" />;
  }

  const activeId = daycareId || desk.daycareId || desk.centres[0]?.id || "";

  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-display text-2xl">{copy.title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">{copy.lead}</p>
      </div>
      {desk.centres.length > 1 ? (
        <label className="block text-sm">
          {copy.centre}
          <select
            className="ke-input mt-1 min-h-11 w-full"
            value={activeId}
            onChange={(e) => {
              setDaycareId(e.target.value);
              load(e.target.value);
            }}
          >
            {desk.centres.map((centre) => (
              <option key={centre.id} value={centre.id}>
                {centre.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <form
        className="space-y-3 rounded-xl bg-surface p-4 ring-1 ring-border"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void saveStaffShift({ data: { daycareId: activeId, ...shift } })
            .then(() => {
              toast.success(copy.saved);
              setShift({ staffName: "", role: "ece", roomBand: "preschool", startsAt: "", endsAt: "" });
              load(activeId);
            })
            .catch(() => toast.error(copy.bad))
            .finally(() => setBusy(false));
        }}
      >
        <h3 className="font-display text-xl">{copy.shiftTitle}</h3>
        <label className="block text-sm">
          {copy.name}
          <input className="ke-input mt-1 min-h-11 w-full" value={shift.staffName} onChange={(e) => setShift({ ...shift, staffName: e.target.value })} required />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            {copy.role}
            <select className="ke-input mt-1 min-h-11 w-full" value={shift.role} onChange={(e) => setShift({ ...shift, role: e.target.value })}>
              {SHIFT_ROLES.map((role) => (
                <option key={role} value={role}>{copy.roles[role]}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            {copy.room}
            <select className="ke-input mt-1 min-h-11 w-full" value={shift.roomBand} onChange={(e) => setShift({ ...shift, roomBand: e.target.value })}>
              {ROOM_BANDS.map((room) => (
                <option key={room} value={room}>{copy.rooms[room]}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            {copy.start}
            <input type="datetime-local" className="ke-input mt-1 min-h-11 w-full" value={shift.startsAt} onChange={(e) => setShift({ ...shift, startsAt: e.target.value })} required />
          </label>
          <label className="block text-sm">
            {copy.end}
            <input type="datetime-local" className="ke-input mt-1 min-h-11 w-full" value={shift.endsAt} onChange={(e) => setShift({ ...shift, endsAt: e.target.value })} required />
          </label>
        </div>
        <Button type="submit" disabled={busy}>{copy.saveShift}</Button>
      </form>

      {desk.shifts.length === 0 ? <p className="text-sm text-muted">{copy.noShifts}</p> : (
        <ul className="divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
          {desk.shifts.map((row) => (
            <li key={row.id} className="px-4 py-3 text-sm">
              <p className="font-medium">{row.staffName}</p>
              <p className="text-muted">
                {copy.rooms[row.roomBand as keyof typeof copy.rooms] || row.roomBand} · {row.startsAt.slice(0, 16).replace("T", " ")} to {row.endsAt.slice(11, 16)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <form
        className="space-y-3 rounded-xl bg-surface p-4 ring-1 ring-border"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void saveEceCertificate({ data: { daycareId: activeId, ...cert } })
            .then(() => {
              toast.success(copy.saved);
              setCert({ staffName: "", level: "", certificateNumber: "", expiresOn: "" });
              load(activeId);
            })
            .catch(() => toast.error(copy.bad))
            .finally(() => setBusy(false));
        }}
      >
        <h3 className="font-display text-xl">{copy.certTitle}</h3>
        <p className="text-sm text-muted">{copy.certLead}</p>
        <label className="block text-sm">
          {copy.name}
          <input className="ke-input mt-1 min-h-11 w-full" value={cert.staffName} onChange={(e) => setCert({ ...cert, staffName: e.target.value })} required />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            {copy.level}
            <input className="ke-input mt-1 min-h-11 w-full" value={cert.level} onChange={(e) => setCert({ ...cert, level: e.target.value })} />
          </label>
          <label className="block text-sm">
            {copy.number}
            <input className="ke-input mt-1 min-h-11 w-full" value={cert.certificateNumber} onChange={(e) => setCert({ ...cert, certificateNumber: e.target.value })} />
          </label>
        </div>
        <label className="block text-sm">
          {copy.expires}
          <input type="date" className="ke-input mt-1 min-h-11 w-full" value={cert.expiresOn} onChange={(e) => setCert({ ...cert, expiresOn: e.target.value })} required />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="secondary" disabled={busy}>{copy.saveCert}</Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void sendEceExpiryReminders({ data: { daycareId: activeId } })
                .then((row) => toast.success(row.sent ? copy.reminded : copy.noCerts))
                .catch(() => toast.error(copy.bad))
                .finally(() => setBusy(false));
            }}
          >
            {copy.remind}
          </Button>
        </div>
      </form>

      {desk.certs.length === 0 ? <p className="text-sm text-muted">{copy.noCerts}</p> : (
        <ul className="divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
          {desk.certs.map((row) => (
            <li key={row.id} className="px-4 py-3 text-sm">
              <p className="font-medium">{row.staffName}</p>
              <p className="text-muted">{copy.expires} {row.expiresOn}{row.level ? ` · ${row.level}` : ""}</p>
            </li>
          ))}
        </ul>
      )}

      <form
        className="space-y-3 rounded-xl bg-surface p-4 ring-1 ring-border"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void checkRoomRatio({ data: { daycareId: activeId, roomBand: ratioBand, childrenPresent: Number(children) } })
            .then((row) => setRatio(row))
            .catch(() => toast.error(copy.bad))
            .finally(() => setBusy(false));
        }}
      >
        <h3 className="font-display text-xl">{copy.ratioTitle}</h3>
        <p className="text-sm text-muted">{copy.ratioLead}</p>
        <label className="block text-sm">
          {copy.room}
          <select className="ke-input mt-1 min-h-11 w-full" value={ratioBand} onChange={(e) => setRatioBand(e.target.value)}>
            {ROOM_BANDS.map((room) => (
              <option key={room} value={room}>{copy.rooms[room]}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          {copy.children}
          <input inputMode="numeric" className="ke-input mt-1 min-h-11 w-full" value={children} onChange={(e) => setChildren(e.target.value)} required />
        </label>
        <Button type="submit" variant="secondary" disabled={busy}>{copy.check}</Button>
        {ratio ? (
          <p className="text-sm" role="status">
            {copy.staffNow}: {ratio.staffOnShift}. {copy.rule}: 1 / {ratio.staffToChildren}, max {ratio.maxGroup}.{" "}
            {ratio.status === "ok" ? copy.ok : ratio.status === "near" ? copy.near : copy.out}
          </p>
        ) : null}
      </form>
    </section>
  );
}
