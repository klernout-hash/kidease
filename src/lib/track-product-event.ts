import { capturePostHogEvent } from "./posthog.ts";
import {
  productEventsClientEnabled,
  sanitizeProductProperties,
  type ProductEventName,
} from "./product-events.ts";

/** Browser events. Dropped when the client flag is off or consent blocks PostHog. */
export function trackProductEvent(event: ProductEventName, properties: Record<string, unknown> = {}): void {
  if (!productEventsClientEnabled()) return;
  const clean = sanitizeProductProperties(event, properties);
  if (!clean) return;
  capturePostHogEvent(event, clean);
}
