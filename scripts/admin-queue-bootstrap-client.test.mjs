import assert from "node:assert/strict";
import { test } from "node:test";
import { adminQueueProofMatches } from "../src/lib/admin-queue-bootstrap-state.ts";
import { proof, renderFixture } from "./fixtures/admin-queue-client.mjs";

// Pure SSR checks: default test discovery requires no build, browser or listener.
test("SSR renders the actual read-only count summary and preserves unavailable state in EN/FR", () => {
  for (const locale of ["en", "fr"]) {
    const html = renderFixture(proof(), locale);
    assert.match(html, /data-ke="admin-queue-bootstrap-counts"/);
    assert.match(html, />7<|>7<\//);
    assert.match(
      html,
      locale === "fr" ? /Totaux de toutes les provinces/ : /Totals across all provinces/,
    );
    assert.match(html, /href="\/admin\?tab=queue"/);
    assert.doesNotMatch(
      renderFixture(proof({ counts: { status: "unavailable" } }), locale),
      /data-ke="admin-queue-bootstrap-counts"/,
    );
  }
});

test("initial render rejects expired proofs and known auth, desk or identity denial before effects", () => {
  assert.doesNotMatch(
    renderFixture(proof({ expiresAt: Date.now() - 1 })),
    /data-ke="admin-queue-bootstrap-counts"/,
  );
  const denied = [
    {
      "@/lib/auth/client": {
        authClient: { useSession: () => ({ data: null, isPending: false, error: null }) },
      },
    },
    {
      "@/lib/auth/client": {
        authClient: {
          useSession: () => ({
            data: null,
            isPending: true,
            error: new Error("Synthetic auth failure"),
          }),
        },
      },
    },
    {
      "@/lib/auth/client": {
        authClient: {
          useSession: () => ({
            data: { user: { id: "synthetic-b" }, session: { id: "session-b" } },
            isPending: false,
            error: null,
          }),
        },
      },
    },
    { "@/lib/auth/use-current-user": { useLocallySignedOut: () => true } },
    ...[
      { session: null, ready: true, error: true },
      {
        session: { role: "parent", email: "synthetic@example.test", desks: ["parent"] },
        ready: true,
        error: false,
      },
      {
        session: {
          role: "admin",
          email: "kyle@kidease.ca",
          desks: ["admin"],
          viewAs: { userId: "synthetic-b" },
        },
        ready: true,
        error: false,
      },
    ].map((value) => ({ "@/components/session-desks": { useSessionDesks: () => value } })),
  ];
  for (const dependencies of denied)
    assert.doesNotMatch(
      renderFixture(proof(), "en", dependencies),
      /data-ke="admin-queue-bootstrap-counts"/,
    );
});

test("proof matching rejects expiry, future dates, oversized leases and either identity mismatch", () => {
  const now = Date.now();
  const p = proof({ checkedAt: now - 50, expiresAt: now + 500 });
  const id = { viewerId: p.viewerId, sessionId: p.sessionId };
  assert.equal(adminQueueProofMatches(p, id, now), true);
  for (const change of [
    { expiresAt: now },
    { checkedAt: now + 1 },
    { expiresAt: now + 20_000 },
    { checkedAt: NaN },
  ])
    assert.equal(adminQueueProofMatches({ ...p, ...change }, id, now), false);
  assert.equal(adminQueueProofMatches(p, { ...id, viewerId: "synthetic-b" }, now), false);
  assert.equal(adminQueueProofMatches(p, { ...id, sessionId: "session-b" }, now), false);
});
