/**
 * Explore/search → listing → share/contact/claim.
 * Coarse dest paths only — never a listing slug, email, or query string.
 */
import { capturePostHogEvent } from "./posthog.ts";

export const MARKETPLACE_FUNNEL_EVENT = "marketplace_funnel";

export type MarketplaceFunnelStep =
  | "search"
  | "explore"
  | "listing_view"
  | "share"
  | "contact"
  | "claim";

export type MarketplaceFunnelProps = {
  step: MarketplaceFunnelStep;
  source?: "home" | "search" | "listing" | "claim";
  dest_path?: "/search" | "/daycare" | "/claim" | "/other";
  contact?: "message" | "tour" | "spot" | "phone";
};

export function captureMarketplaceFunnel(props: MarketplaceFunnelProps): void {
  const payload: Record<string, unknown> = { step: props.step };
  if (props.source) payload.source = props.source;
  if (props.dest_path) payload.dest_path = props.dest_path;
  if (props.contact) payload.contact = props.contact;
  capturePostHogEvent(MARKETPLACE_FUNNEL_EVENT, payload);
}
