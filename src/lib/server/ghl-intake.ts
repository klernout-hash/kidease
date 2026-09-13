import { postGhlSignupIntake, type GhlIntakeTrigger } from "@/lib/ghl-intake";
import { lookupUser } from "@/lib/server/notify";
import { getSql } from "@/lib/db";

async function lookupProviderCompany(userId: string): Promise<string> {
  const sql = await getSql();
  const rows = await sql<{ name: string | null }>`
    select d.name
    from provider_daycares p
    join daycares d on d.id = p.daycare_id
    where p.user_id = ${userId}
    order by d.created_at desc
    limit 1
  `.catch(() => []);
  return (rows[0]?.name || "").trim();
}

/**
 * Best-effort CRM intake after parent/provider signup or claim verify.
 * Independent of Resend / SMS. Failures are logged and never thrown to the caller.
 */
export async function captureSignupIntakeFromUser(input: {
  userId: string;
  role: "parent" | "provider";
  trigger: GhlIntakeTrigger;
  eventId?: string | null;
  company?: string | null;
  phone?: string | null;
  name?: string | null;
  email?: string | null;
}) {
  try {
    const actor = await lookupUser(input.userId).catch(() => ({
      email: null as string | null,
      name: null as string | null,
      phone: null as string | null,
    }));
    let company = (input.company || "").trim();
    if (!company && input.role === "provider") {
      company = await lookupProviderCompany(input.userId).catch(() => "");
    }
    return await postGhlSignupIntake({
      trigger: input.trigger,
      email: input.email ?? actor.email,
      name: input.name ?? actor.name,
      phone: input.phone ?? actor.phone,
      company,
      eventId: (input.eventId || "").trim() || `${input.trigger}:${input.userId}`,
      onSkip: (reason) => console.info("[kidease-ghl]", reason),
      onError: (err) => console.error("[kidease-ghl]", err instanceof Error ? err.message : err),
    });
  } catch (err) {
    console.error("[kidease-ghl]", err instanceof Error ? err.message : err);
    return { ok: false as const, error: err instanceof Error ? err.message : "ghl-failed" };
  }
}
