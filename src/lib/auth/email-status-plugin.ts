import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";

/** Rate rule for the email-first step: a person types one or two emails, not dozens. */
export const EMAIL_STATUS_WINDOW_S = 60;
export const EMAIL_STATUS_MAX = 10;

const body = z.object({ email: z.string().trim().min(3).max(254) });

/** Lower-case and trim, the way sign-in stores and compares emails. */
export function normalizeStatusEmail(raw: string): string {
  return String(raw || "").trim().toLowerCase();
}

/**
 * Email-first sign-in: says only whether this email already has an account,
 * so the page can ask for a password (yes) or a name and password (no).
 * Like Airbnb, this tells the visitor whether the email is registered; the
 * rate rule in server.ts and the sign-in security check limit fishing.
 */
export function emailStatusPlugin() {
  return {
    id: "email-status",
    endpoints: {
      emailStatus: createAuthEndpoint("/email-status", { method: "POST", body }, async (ctx) => {
        const email = normalizeStatusEmail(ctx.body.email);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ctx.json({ exists: false, valid: false });
        const found = await ctx.context.internalAdapter.findUserByEmail(email);
        return ctx.json({ exists: Boolean(found?.user), valid: true });
      }),
    },
  };
}
