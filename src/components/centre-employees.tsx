import { useEffect, useState } from "react";
import { toast } from "sonner";
import { confirmSuccess } from "@/lib/success-confirm";
import { Button } from "@/components/ui/button";
import {
  acceptCentreInvite,
  inviteCentreEmployee,
  listCentreTeam,
  resendCentreInvite,
  revokeCentreEmployee,
  updateCentreStaffPermissions,
  type CentreTeamPayload,
} from "@/lib/server/centre-members";
import {
  STAFF_AREAS,
  presetGrants,
  type StaffGrants,
  type StaffLevel,
  type StaffPreset,
} from "@/lib/staff-permissions";
import { useCopy } from "@/lib/use-copy";
import { centrePickerLabel } from "@/lib/centre-label";
import { StaffDeskLink } from "@/components/staff-scheduling-desk";
import { TimesheetDeskLink } from "@/components/staff-timesheet-desk";
import type { CopyKey } from "@/lib/copy";

const ROLE_COPY: Record<string, CopyKey> = {
  owner: "employeeRoleOwner",
  manager: "employeeRoleManager",
  staff: "employeeRoleStaff",
  read_only: "employeeRoleReadOnly",
};

type TeamPerson = CentreTeamPayload["people"][number];

function groupTeamPeople(rows: TeamPerson[]): Array<TeamPerson & { key: string; centres: string[]; seats: TeamPerson[] }> {
  const grouped = new Map<string, TeamPerson & { key: string; centres: string[]; seats: TeamPerson[] }>();
  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    const key = email || `${row.kind}-${row.id}`;
    const centre = centrePickerLabel(row.daycareName, null, row.daycareId);
    const prev = grouped.get(key);
    if (!prev) {
      grouped.set(key, { ...row, key, centres: [centre], seats: [row] });
      continue;
    }
    prev.seats.push(row);
    if (!prev.centres.includes(centre)) prev.centres.push(centre);
    if (row.role === "owner") prev.role = row.role;
    if (row.canRevoke) prev.canRevoke = true;
  }
  return [...grouped.values()];
}

const STATUS_COPY: Record<string, CopyKey> = {
  active: "employeeStatusActive",
  pending: "employeeStatusPending",
};

