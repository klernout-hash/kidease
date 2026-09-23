import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  canLogMedicationDose,
  canScheduleMedication,
  canSubmitIncident,
  INCIDENT_KINDS,
  latestLogForSlot,
  MED_LOG_STATUSES,
  type CareDeskRole,
  type IncidentKind,
  type MedLogStatus,
} from "@/lib/daily-care";
import {
  logCareMedicationDose,
  saveCareMedication,
  submitCareIncident,
  type CareOpsPayload,
} from "@/lib/server/care-ops";
import type { AttendanceRow } from "@/lib/server/ops";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";

const INCIDENT_COPY: Record<IncidentKind, CopyKey> = {
  fall: "careIncidentFall",
  bump: "careIncidentBump",
  bite: "careIncidentBite",
  scrape: "careIncidentScrape",
  illness: "careIncidentIllness",
  other: "careIncidentOther",
};

const DOSE_COPY: Record<MedLogStatus, CopyKey> = {
  given: "careMedGiven",
  missed: "careMedMissed",
  refused: "careMedRefused",
  held: "careMedHeld",
};

function matchesChild(row: AttendanceRow, childName: string, bookingId: string | null) {
  if (bookingId && row.bookingId) return row.bookingId === bookingId;
  return row.daycareId && childName === row.childName;
}

