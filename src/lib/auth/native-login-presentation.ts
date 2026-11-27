/** UI only: the sign-in handler and its security check remain unchanged. */
export function waitToShowNativeLogin(input: {
  native: boolean;
  explicitFlow: boolean;
  sessionPending: boolean;
  hasUser: boolean;
  resume: "idle" | "opening" | "signed-out";
  busy: boolean;
  interrupted: boolean;
}): boolean {
  if (!input.native || input.explicitFlow || input.interrupted || input.resume === "signed-out") return false;
  if (input.resume === "opening") return true;
  // A manual submit already has a live form. Don't tear it down mid-attempt.
  return !input.busy && (input.sessionPending || input.hasUser);
}
