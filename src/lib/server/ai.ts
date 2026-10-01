import { createServerFn } from "@tanstack/react-start";
import { callAi } from "@/lib/ai/client";
import { parseCentreMatch } from "@/lib/ai/match-reply";
import { allowAiSpend } from "@/lib/ai-spend";
import { authMiddleware } from "@/lib/auth/middleware";
import { getPublicCatalog } from "@/lib/catalog";
import { CHAT_FLAG_OFF_MESSAGE } from "@/lib/chat-scaffold";
import { inAppChatEnabled } from "@/lib/features";
import { AGENT_CONFIRM, KIDEASE_SYSTEM, localHelpReply, wantsLiveAgent } from "@/lib/help-knowledge";
import { notifyPlatform } from "@/lib/server/notify";

const MATCH_SYSTEM =
  'You match Canadian parents to licensed childcare from a fixed catalog. Reply with compact JSON only: {"picks":[{"slug":"...","why":"one sentence"}],"note":"one sentence"}. Use only provided slugs. Prefer open spots over waitlists when the need matches. Max 3 picks.';

async function chatDeps(feature: string) {
  try {
    const { logAiCall, readAiCache, writeAiCache } = await import("@/lib/server/ai-usage");
    return {
      log: logAiCall,
      readCache: readAiCache,
      writeCache: (key: string, body: string) => writeAiCache(feature, key, body),
    };
  } catch {
    return {};
  }
}

export const matchCentres = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((prompt: string) => prompt.trim().slice(0, 500))
  .handler(async ({ context, data: prompt }) => {
    if (!allowAiSpend(context.userId)) return { ok: false as const, error: "rate_limit" };
    const tokens = prompt.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const CATALOG = await getPublicCatalog();
    const scored = CATALOG.map((d) => {
      const hay = `${d.name} ${d.city} ${d.province} ${d.amenities} ${d.tagline}`.toLowerCase();
      const score = tokens.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
      return { d, score };
    })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 80)
      .map(({ d }) => d);
    const slice = scored.length ? scored : CATALOG.slice(0, 40);
    const catalog = slice.map((d) => ({
      slug: d.slug,
      name: d.name,
      city: d.city,
      province: d.province,
      ages: `${d.ageMinMonths}-${d.ageMaxMonths} months`,
      infant: d.infantMonthly,
      toddler: d.toddlerMonthly,
      preschool: d.preschoolMonthly,
      spots: d.spotsInfant + d.spotsToddler + d.spotsPreschool,
      waitlist: d.waitlist,
      languages: d.languages,
      amenities: d.amenities,
      tagline: d.tagline,
    }));
    const result = await callAi({
      feature: "match-centres",
      system: MATCH_SYSTEM,
      user: `Need: ${prompt}\nCatalog: ${JSON.stringify(catalog)}`,
      maxTokens: 500,
      userId: context.userId,
      deps: await chatDeps("match-centres"),
    });
    if (!result.ok) return { ok: false as const, error: "unavailable" };
    const parsed = parseCentreMatch(result.text, catalog.map((row) => row.slug));
    if (!parsed) return { ok: false as const, error: "unavailable" };
    return { ok: true as const, picks: parsed.picks, note: parsed.note };
  });

export const askKidEase = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { messages: Array<{ role: "user" | "assistant"; text: string }> }) => ({
    messages: input.messages.slice(-8).map((m) => ({
      role: m.role,
      text: m.text.trim().slice(0, 800),
    })),
  }))
  .handler(async ({ context, data }) => {
    try {
      if (!inAppChatEnabled()) {
        return {
          ok: false as const,
          live: false as const,
          reply: CHAT_FLAG_OFF_MESSAGE,
        };
      }
      if (!allowAiSpend(context.userId)) {
        return { ok: true as const, live: false as const, reply: localHelpReply(data.messages.filter((m) => m.role === "user").at(-1)?.text || "", []) };
      }
      const last = data.messages.filter((m) => m.role === "user").at(-1)?.text;
      if (!last) return { ok: true as const, reply: "How can I help you find licensed care?" };
      const transcript = data.messages
        .map((m) => `${m.role === "user" ? "Visitor" : "KidEase"}: ${m.text}`)
        .join("\n");
      const prior = data.messages.filter((m) => m.role === "assistant").map((m) => m.text);
      const ping = async (title: string) => {
        try {
          await notifyPlatform({ kind: "chat", title, detail: transcript });
        } catch {
          /* still answer in the widget */
        }
      };
      if (wantsLiveAgent(last)) {
        await ping("Live agent requested");
        return { ok: true as const, live: true as const, reply: AGENT_CONFIRM };
      }
      await ping(`Live Chat: ${last.slice(0, 80)}`);
      const result = await callAi({
        feature: "in-app-chat",
        system: KIDEASE_SYSTEM,
        user: transcript,
        maxTokens: 700,
        userId: context.userId,
        deps: await chatDeps("in-app-chat"),
      });
      const reply = result.ok ? result.data.trim() : "";
      return { ok: true as const, live: result.ok, reply: reply || localHelpReply(last, prior) };
    } catch {
      return { ok: true as const, live: false as const, reply: AGENT_CONFIRM };
    }
  });