export function CareChildOps({
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
  const meds = ops.medications.filter((m) => m.daycareId === row.daycareId && matchesChild(row, m.childName, m.bookingId));
  const incidents = ops.incidents.filter((i) => i.daycareId === row.daycareId && matchesChild(row, i.childName, i.bookingId));
  const [medDraft, setMedDraft] = useState({ name: "", dosage: "", instructions: "", times: "08:00, 12:00" });
  const [incidentDraft, setIncidentDraft] = useState({
    kind: "fall" as IncidentKind,
    location: "",
    description: "",
    actionTaken: "",
    firstAid: false,
  });

  async function saveMed() {
    if (!canScheduleMedication(role)) return;
    setBusy(`${row.childName}:med`);
    try {
      await saveCareMedication({
        data: {
          daycareId: row.daycareId,
          bookingId: row.bookingId,
          conversationId: row.conversationId,
          childName: row.childName,
          parentUserId: row.parentUserId,
          name: medDraft.name,
          dosage: medDraft.dosage,
          instructions: medDraft.instructions,
          times: medDraft.times,
        },
      });
      toast.success(t("careMedAdded"));
      setMedDraft({ name: "", dosage: "", instructions: "", times: "08:00, 12:00" });
      await onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("careMedNeed"));
    } finally {
      setBusy(null);
    }
  }

  async function logDose(medicationId: string, scheduledTime: string, status: MedLogStatus) {
    if (!canLogMedicationDose(role)) return;
    setBusy(`${medicationId}:${scheduledTime}:${status}`);
    try {
      await logCareMedicationDose({
        data: { medicationId, scheduledTime, status, day: row.day },
      });
      toast.success(t("careMedLogged"));
      await onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tourRespondFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function fileIncident() {
    if (!canSubmitIncident(role)) return;
    setBusy(`${row.childName}:incident`);
    try {
      await submitCareIncident({
        data: {
          daycareId: row.daycareId,
          bookingId: row.bookingId,
          conversationId: row.conversationId,
          childName: row.childName,
          parentUserId: row.parentUserId,
          kind: incidentDraft.kind,
          location: incidentDraft.location,
          description: incidentDraft.description,
          actionTaken: incidentDraft.actionTaken,
          firstAid: incidentDraft.firstAid,
          day: row.day,
        },
      });
      toast.success(t("careIncidentSubmitted"));
      setIncidentDraft({ kind: "fall", location: "", description: "", actionTaken: "", firstAid: false });
      await onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("careIncidentNeed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4" data-ke="care-child-ops">
      <div>
        <p className="font-medium">{t("careMeds")}</p>
        <p className="mt-1 text-sm text-muted">{t("careMedsLead")}</p>
        {meds.length === 0 ? <p className="mt-2 text-sm text-muted">{t("careMedEmpty")}</p> : null}
        <ul className="mt-2 space-y-2">
          {meds.map((med) => (
            <li key={med.id} className="rounded-lg bg-bg p-3 ring-1 ring-border">
              <p className="font-medium">
                {med.name} · {med.dosage}
              </p>
              {med.instructions ? <p className="mt-1 text-sm text-muted">{med.instructions}</p> : null}
              <ul className="mt-2 space-y-1">
                {med.times.map((time) => {
                  const latest = latestLogForSlot({
                    logs: ops.logs,
                    medicationId: med.id,
                    day: row.day,
                    scheduledTime: time,
                  });
                  return (
                    <li key={`${med.id}-${time}`} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="tabular-nums">{time}</span>
                      {latest && latest.status in DOSE_COPY ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          {t(DOSE_COPY[latest.status as MedLogStatus])}
                        </span>
                      ) : null}
                      {role === "provider"
                        ? MED_LOG_STATUSES.map((status) => (
                            <Button
                              key={status}
                              size="sm"
                              variant="secondary"
                              disabled={busy !== null}
                              onClick={() => void logDose(med.id, time, status)}
                            >
                              {t(DOSE_COPY[status])}
                            </Button>
                          ))
                        : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
        {canScheduleMedication(role) ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-sm">
              {t("careMedName")}
              <input
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
                placeholder={t("careMedNamePh")}
                value={medDraft.name}
                onChange={(e) => setMedDraft((prev) => ({ ...prev, name: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              {t("careMedDosage")}
              <input
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
                placeholder={t("careMedDosagePh")}
                value={medDraft.dosage}
                onChange={(e) => setMedDraft((prev) => ({ ...prev, dosage: e.target.value }))}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              {t("careMedTimes")}
              <input
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
                placeholder={t("careMedTimesPh")}
                value={medDraft.times}
                onChange={(e) => setMedDraft((prev) => ({ ...prev, times: e.target.value }))}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              {t("careMedInstructions")}
              <textarea
                rows={2}
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
                value={medDraft.instructions}
                onChange={(e) => setMedDraft((prev) => ({ ...prev, instructions: e.target.value }))}
              />
            </label>
            <div>
              <Button size="sm" disabled={busy !== null} onClick={() => void saveMed()}>
                {busy === `${row.childName}:med` ? t("loading") : t("careMedAdd")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div>
        <p className="font-medium">{t("careIncident")}</p>
        <p className="mt-1 text-sm text-muted">{t("careIncidentLead")}</p>
        {incidents.length === 0 ? <p className="mt-2 text-sm text-muted">{t("careIncidentEmpty")}</p> : null}
        <ul className="mt-2 space-y-2">
          {incidents.map((incident) => (
            <li key={incident.id} className="rounded-lg bg-bg p-3 ring-1 ring-border">
              <p className="text-xs text-subtle">{new Date(incident.createdAt).toLocaleString()}</p>
              <p className="mt-1 font-medium">
                {t(INCIDENT_COPY[incident.kind])}
                {incident.firstAid ? ` · ${t("careIncidentFirstAid")}` : ""}
              </p>
              {incident.location ? <p className="text-sm text-muted">{incident.location}</p> : null}
              <p className="mt-1 whitespace-pre-wrap text-sm">{incident.description}</p>
              {incident.actionTaken ? <p className="mt-1 text-sm text-muted">{incident.actionTaken}</p> : null}
            </li>
          ))}
        </ul>
        {canSubmitIncident(role) ? (
          <div className="mt-3 space-y-2">
            <label className="text-sm">
              {t("careIncidentKind")}
              <select
                className="mt-1 block rounded-md border border-border bg-bg px-2 py-1.5 text-sm"
                value={incidentDraft.kind}
                onChange={(e) => setIncidentDraft((prev) => ({ ...prev, kind: e.target.value as IncidentKind }))}
              >
                {INCIDENT_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(INCIDENT_COPY[kind])}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {t("careIncidentWhere")}
              <input
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
                value={incidentDraft.location}
                onChange={(e) => setIncidentDraft((prev) => ({ ...prev, location: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              {t("careIncidentDesc")}
              <textarea
                rows={3}
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
                value={incidentDraft.description}
                onChange={(e) => setIncidentDraft((prev) => ({ ...prev, description: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              {t("careIncidentAction")}
              <textarea
                rows={2}
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
                value={incidentDraft.actionTaken}
                onChange={(e) => setIncidentDraft((prev) => ({ ...prev, actionTaken: e.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={incidentDraft.firstAid}
                onChange={(e) => setIncidentDraft((prev) => ({ ...prev, firstAid: e.target.checked }))}
              />
              {t("careIncidentFirstAid")}
            </label>
            <Button size="sm" disabled={busy !== null} onClick={() => void fileIncident()}>
              {busy === `${row.childName}:incident` ? t("loading") : t("careIncidentSubmit")}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
