/**
 * A PIPEDA / Law 25 export or deletion request reaches every role that
 * holds the person's records. A retention hold blocks deletion.
 * FEATURE_DSR_PROPAGATION defaults off. This does not sign the person out.
 */

import { governmentSeesProvince, wiringEnabled, wiringMode } from "./common.ts";

export const DSR_FLAG = "FEATURE_DSR_PROPAGATION";
export const DSR_KINDS = ["export", "delete"] as const;
export const DSR_STATUSES = ["received", "with_roles", "blocked", "done"] as const;
export type DsrKind = (typeof DSR_KINDS)[number];
export type DsrStatus = (typeof DSR_STATUSES)[number];
export type DsrRole = "parent" | "provider" | "admin" | "government";

export function dsrPropagationEnabled(env?: Record<string, string | undefined>): boolean {
  return wiringEnabled(DSR_FLAG, env);
}

export function dsrPropagationMode(env?: Record<string, string | undefined>, dry = false) {
  return wiringMode(DSR_FLAG, env, dry);
}

export function openDsr(input: {
  kind: string;
  held: boolean;
  roles: readonly DsrRole[];
}): { ok: true; kind: DsrKind; status: DsrStatus; targets: DsrRole[] } | { ok: false; error: "kind" } {
  if (!(DSR_KINDS as readonly string[]).includes(input.kind)) return { ok: false, error: "kind" };
  const kind = input.kind as DsrKind;
  const targets = [...new Set(input.roles)];
  if (kind === "delete" && input.held) return { ok: true, kind, status: "blocked", targets: [] };
  return { ok: true, kind, status: targets.length ? "with_roles" : "received", targets };
}

export function dsrRoleDone(input: { status: DsrStatus; remaining: number; held: boolean; kind: DsrKind }): DsrStatus {
  if (input.kind === "delete" && input.held) return "blocked";
  if (input.remaining > 0) return "with_roles";
  return "done";
}

export function governmentDsrVisible(actorProvince: string, recordProvince: string): boolean {
  return governmentSeesProvince({ actorProvince, recordProvince });
}
