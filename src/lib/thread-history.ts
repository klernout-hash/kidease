import type { Message } from "./types.ts";

/**
 * What a parent or a centre sees in one thread.
 * A request note (system) and a real reply (parent or provider) both stay.
 * A notify row is only the push copy of that note, so it does not count as history.
 */
export function visibleThreadMessages<T extends Pick<Message, "body" | "kind" | "sender">>(messages: readonly T[]): T[] {
  return messages.filter((message) => {
    const body = String(message.body || "").replace(/\s+/g, " ").trim();
    if (!body) return false;
    if (message.kind === "notify") return false;
    return true;
  });
}
