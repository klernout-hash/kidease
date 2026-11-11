/** QuickBooks Online export. No Intuit call happens in this file. */

export const QBO_ACCOUNTING_SCOPE = "com.intuit.quickbooks.accounting";
export const QBO_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
export const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

/** Names only. Values stay in the host environment, never in the repo. */
export const QBO_REQUIRED_ENV = [
  "INTUIT_CLIENT_ID",
  "INTUIT_CLIENT_SECRET",
  "INTUIT_REDIRECT_URI",
  "INTUIT_ENVIRONMENT",
  "QBO_TOKEN_KEY",
] as const;

export type QboEnvName = (typeof QBO_REQUIRED_ENV)[number];

/**
 * Published GST/HST on a taxable supply, in basis points.
 * Parent childcare fees stay exempt in the journal. This rate is only
 * for the KidEase platform fee, and the screen tells the centre to confirm.
 * Quebec QST is not included.
 */
export const GST_HST_BPS: Record<string, number> = {
  AB: 500,
  BC: 500,
  MB: 500,
  SK: 500,
  QC: 500,
  YT: 500,
  NT: 500,
  NU: 500,
  ON: 1300,
  NS: 1400,
  NB: 1500,
  NL: 1500,
  PE: 1500,
};

export function qboMissingEnv(env: NodeJS.ProcessEnv = process.env): QboEnvName[] {
  return QBO_REQUIRED_ENV.filter((name) => {
    const value = String(env[name] || "").trim();
    if (!value) return true;
    if (name === "INTUIT_ENVIRONMENT" && value !== "sandbox" && value !== "production") return true;
    if (name === "QBO_TOKEN_KEY" && !qboKeyBytes(value)) return true;
    return false;
  });
}

export function qboKeyBytes(raw: string): boolean {
  const text = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(text)) return true;
  try {
    const buf = Buffer.from(text, "base64");
    return buf.length === 32;
  } catch {
    return false;
  }
}

export function qboAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL(QBO_AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", QBO_ACCOUNTING_SCOPE);
  url.searchParams.set("state", input.state);
  return url.toString();
}

export function qboTokenRequest(input: { clientId: string; clientSecret: string; code: string; redirectUri: string }) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
  });
  return {
    url: QBO_TOKEN_URL,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64")}`,
    },
    body: body.toString(),
  };
}

export function qboApiHost(environment: string): string {
  return environment === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

export type QboAccount = "parent_fees" | "stripe_clearing" | "platform_fee" | "gst_itc";

export type QboJournalLine = {
  account: QboAccount;
  debitCents: number;
  creditCents: number;
  tax: "exempt" | "gst" | "hst";
  memo: string;
};

export function gstHstForFee(province: string): { bps: number; tax: "gst" | "hst" } | null {
  const code = province.trim().toUpperCase();
  const bps = GST_HST_BPS[code];
  if (!bps) return null;
  return { bps, tax: bps === 500 ? "gst" : "hst" };
}

/**
 * Centre journal for one paid parent bill. The parent pays the KidEase fee,
 * so the centre's Stripe deposit is the full invoice. Tax on that fee is a
 * separate KidEase invoice and is not posted here. Parent childcare stays exempt.
 */
export function qboJournal(input: {
  invoiceCents: number;
  feeCents: number;
  province: string;
}): QboJournalLine[] {
  const invoice = Math.max(0, Math.round(input.invoiceCents));
  const parentPaidFee = Math.max(0, Math.round(input.feeCents));
  void input.province;
  return [
    {
      account: "stripe_clearing",
      debitCents: invoice,
      creditCents: 0,
      tax: "exempt",
      memo: parentPaidFee > 0
        ? "Stripe deposit of the full centre bill. The parent paid the KidEase service fee."
        : "Stripe deposit of the full centre bill.",
    },
    {
      account: "parent_fees",
      debitCents: 0,
      creditCents: invoice,
      tax: "exempt",
      memo: "Parent childcare fee. Exempt from GST/HST in this export.",
    },
  ];
}

export function qboJournalBalances(lines: QboJournalLine[]): boolean {
  const debit = lines.reduce((sum, line) => sum + line.debitCents, 0);
  const credit = lines.reduce((sum, line) => sum + line.creditCents, 0);
  return debit === credit;
}

export type QboAccountMap = Partial<Record<QboAccount, string>>;

export function qboJournalBody(input: {
  lines: QboJournalLine[];
  accounts: QboAccountMap;
  txnDate: string;
  docNumber: string;
}): { ok: true; body: Record<string, unknown> } | { ok: false; missing: QboAccount[] } {
  const needed = [...new Set(input.lines.filter((line) => line.debitCents || line.creditCents).map((line) => line.account))];
  const missing = needed.filter((account) => !String(input.accounts[account] || "").trim());
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    body: {
      TxnDate: input.txnDate,
      DocNumber: input.docNumber.slice(0, 21),
      PrivateNote: "KidEase export. Confirm GST/HST with your accountant. KidEase does not file this return.",
      Line: input.lines
        .filter((line) => line.debitCents || line.creditCents)
        .map((line) => ({
          DetailType: "JournalEntryLineDetail",
          Amount: (line.debitCents || line.creditCents) / 100,
          Description: line.memo,
          JournalEntryLineDetail: {
            PostingType: line.debitCents ? "Debit" : "Credit",
            AccountRef: { value: String(input.accounts[line.account]).trim() },
          },
        })),
    },
  };
}
