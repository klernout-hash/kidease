import { createServerFn } from "@tanstack/react-start";
import { catalogStatus } from "@/lib/server/stripe-catalog";

/** Booleans only. Price IDs stay on the server. Unset prices fail closed in the UI. */
export const getUpgradePriceFlags = createServerFn({ method: "GET" }).handler(async () => catalogStatus());
