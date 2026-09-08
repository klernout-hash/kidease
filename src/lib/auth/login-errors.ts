/** Map Better Auth / Turnstile / mail failures to copy we can show on login. */

export type EmailAccountKind = "missing" | "oauth_only" | "has_password" | "unknown";

export type EmailSignInExplanation = {
  kind: EmailAccountKind;
  providers: string[];
};

const SOCIAL_LABEL: Record<string, string> = {
  google: "Google",
  apple: "Apple",
  facebook: "Facebook",
  "grok-google": "Google",
};

export function socialProviderLabels(providers: string[]): string[] {
  const labels = providers
    .map((id) => SOCIAL_LABEL[id] || "")
    .filter(Boolean);
  return [...new Set(labels)];
}

export function oauthOnlyMessage(providers: string[] = []): string {
  const labels = socialProviderLabels(providers);
  const via = labels.length ? ` (${labels.join(", ")})` : "";
  return `This email is registered with Apple, Google, or Facebook${via} — use that button, or set a password from Forgot password.`;
}

export function classifyEmailAccounts(
  rows: Array<{ providerId?: string | null; password?: string | null }>,
): EmailAccountKind {
  if (!rows.length) return "missing";
  const hasPassword = rows.some(
    (row) =>
      (row.providerId === "credential" || row.providerId === "email") && Boolean(row.password),
  );
  if (hasPassword) return "has_password";
  return "oauth_only";
}

export function messageForEmailAccount(explanation: EmailSignInExplanation): string {
  if (explanation.kind === "missing") {
    return "No KidEase account uses that email. Create one, or try Apple / Google / Facebook.";
  }
  if (explanation.kind === "oauth_only") {
    return oauthOnlyMessage(explanation.providers);
  }
  if (explanation.kind === "has_password") {
    return "Wrong password for that email. Try again, or reset it from Forgot password.";
  }
  return "Email or password is incorrect.";
}

export function socialSignInFailedMessage(providerId?: string): string {
  const label = providerId ? SOCIAL_LABEL[providerId] : "";
  if (label) return `Could not start ${label} sign-in. Use email, or try again.`;
  return "Could not start social sign-in. Use email, or try again.";
}

/** Better Auth social/oauth2 must return a URL. Empty success is a dead button. */
export function resolveSocialSignInRedirect(
  result: {
    data?: { url?: string | null } | null;
    error?: { message?: string | null } | null;
  },
  providerId?: string,
): string {
  if (result.error) {
    throw new Error(result.error.message?.trim() || socialSignInFailedMessage(providerId));
  }
  const url = result.data?.url?.trim();
  if (!url) {
    throw new Error(socialSignInFailedMessage(providerId));
  }
  return url;
}

export function friendlyAuthError(
  message?: string | null,
  explanation?: EmailSignInExplanation | null,
): string {
  const raw = (message || "").toLowerCase();
  if (!raw && explanation && explanation.kind !== "unknown") {
    return messageForEmailAccount(explanation);
  }
  if (raw.includes("please complete the security check")) {
    return "Please complete the security check, then try again.";
  }
  if (raw.includes("security check failed") || raw.includes("security check")) {
    return "Security check failed. Refresh and try again.";
  }
  if (raw.includes("too many") || raw.includes("rate limit") || raw.includes("429")) {
    return "Too many sign-in tries. Wait a minute, then try again.";
  }
  if (raw.includes("missing or null origin") || raw.includes("missing_or_null_origin")) {
    return "This sign-in page needs a refresh — try again, or use email.";
  }
  if (raw.includes("invalid origin") || raw.includes("invalid_origin") || raw.includes("cross-site navigation")) {
    return "This sign-in page needs a refresh — try again, or use email.";
  }
  if (raw.includes("failed to create session") || raw.includes("failed_to_create_session")) {
    return "Signed in, but the session could not be saved. Refresh and try again.";
  }
  if (
    raw.includes("credential_account_not_found") ||
    raw.includes("credential account not found") ||
    raw.includes("no password") ||
    raw.includes("invalid password") ||
    raw.includes("invalid_password") ||
    raw.includes("invalid email") ||
    raw.includes("invalid_email_or_password") ||
    raw.includes("invalid email or password")
  ) {
    return "Email or password is incorrect. If you use Apple, Google, or Facebook, try that button, or reset from Forgot password.";
  }
  if (raw.includes("user already exists") || raw.includes("already exists")) {
    return "An account with that email already exists. Sign in instead.";
  }
  if (raw.includes("popup")) {
    return "Pop-up blocked — allow pop-ups for KidEase, then try again.";
  }
  if (raw.includes("could not start") && raw.includes("sign-in")) {
    return message?.trim() || socialSignInFailedMessage();
  }
  if (
    (raw.includes("client_id") || (raw.includes("apple") && raw.includes("secret"))) ||
    (raw.includes("provider") && raw.includes("not found"))
  ) {
    return "That sign-in method is not configured on this host. Use email or Google.";
  }
  if (
    raw.includes("not configured") ||
    raw.includes("resend_api_key") ||
    raw.includes("sendgrid_api_key")
  ) {
    return "Email is not configured (missing RESEND_API_KEY or SENDGRID_API_KEY).";
  }
  return (message || "").trim() || "Sign-in failed";
}

/** Better Auth / fetch error shapes → a string friendlyAuthError can map. */
export function authClientErrorMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error !== "object") return "";
  const row = error as {
    message?: unknown;
    statusText?: unknown;
    code?: unknown;
    error?: { message?: unknown; code?: unknown } | string;
    data?: { message?: unknown };
  };
  const nested = typeof row.error === "object" && row.error ? row.error : null;
  const parts = [row.message, row.statusText, row.data?.message, nested?.message, row.code, nested?.code];
  for (const part of parts) {
    if (typeof part === "string" && part.trim()) return part.trim();
  }
  return "";
}
