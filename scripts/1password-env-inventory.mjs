/**
 * Names-only 1Password Environments inventory for KidEase.
 * Never stores or prints secret values. Keep in sync with `.env.example`.
 */

export const VERCEL_PROJECT = "kidease-git";

/** 1Password Environment names Kyle should create (desktop app). */
export const ENVIRONMENT_NAMES = [
  {
    name: "KidEase Production",
    vercel: "production",
    notes: "Canonical store for www.kidease.ca. Copy the same names into Vercel Production.",
  },
  {
    name: "KidEase Preview",
    vercel: "preview",
    notes: "Vercel Preview. Prefer test / demo keys (Stripe sk_test_, DocuSign demo, Twilio test).",
  },
];

/**
 * @typedef {object} EnvVar
 * @property {string} name
 * @property {boolean} concealed  1Password "hide value by default"
 * @property {"both"|"production"|"preview"} vercel
 * @property {boolean} required
 * @property {string} notes
 */

/**
 * @typedef {object} EnvGroup
 * @property {string} id
 * @property {string} title
 * @property {string[]} docs
 * @property {EnvVar[]} vars
 */

/** @type {EnvGroup[]} */
export const GROUPS = [
  {
    id: "neon",
    title: "Neon",
    docs: ["docs/catalog-source.md"],
    vars: [
      {
        name: "DATABASE_URL",
        concealed: true,
        vercel: "both",
        required: true,
        notes: "Neon Postgres connection string. Same key on Production + Preview.",
      },
      {
        name: "CATALOG_SOURCE",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "auto | neon | json. Not a secret.",
      },
      {
        name: "NEON_CATALOG_MIN_COUNT",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "Threshold for auto Neon SoT. Not a secret.",
      },
      {
        name: "ALLOW_TEST_LISTINGS",
        concealed: false,
        vercel: "preview",
        required: false,
        notes: "1 to seed QA ghost fixtures. Off on Vercel Production. Not a secret.",
      },
    ],
  },
  {
    id: "better-auth",
    title: "Better Auth",
    docs: ["SECURITY.md"],
    vars: [
      {
        name: "BETTER_AUTH_SECRET",
        concealed: true,
        vercel: "both",
        required: true,
        notes: "Session signing. Mint with openssl rand -hex 32. Not AUTH_SECRET.",
      },
      {
        name: "BETTER_AUTH_URL",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "Optional public origin override.",
      },
      {
        name: "GOOGLE_CLIENT_ID",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "Native Google OAuth client id.",
      },
      {
        name: "GOOGLE_CLIENT_SECRET",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "Native Google OAuth client secret.",
      },
      {
        name: "FACEBOOK_CLIENT_ID",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "Meta app id.",
      },
      {
        name: "FACEBOOK_CLIENT_SECRET",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "Meta app secret.",
      },
    ],
  },
  {
    id: "stripe",
    title: "Stripe",
    docs: ["docs/store-readiness.md"],
    vars: [
      {
        name: "STRIPE_SECRET_KEY",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "sk_live_ turns charges on. Do not mix test and live in one Environment.",
      },
      {
        name: "STRIPE_PUBLISHABLE_KEY",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "pk_… Public publishable key.",
      },
      {
        name: "STRIPE_WEBHOOK_SECRET",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "whsec_… Checkout / Connect webhook HMAC.",
      },
      {
        name: "STRIPE_CONNECT_CLIENT_ID",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "ca_… Connect client id.",
      },
      {
        name: "STRIPE_PRICE_PRO_MONTHLY",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "price_… Not a secret key.",
      },
      {
        name: "STRIPE_PRICE_PRO_YEARLY",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "price_… Not a secret key.",
      },
      {
        name: "STRIPE_PRICE_NETWORK_MONTHLY",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "price_… Not a secret key.",
      },
      {
        name: "STRIPE_PRICE_PLUS_MONTHLY",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "price_… Not a secret key.",
      },
      {
        name: "STRIPE_PRICE_PLUS_YEARLY",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "price_… Not a secret key.",
      },
    ],
  },
  {
    id: "twilio",
    title: "Twilio",
    docs: ["docs/sms.md", "docs/video.md"],
    vars: [
      {
        name: "TWILIO_ACCOUNT_SID",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "AC… Shared by SMS and Video.",
      },
      {
        name: "TWILIO_AUTH_TOKEN",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "Webhook X-Twilio-Signature. Keep even when sending with an API key.",
      },
      {
        name: "TWILIO_API_KEY_SID",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "SK… Preferred send + required for Video Access Tokens.",
      },
      {
        name: "TWILIO_API_KEY_SECRET",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "API key secret. Save once from Console.",
      },
      {
        name: "TWILIO_MESSAGING_SERVICE_SID",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "MG… Prefer over a raw From for Canada.",
      },
      {
        name: "TWILIO_FROM_NUMBER",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "E.164 if no Messaging Service.",
      },
      {
        name: "TWILIO_STATUS_CALLBACK_URL",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "HTTPS status callback. Not a secret.",
      },
      {
        name: "TWILIO_INBOUND_CALLBACK_URL",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "HTTPS STOP / inbound callback. Not a secret.",
      },
      {
        name: "TWILIO_VIDEO_STATUS_CALLBACK_URL",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "Optional Video room status URL.",
      },
      {
        name: "FEATURE_SMS",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "Production: leave 0 until CASL + Canadian sender secrets exist. Preview may set 1.",
      },
      {
        name: "FEATURE_VIDEO",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "Production: leave 0 until the Video API key is on Vercel. Inbox hidden until SDK.",
      },
      {
        name: "FEATURE_PUSH",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "Production: leave 0 until FCM / APNs secrets + a native binary exist. Preview may set 1.",
      },
    ],
  },
  {
    id: "inngest",
    title: "Inngest",
    docs: ["docs/inngest.md"],
    vars: [
      {
        name: "INNGEST_EVENT_KEY",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "Inngest Cloud Event Key. App boots if unset.",
      },
      {
        name: "INNGEST_SIGNING_KEY",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "Cloud → app HMAC. Never put ?secret= on /api/inngest.",
      },
      {
        name: "INNGEST_SERVE_ORIGIN",
        concealed: false,
        vercel: "production",
        required: false,
        notes: "https://www.kidease.ca so Cloud syncs www, not *.vercel.app.",
      },
    ],
  },
  {
    id: "posthog",
    title: "PostHog",
    docs: ["docs/posthog.md", "docs/flags.md"],
    vars: [
      {
        name: "VITE_PUBLIC_POSTHOG_KEY",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "Public project API key (pixel class). Do not commit the value.",
      },
      {
        name: "POSTHOG_HOST",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "https://us.i.posthog.com — Vite inlines this prefix.",
      },
      {
        name: "VITE_PUBLIC_POSTHOG_HOST",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "Optional client override if POSTHOG_HOST is not inlined.",
      },
      {
        name: "POSTHOG_FLAGS_KEY",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "Optional server flag overlay. Leave unset for env-only flags.",
      },
      {
        name: "POSTHOG_FLAGS_HOST",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "Optional flags host. Not a secret.",
      },
    ],
  },
  {
    id: "docusign",
    title: "DocuSign",
    docs: ["docs/docusign.md"],
    vars: [
      {
        name: "DOCUSIGN_INTEGRATION_KEY",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "Apps and Keys → Integration Key.",
      },
      {
        name: "DOCUSIGN_USER_ID",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "Impersonated user GUID.",
      },
      {
        name: "DOCUSIGN_ACCOUNT_ID",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "API Account ID.",
      },
      {
        name: "DOCUSIGN_PRIVATE_KEY",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "RSA PEM. On Vercel keep newlines as the two characters \\n.",
      },
      {
        name: "DOCUSIGN_WEBHOOK_SECRET",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "Connect HMAC. Header only — never ?secret=.",
      },
      {
        name: "DOCUSIGN_ENV",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "demo | production. Preview should stay demo.",
      },
      {
        name: "DOCUSIGN_TEMPLATE_PROVIDER_AGREEMENT",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "Optional template id.",
      },
      {
        name: "DOCUSIGN_TEMPLATE_ENROLMENT_PACK",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "Optional template id.",
      },
      {
        name: "APP_ORIGIN",
        concealed: false,
        vercel: "production",
        required: false,
        notes: "https://www.kidease.ca for Connect callbacks.",
      },
    ],
  },
  {
    id: "r2",
    title: "Cloudflare R2",
    docs: ["scripts/r2-photo-migrate.md", "scripts/r2-public-photos.md"],
    vars: [
      {
        name: "R2_ACCOUNT_ID",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "Cloudflare account id (also used to derive the S3 endpoint).",
      },
      {
        name: "R2_ACCESS_KEY_ID",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "S3 API access key. Server-only — never prefix VITE_.",
      },
      {
        name: "R2_SECRET_ACCESS_KEY",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "S3 API secret. Server-only.",
      },
      {
        name: "R2_ENDPOINT",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "https://<ACCOUNT_ID>.r2.cloudflarestorage.com — private API host.",
      },
      {
        name: "R2_BUCKET",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "Defaults to kidease-media.",
      },
      {
        name: "R2_READ_ORIGINALS",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "Set 0 until migrate finishes. Not a secret.",
      },
      {
        name: "R2_PUBLIC_BASE_URL",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "https://media.kidease.ca — public media host, not a secret.",
      },
      {
        name: "VITE_R2_PUBLIC_BASE_URL",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "Same public host so the Vite client agrees with SSR.",
      },
    ],
  },
  {
    id: "ops-also",
    title: "Also on Vercel (store here too)",
    docs: ["SECURITY.md", "docs/search-alerts.md"],
    vars: [
      {
        name: "CRON_SECRET",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "Bearer for /api/digest, /api/search-alerts, /api/seed-catalog, /api/docusign/poll.",
      },
      {
        name: "SENTRY_DSN",
        concealed: true,
        vercel: "production",
        required: false,
        notes: "Server ingest. Never prefix VITE_.",
      },
      {
        name: "VITE_PUBLIC_SENTRY_DSN",
        concealed: false,
        vercel: "production",
        required: false,
        notes: "Same DSN string for the browser bundle.",
      },
      {
        name: "TITAN_APP_PASSWORD",
        concealed: true,
        vercel: "production",
        required: false,
        notes: "Mailbox app password, not the account password.",
      },
      {
        name: "RESEND_API_KEY",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "Transactional email (preferred).",
      },
      {
        name: "SENDGRID_API_KEY",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "Fallback transactional email.",
      },
      {
        name: "TURNSTILE_SITE_KEY",
        concealed: false,
        vercel: "both",
        required: false,
        notes: "Public widget site key.",
      },
      {
        name: "TURNSTILE_SECRET_KEY",
        concealed: true,
        vercel: "both",
        required: false,
        notes: "Turnstile server secret.",
      },
    ],
  },
];

