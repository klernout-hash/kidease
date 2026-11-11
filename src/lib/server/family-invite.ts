import { createServerFn } from "@tanstack/react-start";
import { familyInviteEnabled } from "@/lib/features";

/** Off until Kyle turns it on. This read does not send anything. */
export const familyInviteFlag = createServerFn({ method: "GET" }).handler(async () => familyInviteEnabled());
