import { createServerFn } from "@tanstack/react-start";
import { hostTodayEnabled } from "@/lib/features";

export const hostTodayFlag = createServerFn({ method: "GET" }).handler(async () => hostTodayEnabled());
