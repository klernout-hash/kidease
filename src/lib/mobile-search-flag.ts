import { createServerFn } from "@tanstack/react-start";

/** Server-read so the phone bundle does not guess FEATURE_MOBILE_SEARCH_V2 from a missing env. */
export const readMobileSearchV2 = createServerFn({ method: "GET" }).handler(async () => {
  const { mobileSearchV2Enabled } = await import("@/lib/features");
  return mobileSearchV2Enabled();
});
