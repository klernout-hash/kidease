/**
 * Scheduled mail and stale-spot hide.
 * Parent daycare bills only. This file does not read or turn on KidEase
 * subscriptions, Apple IAP, or Google Play billing.
 */

import { getSql } from "@/lib/db";
import {
  AUTOMATION_FALLBACK_TZ,
  automationLocale,
  automationModeFromEnv,
  automationQuietNow,
  automationZone,
  centreMissingFields,
  claimListingLetter,
  claimReminderPlan,
  dayKeyInTimeZone,
  invoiceLetter,
  isWeeklyReminderDay,
  missingInfoLetter,
  onboardingLetter,
  onboardingStep,
  parentChildProfileMissing,
  parentProfileLetter,
  parseAllowlist,
  parseDailyCap,
  planInvoiceMail,
  reviewRequestDue,
  reviewRequestLetter,
  staleSpotAction,
  staleSpotLetter,
  tourFollowupDue,
  tourFollowupLetter,
  weekKey,
  type AutomationLocale,
  type AutomationMode,
} from "@/lib/automations";
import { dispatchAutomationMail, type DispatchResult } from "@/lib/server/automation-mail";
import { runTracked } from "@/lib/server/automation-ops";

type Count = Record<string, number>;

function add(bag: Count, key: string) {
  bag[key] = (bag[key] || 0) + 1;
}

function flagModes(dryRun: boolean) {
  const env = process.env;
  return {
    invoice: automationModeFromEnv("FEATURE_INVOICE_REMINDERS", env, dryRun),
    dunning: automationModeFromEnv("FEATURE_PAYMENT_DUNNING", env, dryRun),
    missing: automationModeFromEnv("FEATURE_MISSING_INFO_REMINDERS", env, dryRun),
    onboard: automationModeFromEnv("FEATURE_DAYCARE_ONBOARDING", env, dryRun),
    claim: automationModeFromEnv("FEATURE_CLAIM_LISTING_REMINDERS", env, dryRun),
    stale: automationModeFromEnv("FEATURE_STALE_OPEN_SPOTS", env, dryRun),
    tour: automationModeFromEnv("FEATURE_POST_TOUR_FOLLOWUP", env, dryRun),
    review: automationModeFromEnv("FEATURE_ENROLMENT_REVIEW", env, dryRun),
  };
}

function allowlist() {
  return parseAllowlist(process.env.AUTOMATION_TEST_EMAILS);
}

function centreLocale(province: string | null, ownerLocale: string | null): AutomationLocale {
  if (String(province || "").toUpperCase() === "QC") return "fr";
  return automationLocale(ownerLocale);
}

async function sendOne(input: {
  automation: string;
  dedupeKey: string;
  recipient: string | null;
  letter: { subject: string; text: string; html: string };
  mode: AutomationMode;
  quiet: boolean;
  bag: Count;
}): Promise<DispatchResult | "skipped"> {
  if (input.mode === "off" || !input.recipient) {
    add(input.bag, "skipped");
    return "skipped";
  }
  const result = await dispatchAutomationMail({
    automation: input.automation,
    dedupeKey: input.dedupeKey,
    recipient: input.recipient,
    subject: input.letter.subject,
    text: input.letter.text,
    html: input.letter.html,
    mode: input.mode,
    quiet: input.quiet,
    allowlist: allowlist(),
  });
  add(input.bag, result);
  return result;
}

