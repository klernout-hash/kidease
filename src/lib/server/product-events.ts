import { productEventsServerEnabled } from "@/lib/features";
import { sanitizeProductProperties, type ProductEventName } from "@/lib/product-events";

/**
 * Server events. No-ops when the flag is off or the public project key is missing.
 * The key is not logged. Properties are already stripped of personal details.
 */
export async function captureServerProductEvent(
  event: ProductEventName,
  properties: Record<string, unknown> = {},
  distinctId = "kidease-server",
): Promise<void> {
  if (!productEventsServerEnabled()) return;
  const clean = sanitizeProductProperties(event, properties);
  if (!clean) return;
  const key = String(process.env.VITE_PUBLIC_POSTHOG_KEY || process.env.POSTHOG_FLAGS_KEY || "").trim();
  if (!key || key.length < 8) return;
  const host = String(process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
  const id = String(distinctId || "kidease-server").trim().slice(0, 80) || "kidease-server";
  if (id.includes("@")) return;
  try {
    await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: id,
        properties: { ...clean, $lib: "kidease-server" },
      }),
    });
  } catch {
    /* analytics must not break the request */
  }
}
