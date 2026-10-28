import { createServerFn } from "@tanstack/react-start";

/** Orient, straighten, and brighten a profile photo before it is saved. */
export const polishProfilePhoto = createServerFn({ method: "POST" })
  .validator((input: { dataUrl?: string } | undefined) => ({
    dataUrl: String(input?.dataUrl || "").slice(0, 2_500_000),
  }))
  .handler(async ({ data }) => {
    if (!data.dataUrl.startsWith("data:image/")) return { dataUrl: data.dataUrl };
    try {
      const { polishListingPhotoDataUrl } = await import("@/lib/server/polish-listing-photo");
      const polished = await polishListingPhotoDataUrl(data.dataUrl);
      return { dataUrl: polished.dataUrl || data.dataUrl };
    } catch {
      return { dataUrl: data.dataUrl };
    }
  });
