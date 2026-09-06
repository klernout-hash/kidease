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
  "In-app chat is scaffolded only. Parent ↔ centre messages stay on /inbox. Do not buy Stream yet.";

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
