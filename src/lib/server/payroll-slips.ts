/**
 * Year-end slip files (T4, T4A, RL-1 draft) to download. Nothing is filed.
 * Off unless FEATURE_PROVIDER_PAYROLL and FEATURE_PAYROLL_SLIP_XML are both on.
 * SINs are entered by each person on their own slip details form, sealed,
 * and opened only on the server for the owner after a fresh sign-in.
 */

import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { payrollSlipXmlEnabled, providerPayrollEnabled } from "@/lib/features";
import { nid } from "@/lib/utils";
import { submitForm } from "@/lib/payroll/forms-store.ts";
import { loadStubs, payAccess } from "@/lib/payroll/pay-store.ts";
import {
  buildRl1Xml,
  buildT4aXml,
  buildT4Xml,
  employerProblems,
  parseSlipDetails,
  SLIP_SOURCES,
  SLIP_VERIFICATION,
  SLIP_XML_AS_OF,
  toSlipPerson,
  type SlipEmployer,
  type SlipPerson,
} from "@/lib/payroll/slip-xml.ts";
import { loadSlipEmployer, loadSlipPeople, logSlipExport, saveSlipEmployer, slipsReady } from "@/lib/payroll/slips-store.ts";

function id(value: unknown): string {
  return String(value ?? "").trim().slice(0, 128);
}

function noStore() {
  setResponseHeader("Cache-Control", "private, no-store");
}

function slipsOn(): boolean {
  return providerPayrollEnabled() && payrollSlipXmlEnabled();
}

function requireSlips() {
  if (!slipsOn()) throw new Error("payroll:off");
}

function year(value: unknown): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 2026 && n <= 2100 ? n : new Date().getFullYear() - 1;
}

async function openPeople(userId: string, daycareId: string): Promise<{ people: SlipPerson[]; names: Map<string, string> }> {
  const sql = await getSql();
  const rows = await loadSlipPeople(sql, userId, daycareId);
  const { openBank } = await import("@/lib/payroll/bank-seal.ts");
  const names = new Map<string, string>();
  const people = rows.map((row) => {
    names.set(row.personId, row.displayName);
    return toSlipPerson(row, row.sinCipher ? openBank(row.sinCipher) : null);
  });
  return { people, names };
}

/** Is the slip feature on, what employer details are saved, and who is missing slip details. No SINs. */
export const payrollSlipStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; year?: number }) => ({ daycareId: id(input?.daycareId), year: year(input?.year) }))
  .handler(async ({ context, data }) => {
    noStore();
    if (!slipsOn()) return { enabled: false as const };
    const sql = await getSql();
    if (!(await slipsReady(sql))) return { enabled: false as const };
    const access = await payAccess(sql, context.userId, data.daycareId);
    if (!access.editor) return { enabled: false as const };
    const employer = await loadSlipEmployer(sql, context.userId, data.daycareId);
    let missing: { personId: string; name: string }[] = [];
    if (access.owner) {
      const { people, names } = await openPeople(context.userId, data.daycareId);
      const stubs = await loadStubs(sql, { userId: context.userId, daycareId: data.daycareId, from: `${data.year}-01-01`, to: `${data.year}-12-31` });
      const paid = new Set(stubs.map((stub) => stub.personId));
      missing = people.filter((p) => paid.has(p.personId) && (!p.sin || !p.lastName)).map((p) => ({ personId: p.personId, name: names.get(p.personId) ?? "" }));
    }
    return {
      enabled: true as const,
      owner: access.owner,
      year: data.year,
      employer,
      problems: { t4: employerProblems(employer, "t4"), t4a: employerProblems(employer, "t4a"), rl1: employerProblems(employer, "rl1") },
      missing,
      asOf: SLIP_XML_AS_OF,
      sources: SLIP_SOURCES,
      verification: SLIP_VERIFICATION,
    };
  });

export const payrollSaveSlipEmployer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Partial<SlipEmployer> & { daycareId?: string }) => {
    const t = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
    return {
      daycareId: id(input?.daycareId),
      value: {
        name: t(input?.name, 60),
        businessNumber: t(input?.businessNumber, 20).replace(/\s/g, "").toUpperCase(),
        addrLine: t(input?.addrLine, 60),
        city: t(input?.city, 40),
        provCd: t(input?.provCd, 2).toUpperCase(),
        postalCd: t(input?.postalCd, 10).replace(/\s/g, "").toUpperCase(),
        contactName: t(input?.contactName, 60),
        contactPhone: t(input?.contactPhone, 20),
        contactEmail: t(input?.contactEmail, 80),
        dentalCode: /^[1-5]$/.test(String(input?.dentalCode ?? "")) ? String(input?.dentalCode) : "",
        rqId: t(input?.rqId, 20).replace(/\s/g, "").toUpperCase(),
        rqNp: t(input?.rqNp, 10).toUpperCase(),
        rqCert: t(input?.rqCert, 16).toUpperCase(),
      } satisfies SlipEmployer,
    };
  })
  .handler(async ({ context, data }) => {
    requireSlips();
    const ok = await saveSlipEmployer(await getSql(), context.userId, data.daycareId, data.value);
    if (!ok) throw new Error("payroll:permission");
    return { ok: true as const };
  });

