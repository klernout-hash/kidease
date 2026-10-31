import { createServerFn } from "@tanstack/react-start";
import { inclusiveFiltersEnabled } from "@/lib/features";

export const inclusiveFiltersFlag = createServerFn({ method: "GET" }).handler(async () => inclusiveFiltersEnabled());
