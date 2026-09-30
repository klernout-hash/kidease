import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { confirmSuccess } from "@/lib/success-confirm";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { readListingImage } from "@/components/provider-listing-forms";
import { UploadLimitHint } from "@/components/upload-limit-hint";
import {
  attendanceFromAction,
  CARE_OPS_LATER_OUT_OF_SCOPE,
  DAILY_CARE_HONESTY,
  journalPhotoDecision,
  JOURNAL_MAX_PHOTOS,
  parentCanMessageCentre,
  presenceFromAttendance,
  todayYmd,
  type CareAttendanceAction,
  type CareDeskRole,
  type JournalPhoto,
} from "@/lib/daily-care";
import { sendConnectedMessage } from "@/lib/server/inbox";
import { listDailyJournals, postDailyJournal, type DailyJournalRow } from "@/lib/server/daily-care";
import { listCareOps, getLicensedMonth, saveDayNote, saveEnrolmentSplit, type CareOpsPayload, type LicensedMonthChild } from "@/lib/server/care-ops";
import { getWeekSchedule, saveAttendance, type AttendanceRow } from "@/lib/server/ops";
import { createBill, sendBill } from "@/lib/server/billing";
import { buildMonthLedger, canWriteDayNote, dollarsToDailyCents, parentShareDollars } from "@/lib/licensed-day";
import { CareChildOps } from "@/components/care-child-ops";
import { CareChildRoomSelect, CareOpsPanel } from "@/components/care-ops-panel";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";

const PRESENCE_COPY: Record<ReturnType<typeof presenceFromAttendance>, CopyKey> = {
  here: "careHere",
  picked_up: "carePickedUp",
  expected: "careExpected",
  absent: "careAbsent",
  sick: "careSick",
  vacation: "careVacation",
};

function childKey(row: Pick<AttendanceRow, "daycareId" | "childName" | "bookingId">) {
  return `${row.daycareId}:${row.bookingId ?? row.childName}`;
}

