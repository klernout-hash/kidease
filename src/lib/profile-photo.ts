const keyFor = (userId: string) => `kidease.profile-photo.${userId}`;
export const PROFILE_PHOTO_EVENT = "ke-profile-photo";

export function readProfilePhoto(userId: string | null | undefined, fallback?: string | null) {
  if (!userId || typeof window === "undefined") return fallback ?? null;
  try {
    return window.localStorage.getItem(keyFor(userId)) || fallback || null;
  } catch {
    return fallback ?? null;
  }
}

export function writeProfilePhoto(userId: string, dataUrl: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (dataUrl) window.localStorage.setItem(keyFor(userId), dataUrl);
    else window.localStorage.removeItem(keyFor(userId));
  } catch {
    /* quota / private mode */
  }
  window.dispatchEvent(new Event(PROFILE_PHOTO_EVENT));
}

export function compressProfileFile(file: File, maxPx = 480): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read photo"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not process photo"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => reject(new Error("Could not load photo"));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
