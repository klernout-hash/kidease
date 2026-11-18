import type { AdminQueueBootstrap } from "./server/admin-queue-bootstrap";

export type AdminQueueIdentity = { viewerId: string; sessionId: string };
export type AdminQueueProof = NonNullable<AdminQueueBootstrap>;

/** A serialized summary is display data, never authority for a server request. */
export function adminQueueProofMatches(
  proof: AdminQueueBootstrap,
  identity: AdminQueueIdentity | null,
  now: number,
): proof is AdminQueueProof {
  return Boolean(
    proof &&
    identity &&
    proof.viewerId === identity.viewerId &&
    proof.sessionId === identity.sessionId &&
    Number.isFinite(proof.checkedAt) &&
    proof.checkedAt <= now &&
    Number.isFinite(proof.expiresAt) &&
    proof.expiresAt > now &&
    proof.expiresAt - proof.checkedAt <= 15_000,
  );
}

/** Every asynchronous result belongs to its current mount and session. */
export function createAdminQueueRequestGuard() {
  let generation = 0;
  return {
    begin: () => ++generation,
    current: (request: number) => request === generation,
    invalidate: () => {
      generation += 1;
    },
  };
}
