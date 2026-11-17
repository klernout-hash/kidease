import { createServerFn } from "@tanstack/react-start";
import { adminSavedFiltersEnabled } from "@/lib/features";

export const adminSavedFiltersFlag = createServerFn({ method: "GET" }).handler(async () => adminSavedFiltersEnabled());