export function DailyCareDesk({
  role,
  daycareId,
}: {
  role: CareDeskRole;
  daycareId?: string;
}) {
  const { t, locale } = useCopy();
  const day = todayYmd();
  const [items, setItems] = useState<AttendanceRow[]>([]);
  const [journals, setJournals] = useState<DailyJournalRow[]>([]);
  const [ops, setOps] = useState<CareOpsPayload | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { body: string; photos: JournalPhoto[] }>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [monthChildren, setMonthChildren] = useState<LicensedMonthChild[]>([]);
  const [monthLabel, setMonthLabel] = useState(day.slice(0, 7));
  const [dayDrafts, setDayDrafts] = useState<Record<string, { food: string; nap: string; incident: string; photo: string }>>({});
  const [splitDrafts, setSplitDrafts] = useState<Record<string, { parent: string; program: string; kind: string; label: string }>>({});

  const load = useCallback(async () => {
    const [week, feed, careOps, month] = await Promise.all([
      getWeekSchedule({ data: { daycareId, weekStart: day } }).catch(() => ({
        days: [day],
        items: [] as AttendanceRow[],
        role,
      })),
      listDailyJournals({ data: { daycareId, day } }).catch(() => ({ day, items: [] as DailyJournalRow[] })),
      listCareOps({ data: { daycareId, day } }).catch(() => null),
      getLicensedMonth({ data: { daycareId, month: day.slice(0, 7) } }).catch(() => ({
        month: day.slice(0, 7),
        children: [] as LicensedMonthChild[],
      })),
    ]);
    setItems(week.items.filter((row) => row.day === day));
    setJournals(feed.items);
    setOps(careOps);
    setMonthChildren(month.children);
    setMonthLabel(month.month);
    setReady(true);
  }, [daycareId, day, role]);

  useEffect(() => {
    void load();
  }, [load]);

  const byChild = useMemo(() => {
    const map = new Map<string, { row: AttendanceRow; journals: DailyJournalRow[] }>();
    for (const row of items) {
      map.set(childKey(row), { row, journals: [] });
    }
    for (const journal of journals) {
      const key = `${journal.daycareId}:${journal.bookingId ?? journal.childName}`;
      const hit = map.get(key);
      if (hit) hit.journals.push(journal);
      else {
        const loose = [...map.values()].find(
          (entry) => entry.row.daycareId === journal.daycareId && entry.row.childName === journal.childName,
        );
        if (loose) loose.journals.push(journal);
      }
    }
    return [...map.values()];
  }, [items, journals]);

  async function mark(row: AttendanceRow, action: CareAttendanceAction) {
    const key = `${childKey(row)}:${action}`;
    setBusy(key);
    try {
      await saveAttendance({
        data: {
          daycareId: row.daycareId,
          bookingId: row.bookingId,
          conversationId: row.conversationId,
          childName: row.childName,
          parentUserId: row.parentUserId,
          day: row.day,
          dropOff: row.dropOff,
          pickUp: row.pickUp,
          status: attendanceFromAction(action),
          notes: notes[childKey(row)] ?? row.notes,
        },
      });
      confirmSuccess({
        variant: "toast",
        title:
          action === "check_in"
            ? t("careCheckedIn")
            : action === "check_out"
              ? t("careCheckedOut")
              : action === "sick"
                ? t("careMarkedSick")
                : action === "vacation"
                  ? t("careMarkedVacation")
                  : t("careAbsent"),
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tourRespondFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function sendNote(row: AttendanceRow) {
    const text = (notes[childKey(row)] || "").trim();
    if (!text || !row.conversationId) return;
    if (!parentCanMessageCentre({ hasConversation: Boolean(row.conversationId), enrolled: true })) return;
    setBusy(`${childKey(row)}:note`);
    try {
      const res = await sendConnectedMessage({ data: { conversationId: row.conversationId, body: text } });
      if (!res.ok) throw new Error(t("tourRespondFailed"));
      confirmSuccess({ variant: "toast", title: t("careMessageSent") });
      setNotes((prev) => ({ ...prev, [childKey(row)]: "" }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tourRespondFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function publishJournal(row: AttendanceRow) {
    const draft = drafts[childKey(row)] ?? { body: "", photos: [] };
    setBusy(`${childKey(row)}:journal`);
    try {
      await postDailyJournal({
        data: {
          daycareId: row.daycareId,
          bookingId: row.bookingId,
          conversationId: row.conversationId,
          childName: row.childName,
          parentUserId: row.parentUserId,
          day: row.day,
          body: draft.body,
          photos: draft.photos,
        },
      });
      confirmSuccess({ variant: "toast", title: t("careJournalPosted") });
      setDrafts((prev) => ({ ...prev, [childKey(row)]: { body: "", photos: [] } }));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("careJournalNeedText"));
    } finally {
      setBusy(null);
    }
  }

  function addPhoto(row: AttendanceRow, file: File | undefined) {
    if (!file) return;
    const decision = journalPhotoDecision({ type: file.type, size: file.size });
    if (decision === "video") {
      toast.error(t("carePhotoVideoBlocked"));
      return;
    }
    if (decision === "type" || decision === "size") {
      toast.error(t("carePhotoTooBig"));
      return;
    }
    const key = childKey(row);
    const current = drafts[key]?.photos ?? [];
    if (current.length >= JOURNAL_MAX_PHOTOS) {
      toast.error(t("carePhotoTooBig"));
      return;
    }
    readListingImage(
      file,
      (src) => {
        setDrafts((prev) => {
          const next = prev[key] ?? { body: "", photos: [] };
          return { ...prev, [key]: { ...next, photos: [...next.photos, { src, name: file.name }].slice(0, JOURNAL_MAX_PHOTOS) } };
        });
      },
      () => toast.error(t("carePhotoTooBig")),
    );
  }

  async function saveDay(row: AttendanceRow) {
    if (!canWriteDayNote(row.status)) return;
    const draft = dayDrafts[childKey(row)] ?? { food: "", nap: "", incident: "", photo: "" };
    setBusy(`${childKey(row)}:day`);
    try {
      await saveDayNote({
        data: {
          daycareId: row.daycareId,
          bookingId: row.bookingId,
          childName: row.childName,
          day: row.day,
          food: draft.food,
          nap: draft.nap,
          incident: draft.incident,
          photo: draft.photo,
        },
      });
      confirmSuccess({ variant: "toast", title: t("careDayNoteSaved") });
      setDayDrafts((prev) => ({ ...prev, [childKey(row)]: { food: "", nap: "", incident: "", photo: "" } }));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tourRespondFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function saveSplit(row: AttendanceRow) {
    if (!row.bookingId) return;
    const draft = splitDrafts[childKey(row)] ?? { parent: "", program: "", kind: "cwelcc", label: "" };
    const parentDailyCents = dollarsToDailyCents(draft.parent);
    const programDailyCents = draft.kind === "none" ? 0 : dollarsToDailyCents(draft.program);
    if (parentDailyCents == null || programDailyCents == null) {
      toast.error(t("careSplitNeedAmount"));
      return;
    }
    setBusy(`${childKey(row)}:split`);
    try {
      await saveEnrolmentSplit({
        data: {
          daycareId: row.daycareId,
          bookingId: row.bookingId,
          childName: row.childName,
          parentDailyCents,
          programDailyCents,
          programKind: draft.kind,
          programLabel: draft.label,
        },
      });
      confirmSuccess({ variant: "toast", title: t("careSplitSaved") });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tourRespondFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function sendParentShare(child: LicensedMonthChild) {
    if (role !== "provider" || !child.parentUserId || !child.split) return;
    const ledger = buildMonthLedger({
      statuses: child.days.map((d) => d.status),
      parentDailyCents: child.split.parentDailyCents,
      programDailyCents: child.split.programDailyCents,
    });
    const dollars = parentShareDollars(ledger.parentCents);
    if (!dollars) return;
    setBusy(`bill:${child.bookingId}`);
    try {
      const bill = await createBill({
        data: {
          daycareId: child.daycareId,
          parentUserId: child.parentUserId,
          bookingId: child.bookingId,
          amountCad: dollars,
          period: monthLabel,
          memo: t("careShareMemo").replace("{month}", monthLabel).replace("{days}", String(ledger.present)),
        },
      });
      await sendBill({ data: bill.id });
      confirmSuccess({ variant: "toast", title: t("careShareSent") });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tourRespondFailed"));
    } finally {
      setBusy(null);
    }
  }

  function money(cents: number) {
    return (cents / 100).toLocaleString(locale === "fr" ? "fr-CA" : "en-CA", { style: "currency", currency: "CAD" });
  }

  return (
    <section className="space-y-6" data-ke="daily-care">
      <div>
        <h2 className="font-display text-2xl">{t("dailyCare")}</h2>
        <p className="mt-1 text-sm text-muted">{role === "provider" ? t("dailyCareStaffLead") : t("dailyCareParentLead")}</p>
        <p className="mt-2 text-xs text-subtle">{t("careOpsLite")}</p>
        <p className="mt-1 text-xs text-subtle">{t("careLaterOut")}</p>
      </div>

      {ready && ops ? (
        <CareOpsPanel
          role={role}
          day={day}
          ops={ops}
          attendance={items}
          busy={busy}
          setBusy={setBusy}
          onReload={load}
        />
      ) : null}

      {!ready ? (
        <div className="space-y-3" aria-busy="true">
          <div className="ke-skel h-28 rounded-xl" />
          <div className="ke-skel h-28 rounded-xl" />
        </div>
      ) : byChild.length === 0 ? (
        <EmptyState
          title={t("careNoEnrolled")}
          body={t("careNoEnrolledLead")}
          action={role === "provider" ? t("leadInbox") : t("emptyFindCare")}
          actionTo={role === "provider" ? "/inbox?view=centre" : "/search"}
        />
      ) : (
        <ul className="space-y-4">
          {byChild.map(({ row, journals: childJournals }) => {
            const key = childKey(row);
            const presence = presenceFromAttendance(row.status);
            const draft = drafts[key] ?? { body: "", photos: [] };
            return (
              <li key={key} className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{row.childName}</p>
                    <p className="text-sm text-muted">{row.daycareName}</p>
                    <p className="mt-1 text-sm">
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                        {t(PRESENCE_COPY[presence])}
                      </span>
                    </p>
                    {ops ? (
                      <div className="mt-2">
                        <CareChildRoomSelect
                          role={role}
                          row={row}
                          ops={ops}
                          busy={busy}
                          setBusy={setBusy}
                          onReload={load}
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={busy !== null || row.status === "arrived"}
                      onClick={() => void mark(row, "check_in")}
                    >
                      {busy === `${key}:check_in` ? t("loading") : t("careCheckIn")}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy !== null || row.status === "departed"}
                      onClick={() => void mark(row, "check_out")}
                    >
                      {busy === `${key}:check_out` ? t("loading") : t("careCheckOut")}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy !== null || row.status === "absent"}
                      onClick={() => void mark(row, "absent")}
                    >
                      {t("careMarkAbsent")}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy !== null || row.status === "sick"}
                      onClick={() => void mark(row, "sick")}
                    >
                      {t("careMarkSick")}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy !== null || row.status === "vacation"}
                      onClick={() => void mark(row, "vacation")}
                    >
                      {t("careMarkVacation")}
                    </Button>
                    {row.conversationId ? (
                      <Button size="sm" variant="secondary" asChild>
                        <Link to="/inbox/$id" params={{ id: row.conversationId }}>
                          {t("openChat")}
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>

                <DayRecord
                  role={role}
                  row={row}
                  note={ops?.dayNotes.find((n) => n.daycareId === row.daycareId && n.childName === row.childName) ?? null}
                  split={ops?.splits.find((s) => s.bookingId && s.bookingId === row.bookingId) ?? null}
                  draft={dayDrafts[key] ?? { food: "", nap: "", incident: "", photo: "" }}
                  splitDraft={splitDrafts[key]}
                  busy={busy}
                  onDraft={(next) => setDayDrafts((prev) => ({ ...prev, [key]: next }))}
                  onSplit={(next) => setSplitDrafts((prev) => ({ ...prev, [key]: next }))}
                  onSaveDay={() => void saveDay(row)}
                  onSaveSplit={() => void saveSplit(row)}
                  onPhoto={(file) => {
                    if (!file) return;
                    const decision = journalPhotoDecision({ type: file.type, size: file.size });
                    if (decision !== "ok") {
                      toast.error(decision === "video" ? t("carePhotoVideoBlocked") : t("carePhotoTooBig"));
                      return;
                    }
                    readListingImage(
                      file,
                      (src) => setDayDrafts((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { food: "", nap: "", incident: "", photo: "" }), photo: src } })),
                      () => toast.error(t("carePhotoTooBig")),
                    );
                  }}
                />

                {row.conversationId ? (
                  <div className="mt-4">
                    <label className="text-sm font-medium" htmlFor={`care-note-${key}`}>
                      {t("careMessage")}
                    </label>
                    <textarea
                      id={`care-note-${key}`}
                      rows={2}
                      className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
                      placeholder={t("careMessagePh")}
                      value={notes[key] ?? ""}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [key]: e.target.value }))}
                    />
                    <div className="mt-2">
                      <Button size="sm" variant="secondary" disabled={busy !== null || !(notes[key] || "").trim()} onClick={() => void sendNote(row)}>
                        {busy === `${key}:note` ? t("loading") : t("send")}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {role === "provider" ? (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="font-medium">{t("careJournal")}</p>
                    <p className="mt-1 text-sm text-muted">{t("careJournalLead")}</p>
                    <textarea
                      rows={3}
                      className="mt-2 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
                      placeholder={t("careJournalBody")}
                      value={draft.body}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [key]: { body: e.target.value, photos: prev[key]?.photos ?? [] } }))
                      }
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="text-sm">
                        <span className="sr-only">{t("careJournalPhotos")}</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="text-sm"
                          onChange={(e) => {
                            addPhoto(row, e.target.files?.[0]);
                            e.currentTarget.value = "";
                          }}
                        />
                        <UploadLimitHint hint={t("carePhotoTooBig")} />
                      </label>
                      <Button size="sm" disabled={busy !== null} onClick={() => void publishJournal(row)}>
                        {busy === `${key}:journal` ? t("loading") : t("careJournalPost")}
                      </Button>
                    </div>
                    {draft.photos.length ? (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {draft.photos.map((photo, i) => (
                          <li key={`${photo.src.slice(0, 24)}-${i}`}>
                            <img src={photo.src} alt={photo.name || t("careJournalPhotos")} className="h-16 w-16 rounded-md object-cover ring-1 ring-border" />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                {ops ? (
                  <CareChildOps
                    role={role}
                    row={row}
                    ops={ops}
                    busy={busy}
                    setBusy={setBusy}
                    onReload={load}
                  />
                ) : null}

                <div className="mt-4 space-y-3">
                  {childJournals.length === 0 && role === "parent" ? (
                    <p className="text-sm text-muted">{t("careJournalEmpty")}</p>
                  ) : null}
                  {childJournals.map((journal) => (
                    <article key={journal.id} className="rounded-lg bg-bg p-3 ring-1 ring-border">
                      <p className="text-xs text-subtle">{new Date(journal.createdAt).toLocaleString()}</p>
                      {journal.body ? <p className="mt-1 whitespace-pre-wrap text-sm">{journal.body}</p> : null}
                      {journal.photos.length ? (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {journal.photos.map((photo, i) => (
                            <li key={`${journal.id}-${i}`}>
                              <img src={photo.src} alt={photo.name || journal.childName} className="h-24 w-24 rounded-md object-cover ring-1 ring-border" />
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </article>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {ready && monthChildren.length ? (
        <MonthShares
          role={role}
          month={monthLabel}
          rows={monthChildren}
          busy={busy}
          money={money}
          onSend={(child) => void sendParentShare(child)}
        />
      ) : null}
      <p className="sr-only">{DAILY_CARE_HONESTY}</p>
      <p className="sr-only">{CARE_OPS_LATER_OUT_OF_SCOPE}</p>
    </section>
  );
}

function DayRecord({
  role,
  row,
  note,
  split,
  draft,
  splitDraft,
  busy,
  onDraft,
  onSplit,
  onSaveDay,
  onSaveSplit,
  onPhoto,
}: {
  role: CareDeskRole;
  row: AttendanceRow;
  note: { food: string; nap: string; incident: string; photo: string } | null;
  split: { parentDailyCents: number; programDailyCents: number; programKind: string; programLabel: string } | null;
  draft: { food: string; nap: string; incident: string; photo: string };
  splitDraft?: { parent: string; program: string; kind: string; label: string };
  busy: string | null;
  onDraft: (next: { food: string; nap: string; incident: string; photo: string }) => void;
  onSplit: (next: { parent: string; program: string; kind: string; label: string }) => void;
  onSaveDay: () => void;
  onSaveSplit: () => void;
  onPhoto: (file: File | undefined) => void;
}) {
  const { t } = useCopy();
  const marked = canWriteDayNote(row.status);
  const amounts = splitDraft ?? {
    parent: split ? (split.parentDailyCents / 100).toFixed(2) : "",
    program: split ? (split.programDailyCents / 100).toFixed(2) : "",
    kind: split?.programKind ?? "cwelcc",
    label: split?.programLabel ?? "",
  };
  return (
    <div className="mt-4 border-t border-border pt-4" data-ke="day-record">
      <p className="font-medium">{t("careDayNote")}</p>
      {marked ? null : <p className="mt-1 text-sm text-muted">{t("careDayNoteLocked")}</p>}
      {note && (note.food || note.nap || note.incident || note.photo) ? (
        <div className="mt-2 space-y-1 text-sm">
          {note.food ? <p>{t("careFood")}: {note.food}</p> : null}
          {note.nap ? <p>{t("careNap")}: {note.nap}</p> : null}
          {note.incident ? <p>{t("careIncidentNote")}: {note.incident}</p> : null}
          {note.photo ? <img src={note.photo} alt="" className="mt-2 h-24 w-24 rounded-md object-cover ring-1 ring-border" /> : null}
        </div>
      ) : null}
      {role === "provider" && marked ? (
        <div className="mt-2 space-y-2">
          <label className="block text-sm">
            {t("careFood")}
            <input className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" value={draft.food} onChange={(e) => onDraft({ ...draft, food: e.target.value })} />
          </label>
          <label className="block text-sm">
            {t("careNap")}
            <input className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" value={draft.nap} onChange={(e) => onDraft({ ...draft, nap: e.target.value })} />
          </label>
          <label className="block text-sm">
            {t("careIncidentNote")}
            <textarea rows={2} className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" value={draft.incident} onChange={(e) => onDraft({ ...draft, incident: e.target.value })} />
          </label>
          <label className="block text-sm">
            {t("careJournalPhotos")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="mt-1 block text-sm"
              onChange={(e) => {
                onPhoto(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
          </label>
          <Button size="sm" disabled={busy !== null} onClick={onSaveDay}>
            {t("careDayNoteSave")}
          </Button>
        </div>
      ) : null}
      {role === "provider" && row.bookingId ? (
        <div className="mt-4 space-y-2">
          <p className="font-medium">{t("careSplitTitle")}</p>
          <p className="text-sm text-muted">{t("careProgramNotCollected")}</p>
          <div className="flex flex-wrap gap-2">
            <label className="text-sm">
              {t("careParentDaily")}
              <input className="mt-1 block w-28 rounded-md border border-border bg-bg px-3 py-2 text-sm" inputMode="decimal" value={amounts.parent} onChange={(e) => onSplit({ ...amounts, parent: e.target.value })} />
            </label>
            <label className="text-sm">
              {t("careProgramDaily")}
              <input className="mt-1 block w-28 rounded-md border border-border bg-bg px-3 py-2 text-sm" inputMode="decimal" value={amounts.program} onChange={(e) => onSplit({ ...amounts, program: e.target.value })} disabled={amounts.kind === "none"} />
            </label>
            <label className="text-sm">
              {t("careProgramKind")}
              <select className="mt-1 block rounded-md border border-border bg-bg px-2 py-2 text-sm" value={amounts.kind} onChange={(e) => onSplit({ ...amounts, kind: e.target.value, program: e.target.value === "none" ? "0" : amounts.program })}>
                <option value="cwelcc">{t("careProgramCwelcc")}</option>
                <option value="subsidy">{t("careProgramSubsidy")}</option>
                <option value="none">{t("careProgramNone")}</option>
              </select>
            </label>
            <label className="min-w-40 flex-1 text-sm">
              {t("careProgramLabel")}
              <input className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" placeholder={t("careProgramLabelPh")} value={amounts.label} onChange={(e) => onSplit({ ...amounts, label: e.target.value })} />
            </label>
          </div>
          <Button size="sm" variant="secondary" disabled={busy !== null} onClick={onSaveSplit}>
            {t("careSplitSave")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function MonthShares({
  role,
  month,
  rows,
  busy,
  money,
  onSend,
}: {
  role: CareDeskRole;
  month: string;
  rows: LicensedMonthChild[];
  busy: string | null;
  money: (cents: number) => string;
  onSend: (child: LicensedMonthChild) => void;
}) {
  const { t } = useCopy();
  return (
    <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="licensed-month">
      <h3 className="font-medium">{t("careMonthTitle").replace("{month}", month)}</h3>
      <p className="mt-1 text-sm text-muted">{t("careMonthLead")}</p>
      <ul className="mt-3 space-y-3">
        {rows.map((child) => {
          const ledger = buildMonthLedger({
            statuses: child.days.map((d) => d.status),
            parentDailyCents: child.split?.parentDailyCents ?? 0,
            programDailyCents: child.split?.programDailyCents ?? 0,
          });
          const dollars = parentShareDollars(ledger.parentCents);
          return (
            <li key={child.bookingId} className="rounded-lg bg-bg p-3 ring-1 ring-border">
              <p className="font-medium">{child.childName}</p>
              <p className="text-sm text-muted">{child.daycareName}{child.split?.programLabel ? ` · ${child.split.programLabel}` : ""}</p>
              <p className="mt-1 text-sm">
                {t("carePresentDays").replace("{n}", String(ledger.present))}
                {" · "}
                {t("careAbsent")} {ledger.absent}
                {" · "}
                {t("careSick")} {ledger.sick}
                {" · "}
                {t("careVacation")} {ledger.vacation}
              </p>
              <p className="mt-1 text-sm">
                {t("careParentOwes").replace("{amount}", money(ledger.parentCents))}
                {" · "}
                {t("careProgramOwes").replace("{amount}", money(ledger.programCents))}
              </p>
              <p className="mt-1 text-xs text-subtle">{t("careProgramNotCollected")}</p>
              {role === "provider" && dollars && child.parentUserId ? (
                <Button className="mt-2" size="sm" disabled={busy !== null} onClick={() => onSend(child)}>
                  {busy === `bill:${child.bookingId}` ? t("loading") : t("careSendParentShare")}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
