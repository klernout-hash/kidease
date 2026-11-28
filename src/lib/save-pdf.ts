/**
 * Save a PDF the same way on every surface.
 *
 * Website: a normal file download.
 * Phone app (Capacitor WebView): a blob link download does nothing on iOS and
 * most Android WebViews, so open the share sheet with the file instead
 * (Save to Files / Downloads). If the share sheet cannot take a file, report
 * "failed" so the screen never claims a download that did not happen.
 *
 * One tap saves one file: a second call while the first is still open returns "busy".
 */

export type SavePdfResult = "downloaded" | "shared" | "cancelled" | "failed" | "busy";

export type SavePdfEnv = {
  native: boolean;
  makeFile?: (bytes: Uint8Array, filename: string) => unknown;
  canShare?: (data: { files: unknown[] }) => boolean;
  share?: (data: { files: unknown[]; title?: string }) => Promise<void>;
  download?: (bytes: Uint8Array, filename: string) => boolean;
};

let inFlight = false;

/** Test hook: clear the one-at-a-time guard. */
export function resetSavePdfGuard() {
  inFlight = false;
}

function pdfBody(bytes: Uint8Array): ArrayBuffer {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return body;
}

function browserDownload(bytes: Uint8Array, filename: string): boolean {
  if (typeof document === "undefined" || typeof URL === "undefined") return false;
  const blob = new Blob([pdfBody(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safari reads the blob after click returns. Revoking right away can cancel the save.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return true;
}

function browserEnv(): SavePdfEnv {
  type CapWindow = Window & { Capacitor?: { isNativePlatform?: () => boolean } };
  const win = typeof window !== "undefined" ? (window as CapWindow) : null;
  const nav = typeof navigator !== "undefined" ? navigator : null;
  return {
    native: Boolean(win?.Capacitor?.isNativePlatform?.()),
    makeFile: (bytes, filename) =>
      typeof File === "function" ? new File([pdfBody(bytes)], filename, { type: "application/pdf" }) : null,
    canShare: nav && typeof nav.canShare === "function" ? (data) => nav.canShare(data as ShareData) : undefined,
    share: nav && typeof nav.share === "function" ? (data) => nav.share(data as ShareData) : undefined,
    download: browserDownload,
  };
}

function isAbort(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { name?: string }).name === "AbortError");
}

export async function savePdfBytes(
  bytes: Uint8Array,
  filename: string,
  env: SavePdfEnv = browserEnv(),
): Promise<SavePdfResult> {
  if (inFlight) return "busy";
  inFlight = true;
  try {
    if (env.native) {
      const file = env.makeFile?.(bytes, filename);
      const data = { files: file ? [file] : [] };
      if (!file || !env.share || !env.canShare?.(data)) return "failed";
      try {
        await env.share({ ...data, title: filename });
        return "shared";
      } catch (err) {
        return isAbort(err) ? "cancelled" : "failed";
      }
    }
    return env.download?.(bytes, filename) ? "downloaded" : "failed";
  } finally {
    inFlight = false;
  }
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** True only when a file really left the app. Show "saved" only then. */
export function savePdfSucceeded(result: SavePdfResult): boolean {
  return result === "downloaded" || result === "shared";
}

export function savePdfFailedText(locale: string): string {
  return locale === "fr"
    ? "Le PDF n’a pas pu être enregistré sur cet appareil. Ouvrez kidease.ca dans votre navigateur pour le télécharger."
    : "The PDF could not be saved on this device. Open kidease.ca in your browser to download it.";
}
