/** Native shell shows one bottom prompt. Consent comes before notifications. */
export type NativeShellPrompt = "consent" | "push" | "none";

export function nativeShellPrompt(input: {
  native: boolean;
  consentUnset: boolean;
  pushExplain: boolean;
}): NativeShellPrompt {
  if (!input.native) return "none";
  if (input.consentUnset) return "consent";
  if (input.pushExplain) return "push";
  return "none";
}
