import { createServerFn } from "@tanstack/react-start";
import {
  dailyLogsEnabled,
  enrolmentEsignEnabled,
  familyBulkMailEnabled,
  familyVaultEnabled,
  listCsvEnabled,
  postTourFollowupEnabled,
  parentAgreementEnabled,
  careRemindersEnabled,
  childPortfolioGateEnabled,
  coparentEmailEnabled,
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
  familyBulkMail: familyBulkMailEnabled(),
  postTourFollowup: postTourFollowupEnabled(),
  listCsv: listCsvEnabled(),
  taxReceipts: taxReceiptsEnabled(),
  dailyLogs: dailyLogsEnabled(),
  tourCalendar: tourCalendarEnabled(),
  familyVault: familyVaultEnabled(),
  unifiedInbox: unifiedInboxEnabled(),
  voice: voiceCallsEnabled(),
  pickupContacts: pickupContactsEnabled(),
  parentAgreement: parentAgreementEnabled(),
  portfolioGate: childPortfolioGateEnabled(),
  coparentEmail: coparentEmailEnabled(),
  careReminders: careRemindersEnabled(),
}));
