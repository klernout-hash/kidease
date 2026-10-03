import { isCloudflareAccessPath } from "../desks.ts";
import { isSignupWhy, type SignupWhy } from "../signup-funnel.ts";

export type { SignupWhy };
export { isSignupWhy };

/** Parent sign-in that returns the visitor to the page they were on. */
export function parentLoginSearch(next: string) {
  const dest = next.startsWith("/") ? next : `/${next}`;
  return {
    role: "parent" as const,
    desk: "parent" as const,
    intent: "in" as const,
    next: isCloudflareAccessPath(dest) ? "/parent" : dest,
  };
}

/**
 * One-screen create-account (email or Google) for a high-intent moment.
 * Sign-in stays one tap away on the same page.
 */
export function parentSignupSearch(next: string, why: SignupWhy) {
  return {
    ...parentLoginSearch(next),
    intent: "up" as const,
    why,
  };
}
