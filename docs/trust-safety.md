# Trust and safety

## Flags

| Flag | Default | What it gates |
| --- | --- | --- |
| `FEATURE_TRUST_SAFETY` | off | Identity document queue and the admin trust desk actions. |
| `FEATURE_STRIPE_IDENTITY` | off | Optional Stripe Identity. Also needs `STRIPE_IDENTITY_RESTRICTED_KEY` (`rk_…`). Manual document review still works without it. |

The public page `/trust-safety` (French `/fr/trust-safety`) explains the rules and links to Report. It does not upload a file.

## Rules

- Owner documents are government ID or a business registration. JPEG, PNG, or PDF. Max 8 MB. Filenames that look like a child photo are refused. Files are not shown on the public listing.
- Duplicate and thin listings are scored for a person to review. Nothing is hidden automatically.
- Open safety reports are due 24 hours after `created_at` (`due_at`).
- Admin stays on the website (`/admin-trust`).

## GHL

Do not put identity documents or report queues in GoHighLevel. The CRM bot may store a tag `kidease-trust-review` with a case id only, after an admin asks for it.
