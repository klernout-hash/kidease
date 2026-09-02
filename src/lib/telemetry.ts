import { encodeGeohash } from "@/lib/geohash";
import { ingestTelemetry, type TelemetryHit, type TelemetryKind } from "@/lib/server/telemetry";

const MAX_BATCH = 12;
const FLUSH_MS = 8000;
let queue: TelemetryHit[] = [];
let timer: number | null = null;
let lastHash = "";
let lastSent = 0;

function sessionId() {
  if (typeof window === "undefined") return "";
  try {
    let id = window.sessionStorage.getItem("kidease-sid");
    if (!id) {
      id = crypto.randomUUID();
      window.sessionStorage.setItem("kidease-sid", id);
    }
    return id;
  } catch {
    return "";
  }
}

function splitLabel(label: string) {
  const parts = label.split(",").map((s) => s.trim());
  return { city: parts[0] || "", province: parts[1] || "" };
}

function enqueue(hit: TelemetryHit) {
  queue.push({ ...hit, sessionId: sessionId(), geohash: hit.geohash.slice(0, 5) });
  if (queue.length >= MAX_BATCH) void flushTelemetry();
  else if (timer == null && typeof window !== "undefined") {
    timer = window.setTimeout(() => {
      timer = null;
      void flushTelemetry();
    }, FLUSH_MS);
  }
}

export async function flushTelemetry() {
  if (!queue.length) return;
  const hits = queue.splice(0, MAX_BATCH);
  await ingestTelemetry({ data: { hits } }).catch(() => null);
}

export function trackLocation(
  kind: TelemetryKind,
  lat: number,
  lng: number,
  label: string,
  extra?: { radiusKm?: number; slug?: string },
) {
  const geohash = encodeGeohash(lat, lng);
  const now = Date.now();
  if (kind === "heartbeat" && geohash === lastHash && now - lastSent < 45_000) return;
  lastHash = geohash;
  lastSent = now;
  const place = splitLabel(label);
  enqueue({ kind, geohash, ...place, ...extra });
}
