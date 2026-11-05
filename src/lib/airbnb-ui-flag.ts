import { createServerFn } from "@tanstack/react-start";

/** Server-read so the phone bundle does not guess FEATURE_UI_AIRBNB_V1 from a missing env. */
export const readAirbnbUi = createServerFn({ method: "GET" }).handler(async () => {
  const { airbnbUiEnabled } = await import("@/lib/features");
  return airbnbUiEnabled();
});
