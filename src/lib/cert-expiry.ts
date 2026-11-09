/**
 * Staff certificate expiry. Only dates from today through 60 days, and only
 * on or after the alert cutoff. This module does not send email, SMS, or push.
 */

import { alertIsProspective } from "./customer-alert-policy.ts";

const WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

export function certExpiryDue(expiresOn: string, now = new Date()): boolean {
  const day = String(expiresOn || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  if (!alertIsProspective(`${day}T12:00:00.000Z`)) return false;
  const exp = Date.parse(`${day}T12:00:00.000Z`);
  const start = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(exp) || !Number.isFinite(start)) return false;
  return exp >= start && exp <= start + WINDOW_MS;
}

export function certExpirySend(): "off" {
  return "off";
}
