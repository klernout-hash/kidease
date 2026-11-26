import { createServerFn } from "@tanstack/react-start";
import { listingShareUrl } from "@/lib/share";

/**
 * Share kit QR code, drawn on the server so the qrcode library stays out of the
 * client bundle (client JS budget). Only a KidEase listing link is ever encoded.
 */
export const listingShareQrSvg = createServerFn({ method: "POST" })
  .validator((input: { slug?: string }) => ({ slug: String(input?.slug || "").trim().slice(0, 200) }))
  .handler(async ({ data }) => {
    if (!data.slug) return { svg: "" };
    const QRCode = await import("qrcode");
    const svg = await QRCode.toString(listingShareUrl(data.slug), {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      width: 280,
    });
    return { svg };
  });
