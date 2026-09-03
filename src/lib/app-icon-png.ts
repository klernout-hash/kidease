/** Serve the live square KidEase pin (public/icon-512.png) as a PNG response.
 *  iOS Add to Home Screen will not follow a redirect and will not accept HTML/JSON. */
const ICON_URL = "https://www.kidease.ca/icon-512.png";

export async function appIconPngResponse(): Promise<Response> {
  const upstream = await fetch(ICON_URL, { cache: "no-store" });
  if (!upstream.ok) {
    return new Response("icon missing", { status: 502 });
  }
  const bytes = await upstream.arrayBuffer();
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=300, must-revalidate",
      "access-control-allow-origin": "*",
    },
  });
}
