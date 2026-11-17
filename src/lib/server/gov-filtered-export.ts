import { createServerFn } from "@tanstack/react-start";
import { govFilteredExportEnabled } from "@/lib/features";

export const govFilteredExportFlag = createServerFn({ method: "GET" }).handler(async () => govFilteredExportEnabled());
