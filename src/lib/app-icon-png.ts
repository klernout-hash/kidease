/** Serve the square KidEase pin as PNG bytes.
 *  iOS Add to Home Screen will not follow a redirect and will not accept HTML/JSON.
 *  Read the generated public/icon-512.png first so preview deploys match the branch. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const RELATIVE = "icon-512.png";

const LOCAL_CANDIDATES = [
  join(process.cwd(), "public", RELATIVE),
  join(process.cwd(), "dist/client", RELATIVE),
  join(process.cwd(), ".output/public", RELATIVE),
];

function isPng(bytes: Buffer): boolean {
  return bytes.length > 100 && bytes.subarray(0, 4).equals(PNG_MAGIC);
}

async function readLocalIcon(): Promise<Buffer | null> {
  for (const path of LOCAL_CANDIDATES) {
    try {
      const bytes = await readFile(path);
      if (isPng(bytes)) return bytes;
    } catch {
      /* try the next build output path */
    }
  }
  return null;
}

async function readSameOriginIcon(request?: Request): Promise<Buffer | null> {
  if (!request) return null;
  try {
    const url = new URL(`/${RELATIVE}`, request.url);
    const upstream = await fetch(url, { cache: "no-store" });
    if (!upstream.ok) return null;
    const bytes = Buffer.from(await upstream.arrayBuffer());
    return isPng(bytes) ? bytes : null;
  } catch {
    return null;
  }
}

export async function appIconPngResponse(request?: Request): Promise<Response> {
  const bytes = (await readLocalIcon()) ?? (await readSameOriginIcon(request));
  if (!bytes) {
    return new Response("icon missing", { status: 502 });
  }
  return new Response(Uint8Array.from(bytes), {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=300, must-revalidate",
      "access-control-allow-origin": "*",
    },
  });
}
