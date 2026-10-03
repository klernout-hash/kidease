/**
 * Which saved-search events may leave by email, SMS, or push.
 * In-app notices are not filtered here.
 * Open-spot mail stays off until FEATURE_OPEN_SPOT_ALERTS is on.
 */

export function eventsForOpenSpotMail<T extends { kind: string }>(events: T[], mailEnabled: boolean): T[] {
  if (mailEnabled) return events;
  return events.filter((event) => event.kind !== "vacancy_reconfirmed");
}
