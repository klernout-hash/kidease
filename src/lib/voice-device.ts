/**
 * Twilio Device token and transport decisions. No call is placed here.
 * 20104 access token expired, 31005 connection lost, 31000 unknown,
 * 31009 no transport for updateToken.
 */
export function voiceTokenRefreshPlan(input: { registered: boolean; token: string | null }): "update" | "register" | "skip" {
  if (!input.token) return "skip";
  if (!input.registered) return "register";
  return "update";
}

export function voiceErrorPlan(code: number): "register" | "refresh" | "once" | "ignore" {
  if (code === 31009) return "register";
  if (code === 20104) return "refresh";
  if (code === 31005 || code === 31000) return "once";
  return "ignore";
}

/** VC1: a call error is never dropped. Only 31009 re-registers; the rest are shown. */
export function voiceCallErrorPlan(code: number): "register" | "show" {
  return code === 31009 ? "register" : "show";
}

/** VC1: the mic check gives up after `ms` so Start never hangs with no feedback. */
export function withinMs<T>(work: Promise<T>, ms: number, timedOut: T): Promise<T> {
  return Promise.race([work, new Promise<T>((done) => setTimeout(() => done(timedOut), ms))]);
}
