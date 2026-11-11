/**
 * Words a person can read. This file does not send email, SMS, or push.
 */

export type ChannelState = "off" | "held" | "on";

/** Safe arrival keeps an in-app note. Email and phone alerts stay off. */
export function safeArrivalChannelState(): { email: "off"; push: "off"; inApp: "held" } {
  return { email: "off", push: "off", inApp: "held" };
}

/**
 * Provider settings. Off means the channel is not turned on.
 * Held means it is on but nothing is sent yet.
 * On means that channel can send.
 */
export function providerChannelState(input: {
  alertsOn: boolean;
  alertsLive: boolean;
  pushArmed: boolean;
}): { email: ChannelState; push: ChannelState } {
  return {
    email: !input.alertsOn ? "off" : input.alertsLive ? "on" : "held",
    push: !input.pushArmed ? "off" : input.alertsLive ? "on" : "held",
  };
}

export function channelStateLabel(state: ChannelState, locale: "en" | "fr"): string {
  if (locale === "fr") {
    if (state === "off") return "Éteint";
    if (state === "held") return "Retenu";
    return "Ouvert";
  }
  if (state === "off") return "Off";
  if (state === "held") return "Held";
  return "On";
}
