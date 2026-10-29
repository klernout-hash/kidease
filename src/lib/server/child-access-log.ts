import { nid } from "@/lib/utils";

type Sql = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
};

/** Who opened, saved, shared, or deleted a child profile. The row stores no health text. */
export async function logChildProfileAccess(
  sql: Sql,
  input: { childId: string; actorId: string; action: "read" | "write" | "share" | "delete"; daycareId?: string | null },
): Promise<void> {
  const childId = String(input.childId || "").trim();
  const actorId = String(input.actorId || "").trim();
  if (!childId || !actorId) return;
  try {
    await sql`
      insert into child_profile_access (id, child_id, actor_id, action, daycare_id)
      values (${nid("ca")}, ${childId}, ${actorId}, ${input.action}, ${input.daycareId ?? null})
    `;
  } catch {
    /* Migration 0106 may not be applied in every environment yet. */
  }
}
