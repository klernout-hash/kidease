import { createServerFn } from "@tanstack/react-start";
import { compareParentFeeEnabled } from "@/lib/features";

/** Browser reads the flag from the server. Default on. */
export const compareParentFeeFlag = createServerFn({ method: "GET" }).handler(async () => compareParentFeeEnabled());
