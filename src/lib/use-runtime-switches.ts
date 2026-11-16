import { useRouteContext } from "@tanstack/react-router";
import { runtimeSwitchSnapshot, type RuntimeSwitches } from "@/lib/runtime-switches";

/** Server snapshot from the root loader. Missing context keeps every switch on. */
export function useRuntimeSwitches(): RuntimeSwitches {
  const ctx = useRouteContext({ from: "__root__" }) as { switches?: RuntimeSwitches };
  return ctx.switches ?? runtimeSwitchSnapshot({});
}
