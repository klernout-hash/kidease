import { createServerFn } from "@tanstack/react-start";
import { getCatalog } from "@/lib/catalog";

export const matchCentres = createServerFn({ method: "POST" })
  .validator((prompt: string) => prompt.trim().slice(0, 500))
  .handler(async ({ data: prompt }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "unavailable" };
    const tokens = prompt.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const CATALOG = await getCatalog();
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
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content:
              "You match Canadian parents to licensed childcare from a fixed catalog. Reply with compact JSON only: {\"picks\":[{\"slug\":\"...\",\"why\":\"one sentence\"}],\"note\":\"one sentence\"}. Use only provided slugs. Prefer open spots over waitlists when the need matches. Max 3 picks.",
          },
          {
            role: "user",
            content: `Need: ${prompt}\nCatalog: ${JSON.stringify(catalog)}`,
          },
        ],
      }),
    });
    if (!res.ok) return { ok: false as const, error: `xAI ${res.status}` };
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    const text = body.choices[0]?.message.content ?? "";
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    try {
      const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
        picks: { slug: string; why: string }[];
        note: string;
      };
      return { ok: true as const, picks: parsed.picks ?? [], note: parsed.note ?? "" };
    } catch {
      return { ok: false as const, error: "parse" };
    }
  });
