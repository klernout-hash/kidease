import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { APIError } from "@better-auth/core/error";
import { createAuthEndpoint } from "@better-auth/core/api";
import { sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import * as z from "zod";
import { resolveAndroidSha256Fingerprints } from "../../../scripts/well-known-app-links.mjs";
import { TWO_FACTOR_COOKIE } from "@/lib/auth/cookies";
import {
  PASSKEY_RP_ID,
  PASSKEY_RP_NAME,
  clientIpFromHeaders,
  isPasskeyProduction,
  passkeyExpectedOrigins,
  passkeySatisfiesAdminEmailStep,
} from "@/lib/passkey-policy";
import {
  PasskeyLimitError,
  PasskeyRateError,
  assertPasskeyRoom,
  deletePasskey,
  findPasskey,
  listPasskeyIds,
  listPasskeysForUser,
  logPasskeyEvent,
  openPasskeyChallenge,
  savePasskey,
  takePasskeyChallenge,
  touchPasskey,
} from "@/lib/server/passkeys";
import { signTwoFactorCookie, TWO_FACTOR_SESSION_TTL_MS } from "@/lib/two-factor-cookie";
import { ViewAsReadOnlyError } from "@/lib/view-as";

const responseBody = z.object({
  challengeId: z.string().min(32).max(32),
  deviceName: z.string().max(80).optional(),
  response: z.unknown(),
});

function requestHeaders(ctx: { headers?: Headers | null; request?: Request | null }): Headers {
  return ctx.headers || ctx.request?.headers || new Headers();
}

function origins() {
  return passkeyExpectedOrigins({
    production: isPasskeyProduction(),
    fingerprints: resolveAndroidSha256Fingerprints(process.env),
  });
}

function twoFactorSecret(): string {
  return (process.env.BETTER_AUTH_SECRET || process.env.ADMIN_EMAIL || "kidease-preview").trim();
}

function fail(
  code: string,
  message: string,
  status: "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "TOO_MANY_REQUESTS" = "BAD_REQUEST",
): never {
  throw APIError.from(status, { code, message });
}

function mapStoreError(err: unknown): never {
  if (err instanceof PasskeyRateError) fail(err.code, err.message, "TOO_MANY_REQUESTS");
  if (err instanceof PasskeyLimitError) fail(err.code, err.message);
  if (err instanceof ViewAsReadOnlyError) fail(err.code, err.message, "FORBIDDEN");
  throw err;
}

async function rememberAdminStep(
  ctx: {
    setCookie: (
      name: string,
      value: string,
      options: { httpOnly: boolean; secure: boolean; sameSite: "lax"; path: string; maxAge: number },
    ) => unknown;
  },
  userId: string,
  userVerified: boolean,
) {
  if (!passkeySatisfiesAdminEmailStep(userVerified)) return;
  const exp = Date.now() + TWO_FACTOR_SESSION_TTL_MS;
  await ctx.setCookie(TWO_FACTOR_COOKIE, signTwoFactorCookie(userId, exp, twoFactorSecret()), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(TWO_FACTOR_SESSION_TTL_MS / 1000),
  });
}

