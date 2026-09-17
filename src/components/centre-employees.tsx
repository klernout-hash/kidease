import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CENTRE_INVITE_ACCEPT_PATH } from "@/lib/centre-roles";
import {
  acceptCentreInvite,
  inviteCentreEmployee,
  listCentreTeam,
  revokeCentreEmployee,
  type CentreTeamPayload,
} from "@/lib/server/centre-members";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";

function inviteActionMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return fallback;
}

const ROLE_COPY: Record<string, CopyKey> = {
  owner: "employeeRoleOwner",
  manager: "employeeRoleManager",
  staff: "employeeRoleStaff",
  read_only: "employeeRoleReadOnly",
};

const STATUS_COPY: Record<string, CopyKey> = {
  active: "employeeStatusActive",
  pending: "employeeStatusPending",
};

export function CentreEmployeesPanel({ canInvite }: { canInvite: boolean }) {
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
          role: form.role,
        },
      });
      if (res?.mailed) toast.success(t("employeeInviteSent"));
      else toast.message(t("employeeInviteSaved"));
      setForm((prev) => ({ ...prev, email: "", name: "" }));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("employeeInviteFailed"));
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
                      {c.name}
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
            <label className="block text-sm sm:col-span-2">
              {t("employeeRole")}
              <select
                className="ke-input mt-1 min-h-11"
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
              >
                <option value="staff">{t("employeeRoleStaff")}</option>
                <option value="manager">{t("employeeRoleManager")}</option>
                <option value="read_only">{t("employeeRoleReadOnly")}</option>
              </select>
            </label>
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
          team.people.map((row) => (
            <li key={`${row.kind}-${row.id}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium break-words">{row.name || row.email || t("employeeNoName")}</p>
                <p className="text-sm text-muted break-all">{row.email}</p>
                <p className="mt-1 text-xs text-subtle">
                  {row.daycareName} · {t(ROLE_COPY[row.role] ?? "employeeRoleStaff")} ·{" "}
                  {t(STATUS_COPY[row.status] ?? "employeeStatusPending")}
                </p>
              </div>
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
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

export function AcceptEmployeeInvite({ token }: { token: string }) {
  const { t } = useCopy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onJoin() {
    if (busy) return;
    if (!(token || "").trim()) {
      const message = t("employeeInviteGone");
      setError(message);
      toast.error(message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await acceptCentreInvite({ data: token });
      toast.success(t("employeeAccepted"));
      window.location.assign(CENTRE_INVITE_ACCEPT_PATH);
    } catch (err) {
      const message = inviteActionMessage(err, t("employeeAcceptFailed"));
      setError(message);
      toast.error(message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button type="button" className="min-h-11" disabled={busy} onClick={() => void onJoin()}>
        {busy ? t("employeeAccepting") : t("employeeAccept")}
      </Button>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