/** A person enters their own legal name, address, and SIN. The SIN is sealed before it is saved. */
export const payrollSubmitSlipDetails = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: { daycareId?: string; firstName?: string; lastName?: string; initial?: string; sin?: string; addrLine?: string; city?: string; provCd?: string; postalCd?: string }) => ({
      daycareId: id(input?.daycareId),
      firstName: String(input?.firstName ?? ""),
      lastName: String(input?.lastName ?? ""),
      initial: String(input?.initial ?? ""),
      sin: String(input?.sin ?? "").slice(0, 20),
      addrLine: String(input?.addrLine ?? ""),
      city: String(input?.city ?? ""),
      provCd: String(input?.provCd ?? ""),
      postalCd: String(input?.postalCd ?? ""),
    }),
  )
  .handler(async ({ context, data }) => {
    requireSlips();
    const parsed = parseSlipDetails(data);
    if (!parsed.ok) throw new Error(`payroll:${parsed.error}`);
    const { sealBank } = await import("@/lib/payroll/bank-seal.ts");
    const cipher = sealBank(parsed.sin);
    if (!cipher) throw new Error("payroll:bank_key");
    const saved = await submitForm(await getSql(), {
      id: nid(),
      userId: context.userId,
      daycareId: data.daycareId,
      kind: "slip_info",
      answersJson: JSON.stringify(parsed.answers),
      bankCipher: cipher,
      bankLast4: parsed.sin.slice(-3),
      savedOn: new Date().toISOString().slice(0, 10),
    });
    if (!saved) throw new Error("payroll:own_form");
    return { ...saved, status: "pending" as const };
  });

/**
 * Owner only, after a fresh sign-in: build the T4, T4A, and RL-1 draft files
 * for a tax year. People without approved slip details are left out and listed.
 * Each download is logged. Nothing is sent to CRA or Revenu Québec.
 */
export const payrollSlipFiles = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; year?: number; locale?: string }) => ({
    daycareId: id(input?.daycareId),
    year: year(input?.year),
    lang: input?.locale === "fr" ? ("F" as const) : ("E" as const),
  }))
  .handler(async ({ context, data }) => {
    noStore();
    requireSlips();
    const { assertRecentReauth } = await import("@/lib/server/reauth.server");
    assertRecentReauth(context.userId);
    const sql = await getSql();
    if (!(await slipsReady(sql))) throw new Error("payroll:off");
    if (!(await payAccess(sql, context.userId, data.daycareId)).owner) throw new Error("payroll:owner_only");
    const employer = await loadSlipEmployer(sql, context.userId, data.daycareId);
    const { people, names } = await openPeople(context.userId, data.daycareId);
    const stubs = await loadStubs(sql, { userId: context.userId, daycareId: data.daycareId, from: `${data.year}-01-01`, to: `${data.year}-12-31` });
    const input = { year: data.year, employer, people, stubs, lang: data.lang };
    const results = { t4: buildT4Xml(input), t4a: buildT4aXml(input), rl1: buildRl1Xml(input) };
    const files = Object.values(results).flatMap((r) => (r.file ? [r.file] : []));
    const named = (rows: { personId: string; problem: string }[]) => rows.map((row) => ({ name: names.get(row.personId) ?? "", problem: row.problem }));
    await logSlipExport(sql, {
      id: nid(),
      userId: context.userId,
      daycareId: data.daycareId,
      year: data.year,
      kinds: files.map((f) => f.kind).join(",") || "none",
      people: files.reduce((t, f) => t + f.slips, 0),
    });
    return {
      year: data.year,
      files,
      flagged: { t4: named(results.t4.flagged), t4a: named(results.t4a.flagged), rl1: named(results.rl1.flagged) },
      employerProblems: { t4: results.t4.employerProblems, t4a: results.t4a.employerProblems, rl1: results.rl1.employerProblems },
      verification: SLIP_VERIFICATION,
      filed: false as const,
    };
  });