/** Names that must never live in a long-lived mounted Environment. */
export const EPHEMERAL_NAMES = ["OPERATOR_RESET_EMAIL", "OPERATOR_RESET_PASSWORD"];

const ENV_NAME_RE = /^\s*#?\s*([A-Z][A-Z0-9_]+)=/;

/** Extract unique `NAME=` keys from `.env.example` text (commented or not). */
export function parseEnvExampleNames(text) {
  const names = new Set();
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.match(ENV_NAME_RE);
    if (match) names.add(match[1]);
  }
  return [...names].sort();
}

export function listedVariableNames(groups = GROUPS) {
  return groups.flatMap((group) => group.vars.map((item) => item.name));
}

/**
 * Presence only — never returns values.
 * @param {string[]} names
 * @param {NodeJS.ProcessEnv} [env]
 */
export function presenceReport(names, env = process.env) {
  const present = [];
  const missing = [];
  for (const name of names) {
    const raw = env[name];
    if (typeof raw === "string" && raw.trim()) present.push(name);
    else missing.push(name);
  }
  return { present, missing };
}

/**
 * @param {EnvGroup[]} groups
 * @param {{ presence?: { present: string[], missing: string[] } }} [opts]
 */
export function formatChecklist(groups = GROUPS, opts = {}) {
  const present = new Set(opts.presence?.present ?? []);
  const missing = new Set(opts.presence?.missing ?? []);
  const showPresence = Boolean(opts.presence);
  const lines = [
    `KidEase 1Password Environments checklist (names only)`,
    `Vercel project: ${VERCEL_PROJECT}`,
    `Environments: ${ENVIRONMENT_NAMES.map((item) => item.name).join(", ")}`,
    "",
  ];
  for (const group of groups) {
    lines.push(`## ${group.title}`);
    for (const item of group.vars) {
      const hide = item.concealed ? "concealed" : "visible";
      const need = item.required ? "required" : "optional";
      let mark = "-";
      if (showPresence) {
        if (present.has(item.name)) mark = "[present]";
        else if (missing.has(item.name)) mark = "[missing]";
      }
      lines.push(`  ${mark} ${item.name}  (${need}, ${hide}, Vercel ${item.vercel})`);
    }
    lines.push("");
  }
  lines.push("Do not print or commit values. See docs/1password-environments.md");
  return lines.join("\n");
}
