import { useState } from "react";
import { TRACK_NOTE_MAX, TRACK_STATUSES, clampTrackNote, type TrackStatus } from "@/lib/parent-tracker";
import { updateSavedTrack } from "@/lib/server/parent-tracker";
import type { CopyKey } from "@/lib/copy";
import { useCopy } from "@/lib/use-copy";

const LABEL: Record<TrackStatus, CopyKey> = {
  interested: "trackInterested",
  called: "trackCalled",
  toured: "trackToured",
  waitlisted: "trackWaitlisted",
  enrolled: "trackEnrolled",
};

export function SavedTrack({
  daycareId,
  status,
  callNote,
  tourNote,
  onChange,
}: {
  daycareId: string;
  status: TrackStatus;
  callNote: string;
  tourNote: string;
  onChange: (next: { trackStatus: TrackStatus; callNote: string; tourNote: string }) => void;
}) {
  const { t } = useCopy();
  const [statusValue, setStatusValue] = useState<TrackStatus>(status);
  const [call, setCall] = useState(callNote);
  const [tour, setTour] = useState(tourNote);
  const [error, setError] = useState("");

  async function save(next: { status?: TrackStatus; callNote?: string; tourNote?: string }) {
    setError("");
    const trackStatus = next.status ?? statusValue;
    const nextCall = next.callNote ?? call;
    const nextTour = next.tourNote ?? tour;
    try {
      await updateSavedTrack({ data: { daycareId, status: trackStatus, callNote: nextCall, tourNote: nextTour } });
      onChange({ trackStatus, callNote: nextCall, tourNote: nextTour });
    } catch {
      setError(t("trackSaveFailed"));
    }
  }

  return (
    <div className="w-full space-y-3 rounded-xl bg-surface px-3 py-3 ring-1 ring-border" data-ke="saved-track">
      <label className="block text-sm">
        {t("trackStatusLabel")}
        <select
          className="mt-1 h-11 w-full max-w-full rounded-md border border-border bg-bg px-3 text-base"
          value={statusValue}
          onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest" })}
          onChange={(event) => {
            const next = event.target.value as TrackStatus;
            setStatusValue(next);
            void save({ status: next });
          }}
        >
          {TRACK_STATUSES.map((id) => (
            <option key={id} value={id}>
              {t(LABEL[id])}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        {t("trackCallNote")}
        <textarea
          className="mt-1 min-h-24 w-full max-w-full rounded-md border border-border bg-bg px-3 py-2 text-base"
          maxLength={TRACK_NOTE_MAX}
          value={call}
          onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest" })}
          onChange={(event) => setCall(event.target.value)}
          onBlur={() => {
            const next = clampTrackNote(call);
            setCall(next);
            void save({ callNote: next });
          }}
        />
      </label>
      <label className="block text-sm">
        {t("trackTourNote")}
        <textarea
          className="mt-1 min-h-24 w-full max-w-full rounded-md border border-border bg-bg px-3 py-2 text-base"
          maxLength={TRACK_NOTE_MAX}
          value={tour}
          onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest" })}
          onChange={(event) => setTour(event.target.value)}
          onBlur={() => {
            const next = clampTrackNote(tour);
            setTour(next);
            void save({ tourNote: next });
          }}
        />
      </label>
      <p className="text-sm text-muted">{t("trackNotesPrivate")}</p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
