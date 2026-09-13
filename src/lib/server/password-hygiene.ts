import { createHash } from "node:crypto";
import {
  PASSWORD_BREACHED_MESSAGE,
  PASSWORD_COMMON_MESSAGE,
  localPasswordIssue,
} from "@/lib/password-hygiene";

const HIBP_RANGE = "https://api.pwnedpasswords.com/range/";
const HIBP_TIMEOUT_MS = 2500;

function sha1Upper(password: string): string {
  return createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
}

/** k-anonymity range lookup. `unknown` when HIBP egress is blocked or times out. */
export async function hibpPasswordBreached(password: string): Promise<boolean | "unknown"> {
  const hash = sha1Upper(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const res = await fetch(`${HIBP_RANGE}${prefix}`, {
      headers: {
        "Add-Padding": "true",
        "User-Agent": "KidEase-PasswordCheck",
      },
      signal: AbortSignal.timeout(HIBP_TIMEOUT_MS),
    });
    if (!res.ok) return "unknown";
    const body = await res.text();
    for (const line of body.split("\n")) {
      const candidate = line.split(":")[0]?.trim().toUpperCase();
      if (candidate === suffix) return true;
    }
    return false;
  } catch {
    return "unknown";
  }
}

export async function assertPasswordAllowed(password: string, email?: string): Promise<void> {
  const local = localPasswordIssue(password, email);
  if (local) throw new Error(local);
  const breached = await hibpPasswordBreached(password);
  if (breached === true) throw new Error(PASSWORD_BREACHED_MESSAGE);
  if (breached === "unknown" && localPasswordIssue(password, email) === PASSWORD_COMMON_MESSAGE) {
    throw new Error(PASSWORD_COMMON_MESSAGE);
  }
}

export { PASSWORD_BREACHED_MESSAGE, PASSWORD_COMMON_MESSAGE };
