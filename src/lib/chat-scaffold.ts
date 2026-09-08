/**
 * Future first-party in-app messaging (not Stream, not Sendbird).
 *
 * Production parent ↔ centre threads stay on `conversations` / `messages`
 * and the /inbox UI. That path is the live product (text only; poll/reload).
 * Tours live on `tour_requests` and are not enrolment bookings.
 *
 * This module is a typed stub for extra kinds (parent/admin). Do not treat
 * FEATURE_INAPP_CHAT as a Stream/Sendbird purchase.
 *
 * Suggested later (not applied):
 *   chat_threads (id, kind, created_at)
 *   chat_thread_members (thread_id, user_id, desk)
 *   chat_messages (id, thread_id, sender_id, body, created_at)
 */

export const CHAT_SCAFFOLD_READY = false;

export const CHAT_SCAFFOLD_MESSAGE =
  "This page is a flag checklist — not a chat product. Parents and centres already message on /inbox (text only, poll/reload). Do not buy Stream or Sendbird. Do not enable push, SMS, or video without a dry-run.";

export const CHAT_SCAFFOLD_EMPTY =
  "Could not load lab status. Confirm the admin session, then refresh. Live parent ↔ centre threads stay on /inbox regardless of these flags.";

export const CHAT_COMING_SOON_TITLE = "Coming soon";

export const CHAT_FLAG_OFF_MESSAGE =
  "Coming soon — FEATURE_INAPP_CHAT is off. Composer and delivery are not built. Live parent ↔ centre messages stay on /inbox.";

export const CHAT_COMPOSER_DISABLED_MESSAGE =
  "Composer is disabled. This lab does not send, store, or deliver messages. FEATURE_INAPP_CHAT on still does not enable Stream, Sendbird, or a fake chat.";

export const CHAT_COMPOSER_PLACEHOLDER = "Coming soon — in-app chat is not live";

export const CHAT_FLAG_ON_NOT_LIVE_MESSAGE =
  "FEATURE_INAPP_CHAT is on. Delivery is still not built — composer stays disabled. Do not treat this as working chat.";

export type ChatThreadKind = "parent_centre" | "parent_admin" | "centre_admin";

export type ChatThreadStub = {
  id: string;
  kind: ChatThreadKind;
  participantIds: string[];
  createdAt: string;
};

export type ChatMessageStub = {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

/** Planned send payload for a later first-party build. Never delivered today. */
export type ChatScaffoldSendInput = {
  threadId: string;
  body: string;
};

export type ChatComposerReason = "feature_off" | "scaffold_not_ready";

export type ChatComposerState = {
  enabled: false;
  ready: false;
  disabled: true;
  reason: ChatComposerReason;
  title: string;
  message: string;
  placeholder: string;
};

export function chatComposerState(featureOn: boolean): ChatComposerState {
  if (!featureOn) {
    return {
      enabled: false,
      ready: false,
      disabled: true,
      reason: "feature_off",
      title: CHAT_COMING_SOON_TITLE,
      message: CHAT_FLAG_OFF_MESSAGE,
      placeholder: CHAT_COMPOSER_PLACEHOLDER,
    };
  }
  return {
    enabled: false,
    ready: false,
    disabled: true,
    reason: "scaffold_not_ready",
    title: CHAT_COMING_SOON_TITLE,
    message: CHAT_FLAG_ON_NOT_LIVE_MESSAGE,
    placeholder: CHAT_COMPOSER_PLACEHOLDER,
  };
}

export function refuseScaffoldChatSend(_input: ChatScaffoldSendInput): { ok: false; error: string } {
  void _input;
  void CHAT_SCAFFOLD_READY;
  return { ok: false, error: CHAT_COMPOSER_DISABLED_MESSAGE };
}
