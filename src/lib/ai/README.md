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

## Smart match

The quiz builds filters. An optional note may only add filters (`age`, `budget`, `french`, `schedule`, `extraSupport`). Home, work, and the start date are not sent to the model. Results are the existing Best match order, cut to 10. "Why this matches" uses listing reason codes only. A failed or invalid note falls back to the quiz. Flag: `smart-match`. Events: `smart_match_started`, `smart_match_completed`, `smart_match_result_clicked`, `smart_match_applied`.

## Listing writer

A claimed centre can draft a description from the website address already stored and from notes they type. The draft is editable. It is not saved until they click Save changes. Sentences that are not in those inputs are listed as unsourced and are not copied into the listing. Flag: `ai-listing-writer`. Events: `listing_writer_used`, `listing_writer_published`.



## What is stored

`ai_calls` stores the feature name, token counts, cost, latency, and whether the call failed. It does not store the prompt or the reply. `ai_cache` stores the scrubbed reply for 24 hours, keyed by a hash.
