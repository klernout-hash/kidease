import { createServerFn } from "@tanstack/react-start";
import { digitalAttendanceEnabled } from "@/lib/features";

export const digitalAttendanceFlag = createServerFn({ method: "GET" }).handler(async () => digitalAttendanceEnabled());
