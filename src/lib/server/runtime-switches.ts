import { createServerFn } from "@tanstack/react-start";
import { runtimeSwitchSnapshot, type RuntimeSwitches } from "@/lib/runtime-switches";

/** Current env, read on this request. Unset switches stay on. */
export const readRuntimeSwitches = createServerFn({ method: "GET" }).handler(async (): Promise<RuntimeSwitches> => {
  return runtimeSwitchSnapshot();
});
