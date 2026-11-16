import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

async function sameSite() {
  const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
  assertSameSiteRequest();
}

export const persistentSessionStatus = createServerFn({ method: "GET" }).handler(async () => {
  await sameSite();
  const { readPersistentStatus } = await import("./persistent-session.server");
  return readPersistentStatus();
});

export const issuePersistentSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { remember?: boolean; shell?: boolean; biometric?: boolean; pushToken?: string }) => ({
    remember: input?.remember === true,
    shell: input?.shell === true,
    biometric: input?.biometric === true,
    pushToken: String(input?.pushToken || "").slice(0, 4096),
  }))
  .handler(async ({ context, data }) => {
    const { issuePersistentSession: issue } = await import("./persistent-session.server");
    return issue({
      userId: context.userId,
      remember: data.remember,
      clientShell: data.shell,
      biometric: data.biometric,
      pushToken: data.pushToken,
    });
  });

export const refreshPersistentSession = createServerFn({ method: "POST" })
  .validator((input: { refreshToken?: string }) => ({
    refreshToken: String(input?.refreshToken || "").slice(0, 400),
  }))
  .handler(async ({ data }) => {
    await sameSite();
    const { refreshDeviceSession } = await import("./persistent-session.server");
    return refreshDeviceSession(data.refreshToken);
  });

export const revokePersistentDevice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { current?: boolean }) => ({ current: input?.current !== false }))
  .handler(async ({ context }) => {
    const { revokePersistentDevice: revoke } = await import("./persistent-session.server");
    return revoke({ userId: context.userId, current: true });
  });

export const confirmPersistentBiometric = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { secret?: string }) => ({ secret: String(input?.secret || "").slice(0, 200) }))
  .handler(async ({ context, data }) => {
    const { confirmPersistentBiometric: confirm } = await import("./persistent-session.server");
    return confirm(context.userId, data.secret);
  });

export const touchPersistentPush = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { token?: string }) => ({ token: String(input?.token || "").slice(0, 4096) }))
  .handler(async ({ context, data }) => {
    const { touchPersistentPush: touch } = await import("./persistent-session.server");
    return touch(context.userId, data.token);
  });
