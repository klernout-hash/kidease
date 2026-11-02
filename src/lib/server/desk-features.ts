import { createServerFn } from "@tanstack/react-start";
import {
  dailyLogsEnabled,
  enrolmentEsignEnabled,
  familyVaultEnabled,
  pickupContactsEnabled,
  reviewRepliesEnabled,
  taxReceiptsEnabled,
  tourCalendarEnabled,
  unifiedInboxEnabled,
  voiceCallsEnabled,
} from "@/lib/features";

/** One read for the desk screens. Every flag defaults off. */
export const loadDeskFeatureFlags = createServerFn({ method: "GET" }).handler(async () => ({
  reviewReplies: reviewRepliesEnabled(),
  enrolmentEsign: enrolmentEsignEnabled(),
  taxReceipts: taxReceiptsEnabled(),
  dailyLogs: dailyLogsEnabled(),
  tourCalendar: tourCalendarEnabled(),
  familyVault: familyVaultEnabled(),
  unifiedInbox: unifiedInboxEnabled(),
  voice: voiceCallsEnabled(),
  pickupContacts: pickupContactsEnabled(),
}));