export function passkeyPlugin() {
  return {
    id: "passkey",
    endpoints: {
      passkeyRegisterOptions: createAuthEndpoint(
        "/passkey/register/options",
        { method: "POST", use: [sessionMiddleware] },
        async (ctx) => {
          const user = ctx.context.session.user;
          const ip = clientIpFromHeaders(requestHeaders(ctx));
          try {
            await assertPasskeyRoom(user.id);
            const existing = await listPasskeyIds(user.id);
            const options = await generateRegistrationOptions({
              rpName: PASSKEY_RP_NAME,
              rpID: PASSKEY_RP_ID,
              userName: user.email,
              userID: new TextEncoder().encode(user.id),
              userDisplayName: user.name || user.email,
              attestationType: "none",
              authenticatorSelection: {
                residentKey: "preferred",
                userVerification: "required",
              },
              excludeCredentials: existing.map((row) => ({ id: row.id, transports: row.transports })),
            });
            const challengeId = await openPasskeyChallenge({
              userId: user.id,
              ip,
              kind: "register",
              challenge: options.challenge,
            });
            return ctx.json({ options, challengeId });
          } catch (err) {
            mapStoreError(err);
          }
        },
      ),
      passkeyRegisterVerify: createAuthEndpoint(
        "/passkey/register/verify",
        { method: "POST", body: responseBody, use: [sessionMiddleware] },
        async (ctx) => {
          const user = ctx.context.session.user;
          const ip = clientIpFromHeaders(requestHeaders(ctx));
          const agent = requestHeaders(ctx).get("user-agent");
          const expected = await takePasskeyChallenge({
            id: ctx.body.challengeId,
            kind: "register",
            userId: user.id,
          });
          if (!expected) fail("PASSKEY_CHALLENGE", "That sign-in step expired. Try again.");
          let verified = false;
          try {
            const checked = await verifyRegistrationResponse({
              response: ctx.body.response as RegistrationResponseJSON,
              expectedChallenge: expected,
              expectedOrigin: origins(),
              expectedRPID: PASSKEY_RP_ID,
              requireUserVerification: true,
            });
            verified = checked.verified;
            if (!checked.verified || !checked.registrationInfo) {
              fail("PASSKEY_VERIFY", "Face ID or fingerprint sign-in could not be saved.");
            }
            const info = checked.registrationInfo;
            const transports = Array.isArray(
              (ctx.body.response as { response?: { transports?: string[] } }).response?.transports,
            )
              ? ((ctx.body.response as { response?: { transports?: string[] } }).response?.transports ?? [])
              : [];
            await savePasskey({
              id: info.credential.id,
              userId: user.id,
              publicKey: info.credential.publicKey,
              counter: info.credential.counter,
              transports,
              deviceName: ctx.body.deviceName || "",
            });
            await logPasskeyEvent({
              kind: "passkey_add",
              userId: user.id,
              ip,
              userAgent: agent,
              meta: { userVerified: info.userVerified },
            });
            return ctx.json({ ok: true as const });
          } catch (err) {
            if (!verified) {
              await logPasskeyEvent({
                kind: "passkey_fail",
                userId: user.id,
                ip,
                userAgent: agent,
                meta: { step: "register" },
              });
            }
            if (err instanceof APIError) throw err;
            mapStoreError(err);
          }
        },
      ),
      passkeyLoginOptions: createAuthEndpoint("/passkey/login/options", { method: "POST" }, async (ctx) => {
        const ip = clientIpFromHeaders(requestHeaders(ctx));
        try {
          const options = await generateAuthenticationOptions({
            rpID: PASSKEY_RP_ID,
            userVerification: "required",
            allowCredentials: [],
          });
          const challengeId = await openPasskeyChallenge({
            userId: null,
            ip,
            kind: "login",
            challenge: options.challenge,
          });
          return ctx.json({ options, challengeId });
        } catch (err) {
          mapStoreError(err);
        }
      }),
      passkeyLoginVerify: createAuthEndpoint(
        "/passkey/login/verify",
        { method: "POST", body: responseBody },
        async (ctx) => {
          const ip = clientIpFromHeaders(requestHeaders(ctx));
          const agent = requestHeaders(ctx).get("user-agent");
          const expected = await takePasskeyChallenge({ id: ctx.body.challengeId, kind: "login" });
          if (!expected) fail("PASSKEY_CHALLENGE", "That sign-in step expired. Try again.");
          const assertion = ctx.body.response as AuthenticationResponseJSON;
          const credentialId = typeof assertion?.id === "string" ? assertion.id : "";
          const stored = credentialId ? await findPasskey(credentialId) : null;
          if (!stored) {
            await logPasskeyEvent({ kind: "passkey_fail", ip, userAgent: agent, meta: { step: "login" } });
            fail("PASSKEY_VERIFY", "Face ID or fingerprint sign-in did not work. Use your email and password.", "UNAUTHORIZED");
          }
          try {
            const checked = await verifyAuthenticationResponse({
              response: assertion,
              expectedChallenge: expected,
              expectedOrigin: origins(),
              expectedRPID: PASSKEY_RP_ID,
              requireUserVerification: true,
              credential: {
                id: stored.id,
                publicKey: new Uint8Array(stored.publicKey),
                counter: stored.counter,
                transports: stored.transports,
              },
            });
            if (!checked.verified) {
              fail("PASSKEY_VERIFY", "Face ID or fingerprint sign-in did not work. Use your email and password.", "UNAUTHORIZED");
            }
            await touchPasskey(stored.id, checked.authenticationInfo.newCounter);
            const user = await ctx.context.internalAdapter.findUserById(stored.userId);
            if (!user) {
              fail("PASSKEY_VERIFY", "Face ID or fingerprint sign-in did not work. Use your email and password.", "UNAUTHORIZED");
            }
            const session = await ctx.context.internalAdapter.createSession(user.id, false);
            if (!session) fail("PASSKEY_SESSION", "Could not start a session.", "UNAUTHORIZED");
            await setSessionCookie(ctx, { session, user });
            const userVerified = checked.authenticationInfo.userVerified === true;
            await rememberAdminStep(ctx, user.id, userVerified);
            await logPasskeyEvent({
              kind: "passkey_login",
              userId: user.id,
              ip,
              userAgent: agent,
              meta: { userVerified },
            });
            return ctx.json({ ok: true as const, twoFactorSatisfied: passkeySatisfiesAdminEmailStep(userVerified) });
          } catch (err) {
            await logPasskeyEvent({
              kind: "passkey_fail",
              userId: stored.userId,
              ip,
              userAgent: agent,
              meta: { step: "login" },
            });
            if (err instanceof APIError) throw err;
            fail("PASSKEY_VERIFY", "Face ID or fingerprint sign-in did not work. Use your email and password.", "UNAUTHORIZED");
          }
        },
      ),
      passkeyList: createAuthEndpoint(
        "/passkey/list",
        { method: "GET", use: [sessionMiddleware] },
        async (ctx) => {
          const passkeys = await listPasskeysForUser(ctx.context.session.user.id);
          return ctx.json({ passkeys });
        },
      ),
      passkeyDelete: createAuthEndpoint(
        "/passkey/delete",
        {
          method: "POST",
          body: z.object({ id: z.string().min(16).max(512) }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const user = ctx.context.session.user;
          const ip = clientIpFromHeaders(requestHeaders(ctx));
          const removed = await deletePasskey(user.id, ctx.body.id);
          if (!removed) fail("PASSKEY_MISSING", "That passkey is already gone.");
          await logPasskeyEvent({
            kind: "passkey_remove",
            userId: user.id,
            ip,
            userAgent: requestHeaders(ctx).get("user-agent"),
            meta: {},
          });
          return ctx.json({ ok: true as const });
        },
      ),
    },
  };
}