export async function runInvoiceRemindersJob(options: { dryRun?: boolean; now?: Date; force?: boolean } = {}) {
  return runTracked("invoice-reminders", async () => {
    const now = options.now ?? new Date();
    const flag = flagModes(Boolean(options.dryRun));
    if (flag.invoice === "off" && flag.dunning === "off") {
      return { ok: true, skipped: true, reason: "flag_off" };
    }
    const today = dayKeyInTimeZone(now, AUTOMATION_FALLBACK_TZ);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      number: string;
      status: string;
      due_at: string | null;
      paid_at: string | null;
      updated_at: string | null;
      centre: string;
      email: string | null;
      locale: string | null;
      time_zone: string | null;
      province: string | null;
    }>`
      select i.id, i.number, i.status, i.due_at::text as due_at, i.paid_at::text as paid_at,
             i.updated_at::text as updated_at, d.name as centre, u.email,
             p.locale, p.time_zone, d.province
      from invoices i
      join daycares d on d.id = i.daycare_id
      join "user" u on u.id = i.parent_user_id
      left join profiles p on p.user_id = u.id
      where i.paid_at is null
        and i.status in ('sent', 'open', 'unpaid', 'past_due', 'payment_failed', 'failed')
      order by i.due_at nulls last
      limit 400
    `.catch(() => []);
    const bag: Count = {};
    for (const row of rows) {
      const plan = planInvoiceMail({
        invoiceId: row.id,
        status: row.status,
        dueAt: row.due_at,
        paidAt: row.paid_at,
        failedAt: row.updated_at,
        today,
        remindersOn: flag.invoice !== "off",
        dunningOn: flag.dunning !== "off",
      });
      if (plan.kind === "stop") {
        add(bag, plan.reason);
        continue;
      }
      const letter = invoiceLetter({
        locale: automationLocale(row.locale),
        centreName: row.centre || "your centre",
        number: row.number,
        stage: plan.stage,
        kind: plan.kind === "dunning" ? "dunning" : "remind",
      });
      await sendOne({
        automation: plan.kind === "dunning" ? "payment_dunning" : "invoice_reminder",
        dedupeKey: plan.dedupeKey,
        recipient: row.email,
        letter,
        mode: plan.kind === "dunning" ? flag.dunning : flag.invoice,
        quiet: automationQuietNow(now, row.time_zone, row.province),
        bag,
      });
    }
    return { ok: true, skipped: false, today, scanned: rows.length, ...bag };
  });
}

