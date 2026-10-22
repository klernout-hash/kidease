/**
 * After the native Apple sheet, exchange the authorization code and store the refresh token.
 * Failure is logged and returned. It does not undo the sign-in.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { persistNativeAppleTokens } from "@/lib/auth/apple-native-store";
import { getSql } from "@/lib/db";

export const storeNativeAppleAuthorization = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { authorizationCode?: string }) => {
    const authorizationCode = String(input?.authorizationCode || "").trim();
    if (!authorizationCode || authorizationCode.length > 4096) {
      throw new Error("Apple sign-in could not be finished.");
    }
    return { authorizationCode };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    return persistNativeAppleTokens({
      userId: context.userId,
      authorizationCode: data.authorizationCode,
      sql,
    });
  });
