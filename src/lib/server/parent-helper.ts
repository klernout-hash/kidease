import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { callAi } from "@/lib/ai/client";
import { AI_FLAGS } from "@/lib/ai/flags";
import { fetchAiFeatureFlags } from "@/lib/ai/flag-fetch";
import { sanitizeAiDistinctId } from "@/lib/ai/flag-gate";
import { bubbleQuestionForModel, consumeBubbleAsk } from "@/lib/ai/help-bubble";
import { sessionBearerMiddleware } from "@/lib/auth/middleware";
import {
  parentHelperModelUser,
  parentHelperSchema,
  PARENT_HELPER_SYSTEM,
  subsidyEstimate,
  type ParentAnswer,
  type SubsidyEstimate,
} from "@/lib/ai/parent-helper";
import {
  finishGuideAnswer,
  guideAudienceFromRole,
  prepareGuideTurn,
  type GuideAudience,
  type GuideLocale,
} from "@/lib/ai/site-guide";

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

async function parentHelperOn(distinctId: string): Promise<boolean> {
  const snapshot = await fetchAiFeatureFlags({ distinctId });
  return snapshot.reached === true && snapshot.flags[AI_FLAGS.parentHelper] === true;
}

async function audienceFor(userId: string | null): Promise<GuideAudience> {
  if (!userId) return "guest";
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ role: string }>`
      select role from profiles where user_id = ${userId} limit 1
    `;
    return guideAudienceFromRole(rows[0]?.role);
  } catch {
    return "parent";
  }
}

async function cityListingCount(slug: string): Promise<number | null> {
  try {
    const { liveHubCount } = await import("@/lib/server/city-directory");
    return await liveHubCount(slug);
  } catch {
    return null;
  }
}

async function canadaListingTotal(): Promise<number | null> {
  try {
    const { loadDirectoryCounts } = await import("@/lib/server/city-directory");
    const counts = await loadDirectoryCounts();
    let total = 0;
    for (const value of Object.values(counts.provinces)) total += Math.max(0, Math.floor(Number(value) || 0));
    return total > 0 ? total : null;
  } catch {
    return null;
  }
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

function askInput(input: { question?: string; distinctId?: string; turnstileToken?: string; locale?: string } | undefined) {
  const locale: GuideLocale = input?.locale === "fr" ? "fr" : "en";
  return {
    question: bubbleQuestionForModel(String(input?.question || "")),
    distinctId: sanitizeAiDistinctId(input?.distinctId),
    turnstileToken: String(input?.turnstileToken || "").trim().slice(0, 2048),
    locale,
  };
}

export const askParentHelper = createServerFn({ method: "POST" })
  .middleware([sessionBearerMiddleware])
  .validator(askInput)
  .handler(async ({ data, context }): Promise<ParentAnswer | ParentHelperBlock> => {
    const snapshot = await fetchAiFeatureFlags({ distinctId: data.distinctId });
    if (!(snapshot.reached === true && snapshot.flags[AI_FLAGS.parentHelper] === true)) return { ok: false, error: "off" };
    const bearer = (context as { bearerToken?: string }).bearerToken;
    const guard = await guardGuest({ bearer, turnstileToken: data.turnstileToken });
    if (!guard.ok) return guard;
    if (!data.question) return finishGuideAnswer(null, prepareGuideTurn({ question: "", audience: "guest", locale: data.locale }), data.locale);
    const audience = await audienceFor(guard.userId);
    const flags = snapshot.flags;
    const preview = prepareGuideTurn({ question: data.question, audience, locale: data.locale, flags });
    const cityCount = preview.needsCityCount && preview.citySlug ? await cityListingCount(preview.citySlug) : null;
    const canadaTotal = preview.needsCanadaTotal ? await canadaListingTotal() : null;
    const turn = prepareGuideTurn({
      question: data.question,
      audience,
      locale: data.locale,
      flags,
      cityCount,
      canadaTotal,
    });
    if (turn.direct) return turn.direct;
    const { logAiCall, readAiCache, writeAiCache } = await import("@/lib/server/ai-usage");
    const result = await callAi({
      feature: "parent-helper",
      system: PARENT_HELPER_SYSTEM,
      user: parentHelperModelUser(data.question, turn.pages),
      schema: parentHelperSchema,
      userId: guard.userId,
      ipHash: guard.ipHash,
      maxTokens: 220,
      deps: {
        log: logAiCall,
        readCache: readAiCache,
        writeCache: (key, body) => writeAiCache("parent-helper", key, body),
      },
    });
    if (!result.ok && result.error === "rate_limited") return { ok: false, error: "rate_limited" };
    return finishGuideAnswer(result.ok ? result.data : null, turn, data.locale);
  });

export const requestParentHelperAgent = createServerFn({ method: "POST" })
  .middleware([sessionBearerMiddleware])
  .validator(askInput)
  .handler(async ({ data, context }): Promise<{ ok: true } | ParentHelperBlock> => {
    if (!(await parentHelperOn(data.distinctId))) return { ok: false, error: "off" };
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
      void import("@/lib/server/admin-tools")
        .then((mod) => mod.maybeDraftSupport({ caseId: id, message: note }))
        .catch(() => undefined);
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
    if (!(await parentHelperOn(data.distinctId))) return { ok: false, error: "off" };
    return subsidyEstimate(data.province);
  });