export function CentreEmployeesPanel({
  canInvite,
  canEditPermissions = false,
}: {
  canInvite: boolean;
  canEditPermissions?: boolean;
}) {
  const { t } = useCopy();
  const [team, setTeam] = useState<CentreTeamPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    daycareId: "",
    email: "",
    name: "",
    role: "staff",
  });

  async function load() {
    const next = await listCentreTeam();
    setTeam(next);
    setForm((prev) => ({
      ...prev,
      daycareId: prev.daycareId || next.centres[0]?.id || "",
    }));
  }

  useEffect(() => {
    void load().catch(() => undefined);
  }, []);

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!canInvite) return;
    setBusy(true);
    try {
      const res = await inviteCentreEmployee({
        data: {
          daycareId: form.daycareId,
          email: form.email,
          name: form.name || undefined,
          role: form.role === "lead" ? "staff" : form.role,
          preset: form.role,
        },
      });
      if (res?.mailed) confirmSuccess({ variant: "toast", title: t("employeeInviteSent") });
      else toast.message(t("employeeInviteSaved"));
      setForm((prev) => ({ ...prev, email: "", name: "" }));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("employeeInviteFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onResend(id: string) {
    setBusy(true);
    try {
      const res = await resendCentreInvite({ data: { id } });
      if (res.mailed) toast.success(t("employeeResent"));
      else toast.message(t("employeeResendHeld"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("employeeResendFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id: string, kind: "member" | "invite") {
    if (!canInvite) return;
    if (!window.confirm(t("employeeRevokeConfirm"))) return;
    setBusy(true);
    try {
      await revokeCentreEmployee({ data: { id, kind } });
      toast.success(t("employeeRevoked"));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("employeeRevokeFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">{t("employeesTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("employeesLead")}</p>
        <StaffDeskLink />
        <TimesheetDeskLink />
      </div>

      {canInvite ? (
        <form
          onSubmit={(e) => void onInvite(e)}
          className="rounded-xl bg-surface p-5 shadow-card ring-1 ring-border"
        >
          <h3 className="font-display text-xl">{t("employeeAddTitle")}</h3>
          <p className="mt-1 text-sm text-muted">{t("employeeAddLead")}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {team && team.centres.length > 1 ? (
              <label className="block text-sm sm:col-span-2">
                {t("employeeCentre")}
                <select
                  className="ke-input mt-1 min-h-11"
                  value={form.daycareId}
                  onChange={(e) => setForm((p) => ({ ...p, daycareId: e.target.value }))}
                  required
                >
                  {team.centres.map((c) => (
                    <option key={c.id} value={c.id}>
                      {centrePickerLabel(c.name, null, c.id)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="block text-sm">
              {t("email")}
              <input
                className="ke-input mt-1 min-h-11"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              {t("employeeNameOptional")}
              <input
                className="ke-input mt-1 min-h-11"
                type="text"
                autoComplete="name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </label>
            <fieldset className="block text-sm sm:col-span-2">
              <legend className="font-medium">{t("employeeRole")}</legend>
              <div className="mt-2 grid gap-2">
                {(
                  [
                    ["staff", "employeeRoleStaff", "employeeRoleStaffAccess"],
                    ["lead", "employeePresetLead", "employeePresetLeadAccess"],
                    ["manager", "employeeRoleManager", "employeeRoleManagerAccess"],
                    ["read_only", "employeeRoleReadOnly", "employeeRoleReadOnlyAccess"],
                  ] as const
                )
                  .filter(([value]) => canEditPermissions || value === "staff" || value === "lead")
                  .map(([value, label, summary]) => (
                  <label key={value} className="flex min-h-11 items-start gap-3 rounded-lg px-1 py-1">
                    <input
                      className="mt-1 size-4 shrink-0"
                      type="radio"
                      name="employee-role"
                      value={value}
                      checked={form.role === value}
                      onChange={() => setForm((p) => ({ ...p, role: value }))}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{t(label)}</span>
                      <span className="block text-sm text-muted">{t(summary)}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <Button type="submit" className="mt-4 min-h-11" disabled={busy || !form.daycareId}>
            {t("employeeAddSubmit")}
          </Button>
        </form>
      ) : (
        <p className="rounded-xl bg-surface px-5 py-6 text-sm text-muted ring-1 ring-border">
          {t("employeeOwnerOnly")}
        </p>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border">
        {!team?.people.length ? (
          <li className="px-5 py-8 text-center text-sm text-muted">{t("employeeEmpty")}</li>
        ) : (
          groupTeamPeople(team.people).map((row) => (
            <li key={row.key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium break-words">{row.name || row.email || t("employeeNoName")}</p>
                <p className="text-sm text-muted break-all">{row.email}</p>
                <p className="mt-1 text-xs text-subtle">
                  {row.centres.join(" · ")} · {row.preset === "lead" ? t("employeePresetLead") : t(ROLE_COPY[row.role] ?? "employeeRoleStaff")} ·{" "}
                  {t(STATUS_COPY[row.status] ?? "employeeStatusPending")}
                </p>
              </div>
              {row.status === "pending" || row.canRevoke ? (
                <div className="flex flex-wrap gap-2">
                  {row.status === "pending" && row.canRevoke ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11 shrink-0"
                      data-ke="employee-resend"
                      disabled={busy}
                      onClick={() => void onResend(row.id)}
                    >
                      {t("employeeResend")}
                    </Button>
                  ) : null}
                  {row.canRevoke ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11 shrink-0"
                      disabled={busy}
                      onClick={() => void onRevoke(row.id, row.kind)}
                    >
                      {t("employeeRevoke")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {canEditPermissions
                ? row.seats
                    .filter((seat) => seat.kind === "member" && seat.role !== "owner")
                    .map((seat) => (
                      <StaffAccessEditor
                        key={seat.id}
                        memberId={seat.id}
                        centreName={row.centres.length > 1 ? seat.daycareName : undefined}
                        preset={
                          seat.preset === "lead" || seat.preset === "manager" || seat.preset === "staff" || seat.preset === "custom"
                            ? seat.preset
                            : "custom"
                        }
                        grants={seat.grants}
                        busy={busy}
                        onSaved={() => load()}
                      />
                    ))
                : null}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

const AREA_COPY = {
  bills: "employeeAreaBills",
  messages: "employeeAreaMessages",
  children: "employeeAreaChildren",
  listing: "employeeAreaListing",
  calendar: "employeeAreaCalendar",
  schedule: "employeeAreaSchedule",
  requests: "employeeAreaRequests",
  documents: "employeeAreaDocuments",
} as const;

function StaffAccessEditor({
  memberId,
  centreName,
  preset,
  grants,
  busy,
  onSaved,
}: {
  memberId: string;
  centreName?: string;
  preset: StaffPreset;
  grants: StaffGrants;
  busy: boolean;
  onSaved: () => Promise<void> | void;
}) {
  const { t } = useCopy();
  const [choice, setChoice] = useState<StaffPreset>(preset);
  const [levels, setLevels] = useState<StaffGrants>(grants);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setChoice(preset);
    setLevels(grants);
  }, [preset, grants]);

  function pickPreset(next: "staff" | "lead" | "manager") {
    setChoice(next);
    setLevels(presetGrants(next));
  }

  function pickLevel(area: (typeof STAFF_AREAS)[number], level: StaffLevel) {
    setChoice("custom");
    setLevels((current) => ({ ...current, [area]: level }));
  }

  async function save() {
    setSaving(true);
    try {
      await updateCentreStaffPermissions({ data: { memberId, preset: choice, grants: levels } });
      toast.success(t("employeePermissionSaved"));
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("employeePermissionFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset className="w-full rounded-lg p-3 ring-1 ring-border sm:basis-full" data-ke="staff-permissions">
      <legend className="px-1 text-sm font-medium">{t("employeePermissionsTitle")}</legend>
      {centreName ? <p className="text-sm text-muted">{centreName}</p> : null}
      <p className="mt-1 text-sm text-muted">{t("employeePermissionsLead")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(
          [
            ["staff", "employeePresetStaff"],
            ["lead", "employeePresetLead"],
            ["manager", "employeePresetManager"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`min-h-11 rounded-full px-4 text-sm font-medium touch-manipulation ${choice === value ? "bg-primary text-primary-fg" : "bg-surface ring-1 ring-border"}`}
            aria-pressed={choice === value}
            onClick={() => pickPreset(value)}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-2">
        {STAFF_AREAS.map((area) => (
          <label key={area} className="grid gap-1 text-sm sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center">
            <span>{t(AREA_COPY[area])}</span>
            <select
              className="ke-input min-h-11 w-full"
              value={levels[area]}
              aria-label={t(AREA_COPY[area])}
              onChange={(event) => pickLevel(area, event.target.value as StaffLevel)}
            >
              <option value="none">{t("employeePermissionNone")}</option>
              <option value="view">{t("employeePermissionView")}</option>
              <option value="edit">{t("employeePermissionEdit")}</option>
            </select>
          </label>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted">{t("employeeOwnerOnlyNote")}</p>
      <Button type="button" variant="secondary" className="mt-3 min-h-11" disabled={busy || saving} onClick={() => void save()}>
        {t("employeePermissionSave")}
      </Button>
    </fieldset>
  );
}

export function AcceptEmployeeInvite({ token }: { token: string }) {
  const { t } = useCopy();
  return (
    <Button
      type="button"
      className="min-h-11"
      onClick={() => {
        void acceptCentreInvite({ data: token })
          .then(() => {
            confirmSuccess({ variant: "toast", title: t("employeeAccepted") });
            window.location.assign("/provider?desk=requests");
          })
          .catch((err) => {
            toast.error(err instanceof Error ? err.message : t("employeeAcceptFailed"));
          });
      }}
    >
      {t("employeeAccept")}
    </Button>
  );
}
