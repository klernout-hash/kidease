import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { callAi } from "@/lib/ai/client";
import { AI_FLAGS } from "@/lib/ai/flags";
import { fetchAiFeatureFlags } from "@/lib/ai/flag-fetch";
import { sanitizeAiDistinctId } from "@/lib/ai/flag-gate";
import { bubbleQuestionForModel, consumeBubbleAsk } from "@/lib/ai/help-bubble";
import { sessionBearerMiddleware } from "@/lib/auth/middleware";
import {
  groundParentAnswer,
  parentHelperModelUser,
  parentHelperSchema,
  PARENT_HELPER_SYSTEM,
  subsidyEstimate,
  type ParentAnswer,
  type SubsidyEstimate,
} from "@/lib/ai/parent-helper";

export type ParentHelperBlock = { ok: false; error: "off" | "turnstile" | "rate_limited" | "ticket" };

async function ipHashFor(): Promise<string> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { clientIpFromHeaders } = await import("@/lib/server-fn-throttle");
    const ip = clientIpFromHeaders(getRequest().headers) || "guest";
    return createHash("sha256").update(ip).digest("hex").slice(0, 16);
  } catch {
    return createHash("sha256").update("guest").digest("hex").slice(0, 16);
  }
}

async function flagOn(distinctId: string): Promise<boolean> {
  const snapshot = await fetchAiFeatureFlags({ distinctId });
  return snapshot.reached === true && snapshot.flags[AI_FLAGS.parentHelper] === true;
}

async function sessionUserId(bearer?: string): Promise<string | null> {
  try {
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const session = await getSessionUser(bearer);
    return session?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Signed-out visitors share an IP bucket. Past the soft limit they must pass
 * Turnstile. A missing Turnstile key cannot be bypassed: the ask just waits.
 * The session id is for the ticket only. It is never sent to the model.
 */
async function guardGuest(input: {
  bearer?: string;
  turnstileToken: string;
}): Promise<{ ok: true; userId: string | null; ipHash: string } | ParentHelperBlock> {
  const ipHash = await ipHashFor();
  const userId = await sessionUserId(input.bearer);
  if (userId) return { ok: true, userId, ipHash };
  const { currentTurnstileMode, turnstileSecretKey } = await import("@/lib/server/turnstile");
  const { verifyTurnstileResponse } = await import("@/lib/server/turnstile-verify");
  const mode = currentTurnstileMode();
  let passed = false;
  if (mode !== "off" && input.turnstileToken) {
    const result = await verifyTurnstileResponse({
      token: input.turnstileToken,
      secret: turnstileSecretKey(),
      mode,
    });
    passed = result.ok === true && result.skipped !== true;
  }
  const decision = consumeBubbleAsk(ipHash, Date.now(), passed);
  if (!decision.ok) {
    if (decision.error === "turnstile" && mode === "off") return { ok: false, error: "rate_limited" };
    return { ok: false, error: decision.error };
  }
  return { ok: true, userId: null, ipHash };
}

function askInput(input: { question?: string; distinctId?: string; turnstileToken?: string } | undefined) {
  return {
    question: bubbleQuestionForModel(String(input?.question || "")),
    distinctId: sanitizeAiDistinctId(input?.distinctId),
    turnstileToken: String(input?.turnstileToken || "").trim().slice(0, 2048),
  };
}

export const askParentHelper = createServerFn({ method: "POST" })
  .middleware([sessionBearerMiddleware])
  .validator(askInput)
  .handler(async ({ data, context }): Promise<ParentAnswer | ParentHelperBlock> => {
    if (!(await flagOn(data.distinctId))) return { ok: false, error: "off" };
    const bearer = (context as { bearerToken?: string }).bearerToken;
    const guard = await guardGuest({ bearer, turnstileToken: data.turnstileToken });
    if (!guard.ok) return guard;
    if (!data.question) return groundParentAnswer(null);
    const { logAiCall, readAiCache, writeAiCache } = await import("@/lib/server/ai-usage");
    const result = await callAi({
      feature: "parent-helper",
      system: PARENT_HELPER_SYSTEM,
      user: parentHelperModelUser(data.question),
      schema: parentHelperSchema,
      userId: guard.userId,
      ipHash: guard.ipHash,
      maxTokens: 180,
      deps: {
        log: logAiCall,
        readCache: readAiCache,
        writeCache: (key, body) => writeAiCache("parent-helper", key, body),
      },
    });
    if (!result.ok && result.error === "rate_limited") return { ok: false, error: "rate_limited" };
    return groundParentAnswer(result.ok ? result.data : null);
  });

export const requestParentHelperAgent = createServerFn({ method: "POST" })
  .middleware([sessionBearerMiddleware])
  .validator(askInput)
  .handler(async ({ data, context }): Promise<{ ok: true } | ParentHelperBlock> => {
    if (!(await flagOn(data.distinctId))) return { ok: false, error: "off" };
    const bearer = (context as { bearerToken?: string }).bearerToken;
    const guard = await guardGuest({ bearer, turnstileToken: data.turnstileToken });
    if (!guard.ok) return guard;
    const note = data.question || "Visitor asked for a person from the help bubble.";
    try {
      const { getSql } = await import("@/lib/db");
      const { nid } = await import("@/lib/utils");
      const sql = await getSql();
      const id = nid("sc");
      await sql.query(
        `insert into support_cases (id, status, type, priority, subject, parent_user_id)
         values ($1, 'open', 'other', 'normal', $2, $3)`,
        [id, "Parent helper: a person was asked", guard.userId],
      );
      await sql.query(
        `insert into support_case_events (id, case_id, actor_user_id, kind, body, meta)
         values ($1, $2, $3, 'note', $4, $5::jsonb)`,
        [nid("sev"), id, guard.userId, note.slice(0, 400), JSON.stringify({ source: "parent-helper" })],
      );
      return { ok: true };
    } catch {
      return { ok: false, error: "ticket" };
    }
  });

export const estimateSubsidy = createServerFn({ method: "POST" })
  .validator((input: { province?: string; distinctId?: string } | undefined) => ({
    province: String(input?.province || "").trim().slice(0, 8),
    distinctId: sanitizeAiDistinctId(input?.distinctId),
  }))
  .handler(async ({ data }): Promise<SubsidyEstimate | { ok: false; error: "off" }> => {
    if (!(await flagOn(data.distinctId))) return { ok: false, error: "off" };
    return subsidyEstimate(data.province);
  });
