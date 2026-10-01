# KidEase AI

AI only explains or reshapes facts we already have. It never invents a daycare, price, licence, spot, or review.

## Rules

- Pass facts in. Validate model output with zod. If the shape is wrong, throw the draft away.
- Never send child names, birthdates, health or special-needs details, or parent contact info. `scrubText` and `scrubFacts` run before every call.
- All model calls go through `callAi` on the server. `XAI_API_KEY` stays in the environment.
- Rate limit per signed-in user and per IP hash. Identical scrubbed requests are cached for 24 hours.
- Messages, alerts, and listing text stay drafts until a person clicks publish or send. Nothing auto-sends.
- Each feature has its own PostHog flag in `flags.ts`. Parent and daycare flags default to 50%. Admin flags default to off.
- Log events only after analytics consent.
- If the call fails or times out, use the non-AI path. The page must still render.
- English and French strings ship together. The phone layout comes first.

## What is stored

`ai_calls` stores the feature name, token counts, cost, latency, and whether the call failed. It does not store the prompt or the reply. `ai_cache` stores the scrubbed reply for 24 hours, keyed by a hash.
