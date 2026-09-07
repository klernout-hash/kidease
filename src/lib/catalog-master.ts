/**
 * Optional offline master-CSV contact enrichment.
 * Fills blank phone / email / website only. Never logs contact values.
 */

import { preserveFilledContact } from "./catalog-upsert.ts";

export type MasterContact = {
  phone: string;
  email: string;
  website: string;
};

export type MasterContactTarget = {
  id: string;
  slug?: string;
  licenseNumber?: string;
  phone?: string | null;
  contactEmail?: string | null;
  website?: string | null;
};

const HEADER_ALIASES: Record<string, "id" | "slug" | "license" | "phone" | "email" | "website"> = {
  id: "id",
  daycare_id: "id",
  centre_id: "id",
  listing_id: "id",
  slug: "slug",
  license: "license",
  licence: "license",
  license_number: "license",
  licence_number: "license",
  licensenumber: "license",
  phone: "phone",
  telephone: "phone",
  tel: "phone",
  phone_number: "phone",
  email: "email",
  e_mail: "email",
  contact_email: "email",
  email_address: "email",
  website: "website",
  web: "website",
  url: "website",
  website_url: "website",
  web_site: "website",
};

function normHeader(h: string) {
  return h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function normKey(value: string) {
  return value.trim().toLowerCase();
}

function lookupKeys(id: string, slug?: string, licenseNumber?: string) {
  const keys = new Set<string>();
  const add = (value?: string | null) => {
    const n = (value || "").trim();
    if (!n) return;
    keys.add(normKey(n));
    const stripped = n.replace(/^0+/, "") || n;
    keys.add(normKey(stripped));
    if (/^\d+$/.test(n) && n.length < 7) keys.add(n.padStart(7, "0"));
    if (/^\d+$/.test(stripped) && stripped.length < 7) keys.add(stripped.padStart(7, "0"));
  };
  add(id);
  add(id.split("-").pop());
  add(slug);
  add(licenseNumber);
  return keys;
}

/** RFC4180-ish CSV split. Does not throw on messy rows. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseMasterContacts(csvText: string): Map<string, MasterContact> {
  const map = new Map<string, MasterContact>();
  const text = csvText.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n").filter((line) => line.trim());
  if (lines.length < 2) return map;
  const headers = splitCsvLine(lines[0]).map((h) => HEADER_ALIASES[normHeader(h)] ?? null);
  if (!headers.some((h) => h === "phone" || h === "email" || h === "website")) return map;

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    let id = "";
    let slug = "";
    let license = "";
    let phone = "";
    let email = "";
    let website = "";
    headers.forEach((kind, i) => {
      const value = (cells[i] || "").trim();
      if (!kind || !value) return;
      if (kind === "id") id = value;
      else if (kind === "slug") slug = value;
      else if (kind === "license") license = value;
      else if (kind === "phone") phone = value;
      else if (kind === "email") email = value;
      else if (kind === "website") website = value;
    });
    if (!phone && !email && !website) continue;
    const incoming: MasterContact = { phone, email, website };
    for (const key of lookupKeys(id, slug, license)) {
      const prev = map.get(key);
      map.set(key, prev
        ? {
            phone: preserveFilledContact(prev.phone, incoming.phone),
            email: preserveFilledContact(prev.email, incoming.email),
            website: preserveFilledContact(prev.website, incoming.website),
          }
        : incoming);
    }
  }
  return map;
}

export function masterContactFor(
  row: MasterContactTarget,
  master: Map<string, MasterContact>,
): MasterContact | undefined {
  for (const key of lookupKeys(row.id, row.slug, row.licenseNumber)) {
    const hit = master.get(key);
    if (hit) return hit;
  }
  return undefined;
}

/** Blank-only merge. Existing filled phone/email/website win. */
export function mergeBlankContacts<T extends MasterContactTarget>(
  row: T,
  master: Map<string, MasterContact>,
): T {
  const hit = masterContactFor(row, master);
  if (!hit) return row;
  return {
    ...row,
    phone: preserveFilledContact(hit.phone, row.phone),
    contactEmail: preserveFilledContact(hit.email, row.contactEmail),
    website: preserveFilledContact(hit.website, row.website),
  };
}
