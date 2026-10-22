/**
 * Account deletion unlinks Facebook. A Graph error must not block deletion.
 * Token values are never logged.
 */
import { unlinkFacebookPermissions } from "@/lib/auth/facebook-unlink";
import { getSql } from "@/lib/db";

type FacebookAccountRow = {
  accessToken: string | null;
};

export async function unlinkStoredFacebook(userId: string): Promise<void> {
  try {
    const sql = await getSql();
    const rows = await sql<FacebookAccountRow>`
      select "accessToken"
      from "account"
      where "userId" = ${userId} and "providerId" = 'facebook'
    `.catch(() => [] as FacebookAccountRow[]);
    for (const row of rows) {
      const token = await maybeDecryptToken(row.accessToken);
      if (!token) continue;
      await unlinkFacebookPermissions(token).catch(() => false);
    }
  } catch (err) {
    console.error("[kidease-auth] facebook unlink skipped", err instanceof Error ? err.name : "error");
  }
}

async function maybeDecryptToken(value: string | null | undefined): Promise<string | null> {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const key = process.env.BETTER_AUTH_SECRET?.trim();
  if (!key) return raw;
  try {
    const crypto = (await import("better-auth/crypto")) as {
      symmetricDecrypt?: (input: { key: string; data: string }) => Promise<string>;
    };
    if (typeof crypto.symmetricDecrypt !== "function") return raw;
    const plain = await crypto.symmetricDecrypt({ key, data: raw });
    return typeof plain === "string" && plain.trim() ? plain : raw;
  } catch {
    return raw;
  }
}
