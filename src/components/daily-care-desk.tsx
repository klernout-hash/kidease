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
import { listCareOps, type CareOpsPayload } from "@/lib/server/care-ops";
import { getWeekSchedule, saveAttendance, type AttendanceRow } from "@/lib/server/ops";
import { CareChildOps } from "@/components/care-child-ops";
import { CareChildRoomSelect, CareOpsPanel } from "@/components/care-ops-panel";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";

const PRESENCE_COPY: Record<ReturnType<typeof presenceFromAttendance>, CopyKey> = {
  here: "careHere",
  picked_up: "carePickedUp",
  expected: "careExpected",
  absent: "careAbsent",
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
  const { t } = useCopy();
  const day = todayYmd();
  const [items, setItems] = useState<AttendanceRow[]>([]);
  const [journals, setJournals] = useState<DailyJournalRow[]>([]);
  const [ops, setOps] = useState<CareOpsPayload | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { body: string; photos: JournalPhoto[] }>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [week, feed, careOps] = await Promise.all([
      getWeekSchedule({ data: { daycareId, weekStart: day } }).catch(() => ({
        days: [day],
        items: [] as AttendanceRow[],
        role,
      })),
      listDailyJournals({ data: { daycareId, day } }).catch(() => ({ day, items: [] as DailyJournalRow[] })),
      listCareOps({ data: { daycareId, day } }).catch(() => null),
    ]);
    setItems(week.items.filter((row) => row.day === day));
    setJournals(feed.items);
    setOps(careOps);
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
        title: action === "check_in" ? t("careCheckedIn") : action === "check_out" ? t("careCheckedOut") : t("careAbsent"),
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
                    {row.conversationId ? (
                      <Button size="sm" variant="secondary" asChild>
                        <Link to="/inbox/$id" params={{ id: row.conversationId }}>
                          {t("openChat")}
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>

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
      <p className="sr-only">{DAILY_CARE_HONESTY}</p>
      <p className="sr-only">{CARE_OPS_LATER_OUT_OF_SCOPE}</p>
    </section>
  );
}
