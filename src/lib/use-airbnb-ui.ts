import { useRouteContext } from "@tanstack/react-router";

/** True only when FEATURE_UI_AIRBNB_V1 is on. Missing context stays off. */
export function useAirbnbUi(): boolean {
  return useRouteContext({ from: "__root__", select: (ctx) => ctx.airbnbUi === true });
}
