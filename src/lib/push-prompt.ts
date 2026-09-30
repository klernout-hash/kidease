/** When the native app may ask for notification permission. Never on the first launch. */
export type PushPromptStep = "skip-first" | "explain" | "register" | "done";

export function pushPromptStep(input: {
  enabled: boolean;
  firstLaunch: boolean;
  choice: string | null;
}): PushPromptStep {
  if (!input.enabled) return "done";
  if (input.firstLaunch) return "skip-first";
  if (input.choice === "yes") return "register";
  if (input.choice === "no") return "done";
  return "explain";
}
