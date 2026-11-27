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

export function pushExplainCopy(audience: "parent" | "daycare" | "admin", locale: string) {
  const fr = locale === "fr";
  return {
    title: fr ? "Notifications sur ce téléphone" : "Notifications on this phone",
    retry: fr
      ? "Les notifications ne sont pas activées. Réessayez ou vérifiez les réglages de votre téléphone."
      : "Notifications are still off. Try again or check your phone settings.",
    body: audience === "daycare"
      ? fr ? "Recevez les nouvelles demandes et les messages des familles de votre centre." : "Get new requests and family messages for your centre."
      : audience === "admin"
        ? fr ? "Recevez les nouvelles alertes pour votre bureau." : "Get new alerts for your desk."
        : fr ? "Recevez les réponses des garderies et les rappels de visite." : "Get replies from daycares and reminders about visits.",
  };
}
