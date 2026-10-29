import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";

/**
 * Store the moment this account accepted 18+ and the Terms and Privacy Policy.
 * The first timestamp is kept. Email sign-up calls this directly. Social
 * sign-up stores it after the redirect. Does not collect a birth date.
 */
export const confirmAdultAge = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { blockViewAsSideEffect } = await import("@/lib/view-as-public");
    blockViewAsSideEffect("write");
    const sql = await getSql();
    await sql`alter table profiles add column if not exists adult_confirmed_at timestamptz`.catch(
      () => undefined,
    );
    await sql`
      insert into profiles (user_id, role, adult_confirmed_at)
      values (${context.userId}, 'parent', now())
      on conflict (user_id) do update
        set adult_confirmed_at = coalesce(profiles.adult_confirmed_at, now())
    `;
    return { ok: true as const };
  });
