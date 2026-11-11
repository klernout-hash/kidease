import { createServerFn } from "@tanstack/react-start";
import {
  feeDisplayGateEnabled,
  licenceTypeFilterEnabled,
  multiChildSearchEnabled,
  vacancyFreshnessEnabled,
} from "@/lib/features";

export const licenceTypeFilterFlag = createServerFn({ method: "GET" }).handler(async () => licenceTypeFilterEnabled());
export const multiChildSearchFlag = createServerFn({ method: "GET" }).handler(async () => multiChildSearchEnabled());
export const vacancyFreshnessFlag = createServerFn({ method: "GET" }).handler(async () => vacancyFreshnessEnabled());
export const feeDisplayGateFlag = createServerFn({ method: "GET" }).handler(async () => feeDisplayGateEnabled());