export async function runListingRemindersJob(options: { dryRun?: boolean; now?: Date; force?: boolean } = {}) {
  return runTracked("listing-reminders", async () => {
    const now = options.now ?? new Date();
    const flag = flagModes(Boolean(options.dryRun));
    if (flag.missing === "off" && flag.onboard === "off" && flag.claim === "off") {
      return { ok: true, skipped: true, reason: "flag_off" };
    }
    const bag: Count = {};
    const sql = await getSql();
    const today = dayKeyInTimeZone(now, AUTOMATION_FALLBACK_TZ);
    const weekly = isWeeklyReminderDay(now);

    if (flag.missing !== "off" && weekly) {
      const centres = await sql<{
        id: string;
        name: string;
        province: string | null;
        license_number: string | null;
        photos: string | null;
        hours: string | null;
        phone: string | null;
        contact_email: string | null;
        infant_monthly: number | null;
        toddler_monthly: number | null;
        preschool_monthly: number | null;
        part_time_monthly: number | null;
        ages_confirmed: number | null;
        age_min_months: number | null;
        age_max_months: number | null;
        email: string | null;
        locale: string | null;
        time_zone: string | null;
        timezone: string | null;
      }>`
        select d.id, d.name, d.province, d.license_number, d.photos, d.hours, d.phone, d.contact_email,
               d.infant_monthly, d.toddler_monthly, d.preschool_monthly, d.part_time_monthly,
               d.ages_confirmed, d.age_min_months, d.age_max_months,
               coalesce(nullif(trim(owner.email), ''), nullif(trim(d.contact_email), '')) as email,
               owner.locale, owner.time_zone, d.timezone
        from daycares d
        left join lateral (
          select u.email, p.locale, p.time_zone
          from provider_daycares pd
          join "user" u on u.id = pd.user_id
          left join profiles p on p.user_id = u.id
          where pd.daycare_id = d.id
          order by u."createdAt" asc
          limit 1
        ) owner on true
        where d.claimed_at is not null
          and coalesce(d.is_test, 0) = 0
          and coalesce(d.is_demo, 0) = 0
        order by d.id
        limit 400
      `.catch(() => []);
      const week = weekKey(now);
      for (const row of centres) {
        const missing = centreMissingFields({
          id: row.id,
          province: row.province,
          licenseNumber: row.license_number,
          photos: row.photos,
          hours: row.hours,
          phone: row.phone,
          email: row.contact_email,
          infant: row.infant_monthly,
          toddler: row.toddler_monthly,
          preschool: row.preschool_monthly,
          partTime: row.part_time_monthly,
          agesConfirmed: row.ages_confirmed,
          ageMinMonths: row.age_min_months,
          ageMaxMonths: row.age_max_months,
        });
        if (!missing.length) {
          add(bag, "complete");
          continue;
        }
        const locale = centreLocale(row.province, row.locale);
        await sendOne({
          automation: "missing_info_centre",
          dedupeKey: `missing:${row.id}:${week}`,
          recipient: row.email,
          letter: missingInfoLetter({ locale, centreName: row.name, missing }),
          mode: flag.missing,
          quiet: automationQuietNow(now, row.time_zone || row.timezone, row.province),
          bag,
        });
      }

      const parents = await sql<{
        id: string;
        email: string | null;
        locale: string | null;
        time_zone: string | null;
        kids: number;
      }>`
        select u.id, u.email, p.locale, p.time_zone,
               (
                 select count(*)::int from children c
                 where c.user_id = u.id
                   and length(trim(coalesce(c.name, ''))) > 0
                   and length(trim(coalesce(c.birthdate, ''))) > 0
               ) as kids
        from "user" u
        join profiles p on p.user_id = u.id
        where p.role = 'parent'
          and u."createdAt" < now() - interval '7 days'
        order by u."createdAt"
        limit 400
      `.catch(() => []);
      for (const row of parents) {
        if (!parentChildProfileMissing(Number(row.kids) || 0)) {
          add(bag, "complete");
          continue;
        }
        const locale = automationLocale(row.locale);
        await sendOne({
          automation: "missing_info_parent",
          dedupeKey: `child:${row.id}:${week}`,
          recipient: row.email,
          letter: parentProfileLetter(locale),
          mode: flag.missing,
          quiet: automationQuietNow(now, row.time_zone),
          bag,
        });
      }
    } else if (flag.missing !== "off") {
      add(bag, "not_monday");
    }

    if (flag.onboard !== "off") {
      const claimed = await sql<{
        id: string;
        name: string;
        claimed_at: string | null;
        province: string | null;
        email: string | null;
        locale: string | null;
        time_zone: string | null;
        timezone: string | null;
      }>`
        select d.id, d.name, d.claimed_at::text as claimed_at, d.province, d.timezone,
               coalesce(nullif(trim(owner.email), ''), nullif(trim(d.contact_email), '')) as email,
               owner.locale, owner.time_zone
        from daycares d
        left join lateral (
          select u.email, p.locale, p.time_zone
          from provider_daycares pd
          join "user" u on u.id = pd.user_id
          left join profiles p on p.user_id = u.id
          where pd.daycare_id = d.id
          order by u."createdAt" asc
          limit 1
        ) owner on true
        where d.claimed_at is not null
          and d.claimed_at > now() - interval '10 days'
          and coalesce(d.is_test, 0) = 0
        limit 200
      `.catch(() => []);
      for (const row of claimed) {
        const zone = automationZone(row.time_zone || row.timezone, row.province);
        const step = onboardingStep(row.claimed_at, dayKeyInTimeZone(now, zone));
        if (!step) {
          add(bag, "not_due");
          continue;
        }
        await sendOne({
          automation: "daycare_onboarding",
          dedupeKey: `onboard:${row.id}:${step}`,
          recipient: row.email,
          letter: onboardingLetter({
            locale: centreLocale(row.province, row.locale),
            centreName: row.name,
            step,
          }),
          mode: flag.onboard,
          quiet: automationQuietNow(now, zone, row.province),
          bag,
        });
      }
    }

    if (flag.claim !== "off") {
      const cap = parseDailyCap(process.env.CLAIM_REMINDER_DAILY_CAP);
      const sentTodayRows = await sql<{ n: number }>`
        select count(*)::int as n
        from automation_sends
        where automation = 'claim_listing'
          and channel = 'email'
          and status in ('sent', 'dry_run')
          and created_at > now() - interval '1 day'
      `.catch(() => [] as { n: number }[]);
      let sentToday = Number(sentTodayRows[0]?.n) || 0;
      const centres = await sql<{
        id: string;
        name: string;
        contact_email: string | null;
        province: string | null;
        timezone: string | null;
        claimed_at: string | null;
      }>`
        select id, name, contact_email, province, timezone, claimed_at::text as claimed_at
        from daycares
        where claimed_at is null
          and coalesce(is_test, 0) = 0
          and coalesce(is_demo, 0) = 0
          and coalesce(visibility, 'public') = 'public'
          and nullif(trim(contact_email), '') is not null
        order by id
        limit 400
      `.catch(() => []);
      for (const row of centres) {
        const history = await sql<{ n: number; last_ms: string | null }>`
          select count(*) filter (where status = 'sent')::int as n,
                 (extract(epoch from max(created_at) filter (where status = 'sent')) * 1000)::text as last_ms
          from automation_sends
          where automation = 'claim_listing'
            and dedupe_key like ${`claim:${row.id}:%`}
        `.catch(() => [] as { n: number; last_ms: string | null }[]);
        const plan = claimReminderPlan({
          daycareId: row.id,
          claimed: Boolean(row.claimed_at),
          email: row.contact_email,
          suppressed: false,
          sentCount: Number(history[0]?.n) || 0,
          sentToday,
          dailyCap: cap,
          nowMs: now.getTime(),
          lastSentMs: history[0]?.last_ms ? Number(history[0].last_ms) : null,
        });
        if (!plan.send) {
          add(bag, plan.reason);
          continue;
        }
        const result = await sendOne({
          automation: "claim_listing",
          dedupeKey: plan.dedupeKey,
          recipient: row.contact_email,
          letter: claimListingLetter({
            locale: centreLocale(row.province, null),
            centreName: row.name,
            daycareId: row.id,
          }),
          mode: flag.claim,
          quiet: automationQuietNow(now, row.timezone, row.province),
          bag,
        });
        if (result === "sent" || result === "dry_run") sentToday += 1;
      }
    }

    return { ok: true, skipped: false, weekly, today, ...bag };
  });
}

