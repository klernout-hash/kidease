import { getSql } from "@/lib/db";
import { claimGovMaySee, claimNoticePlan, claimNoticesEnabled, claimNoticesMode } from "@/lib/wiring/claim-notices";
import { deliverNotice, governmentUserIds } from "@/lib/server/wiring/runtime";
import { newId } from "@/lib/server/wiring/runtime";

/** Called after an admin claim decision. No-ops while the flag is off. */
export async function notifyClaimDecision(input: {
  decision: string;
  daycareId: string;
  daycareUserId: string | null;
  province: string;
  centreName: string;
}): Promise<{ notified: boolean }> {
  if (!claimNoticesEnabled()) return { notified: false };
  const plan = claimNoticePlan(input.decision);
  if (!plan.notify) return { notified: false };
  const mode = claimNoticesMode();
  const word = plan.decision === "approved" ? "approved" : "declined";
  if (input.daycareUserId) {
    await deliverNotice({
      feature: "claim_notices",
      flag: "FEATURE_CLAIM_NOTICES",
      mode,
      userId: input.daycareUserId,
      role: "provider",
      title: `Claim ${word}`,
      body: `${input.centreName} was ${word}.`,
      href: "/provider/claim-notices",
      province: input.province,
      wantSms: true,
      wantEmail: false,
    });
  }
  for (const userId of await governmentUserIds(input.province)) {
    if (!claimGovMaySee(input.province, input.province)) continue;
    await deliverNotice({
      feature: "claim_notices",
      flag: "FEATURE_CLAIM_NOTICES",
      mode,
      userId,
      role: "government",
      title: `Claim ${word}`,
      body: `${input.centreName} in ${input.province} was ${word}.`,
      href: "/gov/claim-notices",
      province: input.province,
    });
  }
  const sql = await getSql();
  await sql`
    insert into claim_notice_log (id, daycare_id, province, decision, mode)
    values (${newId("cn")}, ${input.daycareId}, ${input.province}, ${plan.decision}, ${mode})
  `.catch(() => undefined);
  return { notified: true };
}
