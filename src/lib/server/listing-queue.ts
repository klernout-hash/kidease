import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";
import { writeTrustEvent } from "@/lib/server/trust";
import { PROVIDER_CREATED_CLAIM_STATUS } from "@/lib/listing-queue";

function makeClaimCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/**
 * Put a provider-created centre on the same Admin Waiting path as verifyClaim.
 * Does not set claimed_at / verified — Live only after Admin Approve.
 */
export async function enqueueProviderCreatedListing(
  sql: Awaited<ReturnType<typeof getSql>>,
  input: { daycareId: string; userId: string; daycareName?: string | null },
) {
  const status = PROVIDER_CREATED_CLAIM_STATUS;
  await sql`
    update daycares
    set claim_status = ${status}
    where id = ${input.daycareId} and claimed_at is null
  `.catch(() => undefined);

  const existing = await sql<{ id: string; status: string }>`
    select id, status from listing_claims
    where daycare_id = ${input.daycareId} and user_id = ${input.userId}
    order by created_at desc
    limit 1
  `.catch(() => [] as { id: string; status: string }[]);

  if (!existing[0]) {
    await sql`
      insert into listing_claims (id, daycare_id, user_id, code, status)
      values (${nid("cl")}, ${input.daycareId}, ${input.userId}, ${makeClaimCode()}, ${status})
    `.catch(() => undefined);
  } else if (existing[0].status === "pending" || existing[0].status === "unclaimed") {
    await sql`
      update listing_claims
      set status = ${status}
      where id = ${existing[0].id}
    `.catch(() => undefined);
  }

  await writeTrustEvent(sql, {
    daycareId: input.daycareId,
    actorUserId: input.userId,
    kind: "claim_waiting",
    note: "Provider created a new listing. Waiting on KidEase review.",
  });

  const name = (input.daycareName || "").trim();
  if (name) console.info("[kidease-listing] queued for admin review", name);
}