export async function runStaleOpenSpotsJob(options: { dryRun?: boolean; now?: Date; force?: boolean } = {}) {
  return runTracked("stale-open-spots", async () => {
    const now = options.now ?? new Date();
    const mode = flagModes(Boolean(options.dryRun)).stale;
    if (mode === "off") return { ok: true, skipped: true, reason: "flag_off" };
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      name: string;
      province: string | null;
      timezone: string | null;
      spots_infant: number | null;
      spots_toddler: number | null;
      spots_preschool: number | null;
      updated_at: string | null;
      hidden_at: string | null;
      email: string | null;
      locale: string | null;
      time_zone: string | null;
    }>`
      select d.id, d.name, d.province, d.timezone,
             d.spots_infant, d.spots_toddler, d.spots_preschool,
             coalesce(d.last_vacancy_updated_at, d.spots_updated_at)::text as updated_at,
             d.open_spots_hidden_at::text as hidden_at,
             coalesce(nullif(trim(owner.email), ''), nullif(trim(d.contact_email), '')) as email,
             owner.locale, owner.time_zone
      from daycares d
      left join lateral (
        select u.email, p.locale, p.time_zone
        from provider_daycares pd
        join "user" u on u.id = pd.user_id
        left join profiles p on p.user_id = u.id
        where pd.daycare_id = d.id
        order by u."createdAt" asc
        limit 1
      ) owner on true
      where d.claimed_at is not null
        and coalesce(d.is_test, 0) = 0
        and coalesce(d.spots_infant, 0) + coalesce(d.spots_toddler, 0) + coalesce(d.spots_preschool, 0) > 0
      limit 400
    `.catch(() => []);
    const bag: Count = {};
    for (const row of rows) {
      const spots =
        (Number(row.spots_infant) || 0) + (Number(row.spots_toddler) || 0) + (Number(row.spots_preschool) || 0);
      const action = staleSpotAction({
        spots,
        updatedAt: row.updated_at,
        hiddenAt: row.hidden_at,
        nowMs: now.getTime(),
      });
      if (action === "none") continue;
      if (action === "remind") {
        const stamp = (row.updated_at || "").slice(0, 10) || "none";
        const locale = centreLocale(row.province, row.locale);
        await sendOne({
          automation: "stale_spot_reminder",
          dedupeKey: `stale-remind:${row.id}:${stamp}`,
          recipient: row.email,
          letter: staleSpotLetter({ locale, centreName: row.name }),
          mode,
          quiet: automationQuietNow(now, row.time_zone || row.timezone, row.province),
          bag,
        });
        continue;
      }
      if (mode === "dry_run") {
        console.info("[kidease-automation] dry-run hide-open-spots", row.id);
        add(bag, "dry_run_hide");
        continue;
      }
      await sql`
        update daycares
        set open_spots_hidden_at = now()
        where id = ${row.id}
          and open_spots_hidden_at is null
      `.catch(() => undefined);
      add(bag, "hidden");
    }
    return { ok: true, skipped: false, scanned: rows.length, ...bag };
  });
}

