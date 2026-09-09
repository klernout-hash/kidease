import { createServerFn } from "@tanstack/react-start";
import { showPayCtas } from "@/lib/features";

/** Public chrome flags. No auth — search and listing need the same gate. */
export const getUiChrome = createServerFn({ method: "GET" }).handler(async () => ({
  showPayCtas: showPayCtas(),
}));
