/**
 * Shared "this thread is blocked by me" state for one conversation.
 * The block control can sit in the header and in the details rail at once,
 * and the composer must lock the moment either one blocks (B03a: sends
 * failed silently while the composer stayed enabled).
 */
type Listener = () => void;

const state = new Map<string, boolean>();
const listeners = new Set<Listener>();

export function threadBlocked(conversationId: string): boolean {
  return state.get(conversationId) === true;
}

export function setThreadBlocked(conversationId: string, blocked: boolean): void {
  if (!conversationId) return;
  if (state.get(conversationId) === blocked) return;
  state.set(conversationId, blocked);
  for (const listener of [...listeners]) listener();
}

export function subscribeThreadBlocks(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test hook. */
export function resetThreadBlocks(): void {
  state.clear();
}
