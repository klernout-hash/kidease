/**
 * Shape a person's own account file. No database. The server passes rows
 * it already limited to that person; this drops any row that is not theirs.
 */

export const ACCOUNT_EXPORT_HOURLY_MAX = 3;
export const PRIVACY_REQUEST_HOURLY_MAX = 5;
export const PRIVACY_OFFICER_EMAIL = "privacy@kidease.ca";

export type ExportKind = "access" | "correction" | "deletion";

export function hourlyAllowance(
  countInWindow: number,
  max: number,
): { ok: true } | { ok: false; error: "rate" } {
  if (!Number.isFinite(countInWindow) || countInWindow < 0 || countInWindow >= max) {
    return { ok: false, error: "rate" };
  }
  return { ok: true };
}

export function keepOwn<T extends { userId: string }>(rows: readonly T[], userId: string): T[] {
  const id = userId.trim();
  if (!id) return [];
  return rows.filter((row) => row.userId === id);
}

function cell(value: unknown): string {
  if (value == null) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [headers.map(cell).join(",")];
  for (const row of rows) lines.push(row.map(cell).join(","));
  return `${lines.join("\n")}\n`;
}

export type ExportProfile = {
  name: string;
  email: string;
  emailVerified: boolean;
  role: string | null;
  locale: string | null;
  phone: string | null;
  city: string | null;
  displayName: string | null;
  bio: string | null;
  timeZone: string | null;
  homeLabel: string | null;
  workLabel: string | null;
  homeLat: number | null;
  homeLng: number | null;
  workLat: number | null;
  workLng: number | null;
  createdAt: string | null;
};

export type ExportChild = {
  userId: string;
  id: string;
  name: string;
  birthdate: string;
  notes: string | null;
  createdAt: string | null;
};

export type ExportEnrolment = {
  userId: string;
  id: string;
  source: "booking" | "agreement" | "handoff";
  daycareId: string;
  childId: string | null;
  status: string;
  startMonth: string | null;
  startDate: string | null;
  schedule: string | null;
  ageGroup: string | null;
  childName: string | null;
  childBirthdate: string | null;
  feeCents: number | null;
  monthlyAmount: number | null;
  photoConsentAt: string | null;
};

export type ExportMessage = {
  userId: string;
  id: string;
  channel: "centre" | "support";
  conversationId: string | null;
  daycareId: string | null;
  body: string;
  createdAt: string | null;
};

export type ExportInvoice = {
  userId: string;
  id: string;
  source: "kidease" | "stripe";
  number: string | null;
  daycareId: string | null;
  period: string | null;
  status: string;
  currency: string;
  total: number | null;
  paidAt: string | null;
};

export type ExportConsent = {
  userId: string;
  channel: string;
  purpose: string;
  granted: boolean;
  grantedAt: string | null;
  withdrawnAt: string | null;
  method: string | null;
  locale: string | null;
};

export type ExportPrivacyRequest = {
  userId: string;
  id: string;
  kind: string;
  note: string;
  createdAt: string | null;
};

const OMITTED = [
  "Other people's messages are not included.",
  "Card numbers are not included. Stripe holds them.",
  "Centre replies stored as the centre, not under your name, are not included.",
  "Profile photo files are not included.",
  "This download does not delete anything.",
];

export function buildAccountExport(input: {
  exportedAt: string;
  userId: string;
  profile: ExportProfile;
  children: readonly ExportChild[];
  enrolments: readonly ExportEnrolment[];
  messages: readonly ExportMessage[];
  invoices: readonly ExportInvoice[];
  consents: readonly ExportConsent[];
  privacyRequests: readonly ExportPrivacyRequest[];
}): { document: Record<string, unknown>; csv: Record<string, string> } {
  const userId = input.userId.trim();
  const children = keepOwn(input.children, userId);
  const enrolments = keepOwn(input.enrolments, userId);
  const messages = keepOwn(input.messages, userId);
  const invoices = keepOwn(input.invoices, userId);
  const consents = keepOwn(input.consents, userId);
  const privacyRequests = keepOwn(input.privacyRequests, userId);
  const document = {
    exportedAt: input.exportedAt,
    accountId: userId,
    profile: input.profile,
    children: children.map(({ userId: _userId, ...row }) => row),
    enrolments: enrolments.map(({ userId: _userId, ...row }) => row),
    messagesSent: messages.map(({ userId: _userId, ...row }) => row),
    invoices: invoices.map(({ userId: _userId, ...row }) => row),
    consents: consents.map(({ userId: _userId, ...row }) => row),
    privacyRequests: privacyRequests.map(({ userId: _userId, ...row }) => ({
      ...row,
      routedTo: PRIVACY_OFFICER_EMAIL,
    })),
    omitted: OMITTED,
  };
  const csv = {
    children: toCsv(
      ["id", "name", "birthdate", "notes", "createdAt"],
      children.map((row) => [row.id, row.name, row.birthdate, row.notes, row.createdAt]),
    ),
    enrolments: toCsv(
      ["id", "source", "daycareId", "childId", "status", "startMonth", "startDate", "schedule", "ageGroup", "feeCents", "monthlyAmount"],
      enrolments.map((row) => [
        row.id,
        row.source,
        row.daycareId,
        row.childId,
        row.status,
        row.startMonth,
        row.startDate,
        row.schedule,
        row.ageGroup,
        row.feeCents,
        row.monthlyAmount,
      ]),
    ),
    messages: toCsv(
      ["id", "channel", "conversationId", "daycareId", "body", "createdAt"],
      messages.map((row) => [row.id, row.channel, row.conversationId, row.daycareId, row.body, row.createdAt]),
    ),
    invoices: toCsv(
      ["id", "source", "number", "daycareId", "period", "status", "currency", "total", "paidAt"],
      invoices.map((row) => [row.id, row.source, row.number, row.daycareId, row.period, row.status, row.currency, row.total, row.paidAt]),
    ),
    consents: toCsv(
      ["channel", "purpose", "granted", "grantedAt", "withdrawnAt", "method", "locale"],
      consents.map((row) => [row.channel, row.purpose, row.granted ? "yes" : "no", row.grantedAt, row.withdrawnAt, row.method, row.locale]),
    ),
  };
  return { document: { ...document, csv }, csv };
}
