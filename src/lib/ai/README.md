# KidEase AI

AI only explains or reshapes facts we already have. It never invents a daycare, price, licence, spot, or review.

## Rules

- Pass facts in. Validate model output with zod. If the shape is wrong, throw the draft away.
- Never send child names, birthdates, health or special-needs details, or parent contact info. `scrubText` and `scrubFacts` run before every call.
- All model calls go through `callAi` on the server. `AI_GATEWAY_API_KEY` is used when it is set (Vercel AI Gateway, model `spacexai/grok-4.1-fast-non-reasoning`). Otherwise `XAI_API_KEY` calls api.x.ai. Keys stay in the environment and are not logged.
- Rate limit per signed-in user and per IP hash. Identical scrubbed requests are cached for 24 hours.
- Messages, alerts, and listing text stay drafts until a person clicks publish or send. Nothing auto-sends.
- Each feature has its own PostHog flag in `flags.ts`. `smart-match` and `ai-listing-writer` are read from PostHog on the server. If that flag is off, the button stays hidden. The built-in 50% split is used only when PostHog cannot be reached. The browser analytics SDK still waits for Allow. The server sends a random device id, not a name or email. The same read evaluates `ranking-best-match` and sends `$feature_flag_called`. Best match stays off when that flag is off or PostHog cannot be reached. It does not use the 50% split. Newer flags, starting with `ai-photo-check`, also stay off when PostHog cannot be reached.
- The help bot and centre match go through `callAi`, so they use the gateway key when it is set. Newer flags, starting with `ai-photo-check`, stay off when PostHog cannot be reached. `spot-alerts` is one of those: a daycare sees a count and a draft, and parents are notified only after approve.
- Log events only after analytics consent.
- If the call fails or times out, use the non-AI path. The page must still render.
- English and French strings ship together. The phone layout comes first.

## Smart match

The quiz builds filters. An optional note may only add filters (`age`, `budget`, `french`, `schedule`, `extraSupport`). Home, work, and the start date are not sent to the model. Results are the existing Best match order, cut to 10. "Why this matches" uses listing reason codes only. A failed or invalid note falls back to the quiz. Flag: `smart-match`. Events: `smart_match_started`, `smart_match_completed`, `smart_match_result_clicked`, `smart_match_applied`.

## Listing writer

A claimed centre can draft a description from the website address already stored and from notes they type. The draft is editable. It is not saved until they click Save changes. Sentences that are not in those inputs are listed as unsourced and are not copied into the listing. Flag: `ai-listing-writer`. Events: `listing_writer_used`, `listing_writer_published`.

## Spot alerts

When a daycare asks to notify parents, the server counts saved searches and waitlist rows that fit the open spots by age, start date, and distance. The daycare sees that count and a draft. Approve sends an in-app notice and an email. Unsubscribe and quiet hours (after 9 PM Winnipeg) are respected. A failed draft falls back to the existing waitlist pulse. Flag: `spot-alerts`. Events: `spot_alert_drafted`, `spot_alert_approved`, `spot_alert_held_quiet`, `spot_alert_fallback`.

## Reply drafts

A daycare can draft a reply from the parent's latest message and the listing facts on file. The draft is editable. Send is a separate click, and it is held after 9 PM Winnipeg. A failed draft leaves the box empty. Flag: `ai-reply-drafts`. Events: `reply_draft_used`, `reply_draft_sent`, `reply_draft_held_quiet`, `reply_draft_fallback`.

## Parent helper

The guide chat answers only from `/faq`, `/benefits`, and `/help`. It cites the page. If the pages do not answer, it says it does not know. A subsidy figure is returned only for published Alberta and Canada Child Benefit amounts. The old help bot uses this path when the flag is on. Flag: `parent-helper`. Events: `parent_helper_asked`, `parent_helper_unknown`, `parent_helper_subsidy`.

## Translate

A claimed centre can draft French from the listing text already saved. The draft is labelled auto-translated and can be edited. It is not saved until they click Save changes. A number, fee, or licence that is not in the English text is dropped, and a failed draft leaves the French box unchanged. Flag: `ai-translate`. Events: `translate_drafted`, `translate_fallback`.



## What is stored

`ai_calls` stores the feature name, token counts, cost, latency, and whether the call failed. It does not store the prompt or the reply. `ai_cache` stores the scrubbed reply for 24 hours, keyed by a hash.