export async function runTourFollowupsJob(options: { dryRun?: boolean; now?: Date; force?: boolean } = {}) {
  return runTracked("tour-followups", async () => {
    const now = options.now ?? new Date();
    const flag = flagModes(Boolean(options.dryRun));
    if (flag.tour === "off" && flag.review === "off") {
      return { ok: true, skipped: true, reason: "flag_off" };
    }
    const sql = await getSql();
    const bag: Count = {};
    if (flag.tour !== "off") {
      const tours = await sql<{
        id: string;
        email: string | null;
        locale: string | null;
        time_zone: string | null;
        province: string | null;
        centre: string;
        slug: string;
        tour_at: string | null;
      }>`
        select t.id,
               coalesce(nullif(trim(t.contact_email), ''), u.email) as email,
               p.locale, p.time_zone, d.province, d.name as centre, d.slug,
               coalesce(w.start_at, t.responded_at)::text as tour_at
        from tour_requests t
        join daycares d on d.id = t.daycare_id
        left join tour_windows w on w.id = t.window_id
        left join "user" u on u.id = t.user_id
        left join profiles p on p.user_id = t.user_id
        where t.status in ('accepted', 'completed')
          and coalesce(w.start_at, t.responded_at) is not null
        order by coalesce(w.start_at, t.responded_at)
        limit 200
      `.catch(() => []);
      for (const row of tours) {
        if (!tourFollowupDue(row.tour_at, now.getTime())) continue;
        const locale = centreLocale(row.province, row.locale);
        await sendOne({
          automation: "tour_followup",
          dedupeKey: `tour-follow:${row.id}`,
          recipient: row.email,
          letter: tourFollowupLetter({ locale, centreName: row.centre, slug: row.slug }),
          mode: flag.tour,
          quiet: automationQuietNow(now, row.time_zone, row.province),
          bag,
        });
      }
    }
    if (flag.review !== "off") {
      const enrolled = await sql<{
        id: string;
        email: string | null;
        locale: string | null;
        time_zone: string | null;
        province: string | null;
        centre: string;
        slug: string;
        enrolled_at: string | null;
      }>`
        select t.id,
               coalesce(nullif(trim(t.contact_email), ''), u.email) as email,
               p.locale, p.time_zone, d.province, d.name as centre, d.slug,
               t.responded_at::text as enrolled_at
        from tour_requests t
        join daycares d on d.id = t.daycare_id
        left join "user" u on u.id = t.user_id
        left join profiles p on p.user_id = t.user_id
        where t.status = 'enrolled'
          and t.responded_at is not null
        order by t.responded_at
        limit 200
      `.catch(() => []);
      for (const row of enrolled) {
        if (!reviewRequestDue(row.enrolled_at, now.getTime())) continue;
        const locale = centreLocale(row.province, row.locale);
        await sendOne({
          automation: "enrolment_review",
          dedupeKey: `review:${row.id}`,
          recipient: row.email,
          letter: reviewRequestLetter({ locale, centreName: row.centre, slug: row.slug }),
          mode: flag.review,
          quiet: automationQuietNow(now, row.time_zone, row.province),
          bag,
        });
      }
    }
    return { ok: true, skipped: false, ...bag };
  });
}
