export const TRACK_STATUSES = ["interested", "called", "toured", "waitlisted", "enrolled"] as const;

export type TrackStatus = (typeof TRACK_STATUSES)[number];

export const TRACK_NOTE_MAX = 500;

export function parseTrackStatus(value: unknown): TrackStatus {
  return TRACK_STATUSES.includes(value as TrackStatus) ? (value as TrackStatus) : "interested";
}

export function clampTrackNote(value: unknown): string {
  return String(value ?? "")
    .split(String.fromCharCode(0))
    .join("")
    .trim()
    .slice(0, TRACK_NOTE_MAX);
}

export function parseShareToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export function normalizeShareEmail(value: unknown): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  if (email.length < 6 || email.length > 160) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
