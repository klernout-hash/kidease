import { Capacitor, registerPlugin } from "@capacitor/core";

const PdfShareFiles = registerPlugin<{
  stage(options: { filename: string; base64: string }): Promise<{ uri: string }>;
}>("PdfShareFiles");

export type SavePdfResult = "started" | "cancelled" | "failed" | "busy";

type SavePdfEnv = {
  native: boolean;
  shareFile: (bytes: Uint8Array, filename: string) => Promise<void>;
  download: (bytes: Uint8Array, filename: string) => boolean;
};

let inFlight = false;

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

async function shareNativePdf(bytes: Uint8Array, filename: string) {
  const { Share } = await import("@capacitor/share");
  const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  const base64 = btoa(binary);
  const { uri } = await PdfShareFiles.stage({ filename: safeName, base64 });
  await Share.share({ files: [uri] });
}

async function runPdfAction(action: () => Promise<boolean>): Promise<SavePdfResult> {
  if (inFlight) return "busy";
  inFlight = true;
  try {
    return (await action()) ? "started" : "failed";
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    return /cancel/i.test(message) ? "cancelled" : "failed";
  } finally {
    inFlight = false;
  }
}

export function savePdfBytes(
  bytes: Uint8Array,
  filename: string,
  env: SavePdfEnv = { native: Capacitor.isNativePlatform(), shareFile: shareNativePdf, download: browserDownload },
): Promise<SavePdfResult> {
  return runPdfAction(async () => {
    if (!env.native) return env.download(bytes, filename);
    await env.shareFile(bytes, filename);
    return true;
  });
}

export function openHostedPdf(url: string): Promise<SavePdfResult> {
  return runPdfAction(async () => {
    if (!url.startsWith("https://")) return false;
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    return true;
  });
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function savePdfFailedText(locale: string): string {
  return locale === "fr"
    ? "Le PDF n’a pas pu être enregistré sur cet appareil. Ouvrez kidease.ca dans votre navigateur pour le télécharger."
    : "The PDF could not be saved on this device. Open kidease.ca in your browser to download it.";
}
