export const QC_LIST_CAP = 60;
export const QC_CONTACT_MAX = 8;
export const QC_CONTACT_WINDOW_MS = 60 * 60 * 1000;
export const IMAGE_MAX = 120;
export const IMAGE_WINDOW_MS = 60 * 1000;

function hostOf(raw: string | null | undefined): string {
  const first = String(raw || "").split(",")[0].trim().toLowerCase();
  if (!first) return "";
  if (first.startsWith("[")) return first;
  return first.replace(/:\d+$/, "");
}

export function imageRequestAllowed(input: {
  secFetchSite?: string | null;
  origin?: string | null;
  requestHost?: string | null;
  authenticated?: boolean;
}): boolean {
  if (input.authenticated) return true;
  const site = String(input.secFetchSite || "").toLowerCase();
  if (site === "cross-site") return false;
  if (!input.origin) return site !== "cross-site";
  let originHost = "";
  try {
    originHost = new URL(input.origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  const requestHost = hostOf(input.requestHost);
  if (originHost === requestHost) return true;
  const prod = (host: string) => host === "kidease.ca" || host === "www.kidease.ca";
  return prod(originHost) && prod(requestHost);
}

export function limitAllows(count: number, max: number): boolean {
  return count <= max;
}
