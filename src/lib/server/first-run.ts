/**
 * Per-account onboarding memory. Guests stay on this device only.
 * No email, SMS, or push.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { firstRunOnboardingEnabled } from "@/lib/features";
import {
  isOnboardingKey,
  type OnboardingState,
  type ParentQuickFacts,
  type ProviderSetupFacts,
} from "@/lib/first-run";

export const readFirstRunEnabled = createServerFn({ method: "GET" }).handler(async () => {
  return firstRunOnboardingEnabled();
});

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function on(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "t" || value === "true";
}

const EMPTY_PROVIDER: ProviderSetupFacts = {
  hasCentre: false,
  photos: null,
  infantMonthly: null,
  toddlerMonthly: null,
  preschoolMonthly: null,
  partTimeMonthly: null,
  ageMinMonths: null,
  ageMaxMonths: null,
  agesConfirmed: false,
  licensedCapacity: null,
  spotsInfant: null,
  spotsToddler: null,
  spotsPreschool: null,
  openingsKnown: false,
  tourTimes: false,
  chargesEnabled: false,
  staffInvited: false,
};

const EMPTY_PARENT: ParentQuickFacts = {
  profileReady: false,
  hasChild: false,
  hasSaved: false,
  hasTourRequest: false,
};

export const getOnboardingProgress = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<OnboardingState> => {
    if (!firstRunOnboardingEnabled()) return { seen: [], dismissed: [] };
    try {
      const sql = await getSql();
      const rows = await sql<{ item_key: string; seen_at: string | null; dismissed_at: string | null }>`
        select item_key, seen_at, dismissed_at
        from onboarding_progress
        where user_id = ${context.userId}
      `;
      const seen: string[] = [];
      const dismissed: string[] = [];
      for (const row of rows) {
        if (!isOnboardingKey(row.item_key)) continue;
        if (row.seen_at) seen.push(row.item_key);
        if (row.dismissed_at) dismissed.push(row.item_key);
      }
      return { seen, dismissed };
    } catch {
      return { seen: [], dismissed: [] };
    }
  });

export const saveOnboardingProgress = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { key?: string; action?: string }) => {
    const key = String(input?.key || "");
    const action = input?.action === "dismiss" || input?.action === "reopen" ? input.action : "seen";
    if (!isOnboardingKey(key)) throw new Error("Unknown onboarding key");
    return { key, action };
  })
  .handler(async ({ context, data }) => {
    if (!firstRunOnboardingEnabled()) return { ok: false as const };
    const sql = await getSql();
    if (data.action === "reopen") {
      await sql`
        update onboarding_progress
        set dismissed_at = null
        where user_id = ${context.userId} and item_key = ${data.key}
      `;
      return { ok: true as const };
    }
    if (data.action === "dismiss") {
      await sql`
        insert into onboarding_progress (user_id, item_key, seen_at, dismissed_at)
        values (${context.userId}, ${data.key}, now(), now())
        on conflict (user_id, item_key) do update
          set seen_at = coalesce(onboarding_progress.seen_at, now()),
              dismissed_at = now()
      `;
      return { ok: true as const };
    }
    await sql`
      insert into onboarding_progress (user_id, item_key, seen_at)
      values (${context.userId}, ${data.key}, now())
      on conflict (user_id, item_key) do update
        set seen_at = coalesce(onboarding_progress.seen_at, now())
    `;
    return { ok: true as const };
  });

export const getProviderSetupFacts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ProviderSetupFacts> => {
    if (!firstRunOnboardingEnabled()) return EMPTY_PROVIDER;
    try {
      const sql = await getSql();
      const rows = await sql<{
        photos: string | null;
        infant_monthly: number | null;
        toddler_monthly: number | null;
        preschool_monthly: number | null;
        part_time_monthly: number | null;
        age_min_months: number | null;
        age_max_months: number | null;
        ages_confirmed: number | null;
        licensed_capacity: number | null;
        spots_infant: number | null;
        spots_toddler: number | null;
        spots_preschool: number | null;
        openings_known: boolean | number | null;
        tour_times: boolean | number | null;
        charges_enabled: boolean | number | null;
        staff_invited: boolean | number | null;
      }>`
        select
          d.photos,
          d.infant_monthly,
          d.toddler_monthly,
          d.preschool_monthly,
          d.part_time_monthly,
          d.age_min_months,
          d.age_max_months,
          d.ages_confirmed,
          d.licensed_capacity,
          d.spots_infant,
          d.spots_toddler,
          d.spots_preschool,
          (
            d.confirmed_open_spots is not null
            or d.spots_updated_at is not null
            or d.last_vacancy_updated_at is not null
            or exists (select 1 from availability a where a.daycare_id = d.id)
          ) as openings_known,
          exists (select 1 from tour_windows w where w.daycare_id = d.id) as tour_times,
          exists (
            select 1 from stripe_accounts s
            where s.daycare_id = d.id and s.charges_enabled = 1
          ) as charges_enabled,
          (
            exists (
              select 1 from centre_invites i
              where i.daycare_id = d.id and i.status in ('pending', 'accepted')
            )
            or exists (
              select 1 from centre_members m
              where m.daycare_id = d.id and m.role <> 'owner' and m.status = 'active'
            )
          ) as staff_invited
        from provider_daycares p
        join daycares d on d.id = p.daycare_id
        where p.user_id = ${context.userId}
        order by d.created_at asc
        limit 1
      `;
      const row = rows[0];
      if (!row) return EMPTY_PROVIDER;
      return {
        hasCentre: true,
        photos: row.photos,
        infantMonthly: num(row.infant_monthly),
        toddlerMonthly: num(row.toddler_monthly),
        preschoolMonthly: num(row.preschool_monthly),
        partTimeMonthly: num(row.part_time_monthly),
        ageMinMonths: num(row.age_min_months),
        ageMaxMonths: num(row.age_max_months),
        agesConfirmed: on(row.ages_confirmed),
        licensedCapacity: num(row.licensed_capacity),
        spotsInfant: num(row.spots_infant),
        spotsToddler: num(row.spots_toddler),
        spotsPreschool: num(row.spots_preschool),
        openingsKnown: on(row.openings_known),
        tourTimes: on(row.tour_times),
        chargesEnabled: on(row.charges_enabled),
        staffInvited: on(row.staff_invited),
      };
    } catch {
      return EMPTY_PROVIDER;
    }
  });

export const getParentQuickFacts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ParentQuickFacts> => {
    if (!firstRunOnboardingEnabled()) return EMPTY_PARENT;
    try {
      const sql = await getSql();
      const rows = await sql<{
        display_name: string | null;
        city: string | null;
        phone: string | null;
        children: number | null;
        saved: number | null;
        tours: number | null;
      }>`
        select
          p.display_name,
          p.city,
          p.phone,
          (select count(*)::int from children c where c.user_id = ${context.userId}) as children,
          (select count(*)::int from saved_daycares s where s.user_id = ${context.userId}) as saved,
          (select count(*)::int from tour_requests t where t.user_id = ${context.userId}) as tours
        from profiles p
        where p.user_id = ${context.userId}
        limit 1
      `;
      const row = rows[0];
      if (!row) return EMPTY_PARENT;
      const profileReady = [row.display_name, row.city, row.phone].some((value) => String(value || "").trim().length > 1);
      return {
        profileReady,
        hasChild: (num(row.children) ?? 0) > 0,
        hasSaved: (num(row.saved) ?? 0) > 0,
        hasTourRequest: (num(row.tours) ?? 0) > 0,
      };
    } catch {
      return EMPTY_PARENT;
    }
  });
