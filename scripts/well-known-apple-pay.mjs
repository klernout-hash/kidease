/**
 * Apple Pay merchant domain association (Stripe → Apple).
 *
 * Path: /.well-known/apple-developer-merchantid-domain-association
 *
 * Hosted Stripe Checkout shows Apple Pay on checkout.stripe.com without this
 * file. The path is served only when Kyle pastes Stripe’s downloaded file
 * into STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION (Vercel) — after account
 * verification, Settings → Payment methods → Apple Pay → Add domain
 * www.kidease.ca. Do not invent the file contents. Unset → 404.
 */

export const APPLE_PAY_DOMAIN_ASSOCIATION_PATH =
  "/.well-known/apple-developer-merchantid-domain-association";

export const APPLE_PAY_ASSOCIATION_CONTENT_TYPE = "text/plain; charset=us-ascii";

export function normalizeApplePayWellKnownPath(pathname) {
  const raw = String(pathname ?? "").split("?")[0] || "/";
  if (raw.length > 1 && raw.endsWith("/")) return raw.slice(0, -1);
  return raw || "/";
}

export function isApplePayDomainAssociationPath(pathname) {
  return normalizeApplePayWellKnownPath(pathname) === APPLE_PAY_DOMAIN_ASSOCIATION_PATH;
}

/** Raw association body from env. Empty / missing → null (do not invent Apple’s file). */
export function resolveApplePayDomainAssociation(env = process.env) {
  const body = String(env?.STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION ?? "").trim();
  return body || null;
}

export function applePayDomainAssociationPayload(pathname, env = process.env) {
  if (!isApplePayDomainAssociationPath(pathname)) return null;
  const body = resolveApplePayDomainAssociation(env);
  if (!body) return null;
  return {
    path: APPLE_PAY_DOMAIN_ASSOCIATION_PATH,
    body: body.includes("\n") ? body : `${body}\n`,
    contentType: APPLE_PAY_ASSOCIATION_CONTENT_TYPE,
  };
}
