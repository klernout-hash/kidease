import { createFileRoute } from "@tanstack/react-router";
import { e2eLoopbackFixtureRequest } from "@/lib/server/e2e-fixture.server";

/**
 * Loopback preview only. Creates a real parent or provider session that owns
 * a centre when asked. Production hosts and any process without
 * E2E_ROLE_FIXTURE=1 get 404. The role cookie is a separate path and is
 * ignored in production builds.
 */
const PASSWORD = "E2e-role-fixture-pass-1";

function emailFor(role: "parent" | "provider" | "admin" | "government", paid: boolean) {
  if (role === "admin") return "kyle@kidease.ca";
  if (role === "government") return "e2e-government@kidease.test";
  const side = role === "provider" ? "provider" : "parent";
  return paid ? `e2e-${side}-paid@kidease.test` : `e2e-${side}@kidease.test`;
}

async function seed(request: Request) {
  if (!e2eLoopbackFixtureRequest(request)) return new Response("Not found", { status: 404 });
  let body: { role?: string; paid?: boolean; ownSlug?: string; activity?: boolean; attention?: boolean; unlockHome?: boolean; paidBills?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const role =
    body.role === "provider" ? "provider" : body.role === "admin" ? "admin" : body.role === "government" ? "government" : "parent";
  const paid = Boolean(body.paid);
  const paidBills = Boolean(body.paidBills);
  const activity = Boolean(body.activity);
  const attention = Boolean(body.attention);
  const unlockHome = Boolean(body.unlockHome);
  const ownSlug = String(body.ownSlug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);
  const email = emailFor(role, paid);
  const { auth } = await import("@/lib/auth/server");
  const headers = request.headers;
  let response = await auth.api.signUpEmail({
    body: {
      email,
      password: PASSWORD,
      name: role === "provider" ? "E2E Daycare" : role === "admin" ? "Kyle" : role === "government" ? "E2E Government" : "E2E Parent",
    },
    headers,
    asResponse: true,
  });
  if (!response.ok) {
    response = await auth.api.signInEmail({
      body: { email, password: PASSWORD },
      headers,
      asResponse: true,
    });
  }
  const { getSql } = await import("@/lib/db");
  const { flushSearchMemo } = await import("@/lib/server/search-memo");
  const sql = await getSql();
  const users = await sql<{ id: string }>`select id from "user" where lower(email) = lower(${email}) limit 1`;
  const userId = users[0]?.id;
  if (!userId) {
    return Response.json({ ok: false, error: "seed-user-missing" }, { status: 500 });
  }
  await sql`
    insert into profiles (user_id, role) values (${userId}, ${role === "admin" ? "admin" : role})
    on conflict (user_id) do update set role = ${role === "admin" ? "admin" : role}
  `;
  if (role === "government") {
    await sql`
      insert into government_orgs (id, name, province, demo)
      values ('e2e-gov-mb', 'E2E Province', 'MB', 0)
      on conflict (id) do nothing
    `;
    await sql`
      insert into government_members (user_id, org_id, status, read_only)
      values (${userId}, 'e2e-gov-mb', 'active', 1)
      on conflict (user_id) do update set status = 'active', org_id = 'e2e-gov-mb', revoked_at = null
    `;
  }
  if (role === "admin") {
    await sql`update "user" set "emailVerified" = true where id = ${userId}`.catch(() => undefined);
    await sql`
      update view_as_sessions
      set ended_at = now(), end_reason = 'e2e-clear'
      where admin_user_id = ${userId} and ended_at is null
    `.catch(() => undefined);
  }
  if (role === "parent" && paid) {
    await sql`
      update profiles
      set plus_status = 'active',
          plus_plan = 'plus',
          plus_interval = 'month',
          plus_subscription_id = 'sub_e2e_parent',
          plus_current_period_end = now() + interval '30 days'
      where user_id = ${userId}
    `;
  }
  if (role === "provider" && paid) {
    await sql`
      update profiles
      set stripe_subscription_status = 'active',
          selected_plan = 'pro',
          selected_interval = 'month',
          stripe_subscription_id = 'sub_e2e_provider',
          stripe_current_period_end = now() + interval '30 days'
      where user_id = ${userId}
    `;
  }
  if (role === "provider") {
    const slug = ownSlug || "e2e-centre";
    const daycareId = `e2e-${slug}`.slice(0, 40);
    await sql`
      insert into daycares (
        id, slug, name, name_fr, tagline, tagline_fr, description, description_fr,
        address, city, province, postal_code, lat, lng, hours, hours_fr,
        age_min_months, age_max_months, photos
      ) values (
        ${daycareId}, ${slug}, ${"E2E Centre"}, ${"Centre E2E"},
        ${"Licensed centre"}, ${"Centre permis"},
        ${"Seeded for the preview smoke."}, ${"Créé pour l’essai."},
        ${"1 Main St"}, ${"Winnipeg"}, ${"MB"}, ${"R3C 0A1"},
        ${49.8951}, ${-97.1384},
        ${"7:30 a.m. – 5:30 p.m."}, ${"7 h 30 – 17 h 30"},
        ${6}, ${72}, ${""}
      )
      on conflict (slug) do update set name = excluded.name
    `.catch(async () => {
      await sql`
        insert into daycares (
          id, slug, name, name_fr, tagline, tagline_fr, description, description_fr,
          address, city, province, postal_code, lat, lng, hours, hours_fr,
          age_min_months, age_max_months, photos
        ) values (
          ${daycareId}, ${slug}, ${"E2E Centre"}, ${"Centre E2E"},
          ${"Licensed centre"}, ${"Centre permis"},
          ${"Seeded for the preview smoke."}, ${"Créé pour l’essai."},
          ${"1 Main St"}, ${"Winnipeg"}, ${"MB"}, ${"R3C 0A1"},
          ${49.8951}, ${-97.1384},
          ${"7:30 a.m. – 5:30 p.m."}, ${"7 h 30 – 17 h 30"},
          ${6}, ${72}, ${""}
        )
        on conflict (id) do nothing
      `;
    });
    const rows = await sql<{ id: string }>`select id from daycares where slug = ${slug} limit 1`;
    const id = rows[0]?.id;
    if (id) {
      await sql`delete from provider_daycares where user_id = ${userId}`;
      await sql`insert into provider_daycares (user_id, daycare_id) values (${userId}, ${id}) on conflict do nothing`;
      if (activity) {
        await sql`
          update daycares
          set claimed_at = coalesce(claimed_at, now()),
              claim_status = 'approved',
              license_number = 'MB-100200',
              license_status = 'matched',
              registry_match_state = 'matched',
              license_verification_source = 'admin',
              listing_active = 1,
              visibility = 'public',
              is_test = 0,
              city = 'Winnipeg',
              province = 'MB'
          where id = ${id}
        `;
        flushSearchMemo();
      }
    }
  }
  if (role === "parent" && unlockHome) {
    const homeId = "bc-423";
    const homeSlug = "buddies-on-7th-423";
    await sql`
      insert into daycares (
        id, slug, name, name_fr, tagline, tagline_fr, description, description_fr,
        address, city, province, postal_code, lat, lng, hours, hours_fr,
        age_min_months, age_max_months, photos, amenities, facility_type
      ) values (
        ${homeId}, ${homeSlug}, ${"Buddies On 7Th"}, ${"Buddies On 7Th"},
        ${"Licensed family child care"}, ${"Milieu familial permis"},
        ${"Family child care in Kimberley."}, ${"Milieu familial à Kimberley."},
        ${"469 7Th Ave"}, ${"Kimberley"}, ${"BC"}, ${"V1A 2W9"},
        ${49.694222}, ${-115.986222},
        ${"7:30 a.m. to 5:30 p.m."}, ${"7 h 30 a 17 h 30"},
        ${0}, ${60}, ${""}, ${"licensed,home"}, ${"family_home"}
      )
      on conflict (id) do nothing
    `.catch(() => undefined);
    await sql`
      insert into conversations (id, user_id, daycare_id, last_at)
      values (${"e2e-home-convo"}, ${userId}, ${homeId}, now())
      on conflict (user_id, daycare_id) do nothing
    `.catch(() => undefined);
    const convos = await sql<{ id: string }>`
      select id from conversations where user_id = ${userId} and daycare_id = ${homeId} limit 1
    `.catch(() => [] as { id: string }[]);
    const convoId = convos[0]?.id;
    if (convoId) {
      await sql`
        insert into tour_requests (id, conversation_id, user_id, daycare_id, preferred_times, status, window_id)
        values (${"e2e-home-tour"}, ${convoId}, ${userId}, ${homeId}, ${"Tue 10:00"}, ${"accepted"}, ${"e2e-home-slot"})
        on conflict (id) do update set status = 'accepted', user_id = excluded.user_id
      `.catch(async () => {
        await sql`
          insert into tour_requests (id, conversation_id, user_id, daycare_id, preferred_times, status)
          values (${"e2e-home-tour"}, ${convoId}, ${userId}, ${homeId}, ${"Tue 10:00"}, ${"accepted"})
          on conflict (id) do update set status = 'accepted', user_id = excluded.user_id
        `.catch(() => undefined);
      });
    }
  }
  if (role === "parent" && activity) {
    const slug = "e2e-centre";
    const daycareId = "e2e-e2e-centre".slice(0, 40);
    await sql`
      insert into daycares (
        id, slug, name, name_fr, tagline, tagline_fr, description, description_fr,
        address, city, province, postal_code, lat, lng, hours, hours_fr,
        age_min_months, age_max_months, photos
      ) values (
        ${daycareId}, ${slug}, ${"E2E Centre"}, ${"Centre E2E"},
        ${"Licensed centre"}, ${"Centre permis"},
        ${"Seeded for the preview smoke."}, ${"Créé pour l’essai."},
        ${"1 Main St"}, ${"Winnipeg"}, ${"MB"}, ${"R3C 0A1"},
        ${49.8951}, ${-97.1384},
        ${"7:30 a.m. – 5:30 p.m."}, ${"7 h 30 – 17 h 30"},
        ${6}, ${72}, ${""}
      )
      on conflict (slug) do nothing
    `.catch(() => undefined);
    const rows = await sql<{ id: string }>`select id from daycares where slug = ${slug} limit 1`;
    const id = rows[0]?.id;
    if (id) {
      await sql`
        insert into bookings (
          id, user_id, daycare_id, start_month, schedule, age_group, status, monthly_amount
        ) values (
          ${"e2e-parent-request"}, ${userId}, ${id}, ${"2026-10"}, ${"full"}, ${"toddler"}, ${"pending"}, ${0}
        )
        on conflict (id) do update set user_id = excluded.user_id, daycare_id = excluded.daycare_id
      `;
    }
  }
  if (attention && role === "parent") {
    const slug = "e2e-attn-centre";
    const seededId = "e2e-attn-centre";
    await sql`
      insert into daycares (
        id, slug, name, name_fr, tagline, tagline_fr, description, description_fr,
        address, city, province, postal_code, lat, lng, hours, hours_fr,
        age_min_months, age_max_months, photos
      ) values (
        ${seededId}, ${slug}, ${"E2E Attention Centre"}, ${"Centre attention E2E"},
        ${"Licensed centre"}, ${"Centre permis"},
        ${"Seeded so attention badges have a request."}, ${"Créé pour les pastilles."},
        ${"1 Main St"}, ${"Winnipeg"}, ${"MB"}, ${"R3C 0A1"},
        ${49.8951}, ${-97.1384},
        ${"7:30 a.m. to 5:30 p.m."}, ${"7 h 30 a 17 h 30"},
        ${6}, ${72}, ${""}
      )
      on conflict (slug) do nothing
    `.catch(() => undefined);
    const rows = await sql<{ id: string }>`select id from daycares where slug = ${slug} limit 1`.catch(() => []);
    const daycareId = rows[0]?.id;
    if (daycareId) {
      await sql`
        insert into lead_requests (id, kind, status, user_id, daycare_id, message)
        values (${`e2e-attn-${userId}`.slice(0, 40)}, ${"tour"}, ${"requested"}, ${userId}, ${daycareId}, ${"E2E attention"})
        on conflict (id) do update set status = 'requested', user_id = excluded.user_id
      `.catch(() => undefined);
    }
  }
  await sql`
    update profiles set upgrade_card_dismissed_at = null where user_id = ${userId}
  `;
  if (activity) {
    await seedKidsWorldLive(sql);
    flushSearchMemo();
  }
  if (paidBills && (role === "parent" || role === "provider")) {
    await seedTaxReceiptFixtures(sql, userId, role);
  }
  if (role !== "admin") return response;
  const { signTwoFactorCookie, TWO_FACTOR_SESSION_TTL_MS } = await import("@/lib/two-factor-cookie");
  const { TWO_FACTOR_COOKIE } = await import("@/lib/auth/cookies");
  const exp = Date.now() + TWO_FACTOR_SESSION_TTL_MS;
  const secret = (process.env.BETTER_AUTH_SECRET || process.env.ADMIN_EMAIL || "kidease-preview").trim();
  const token = signTwoFactorCookie(userId, exp, secret);
  const cookieHeaders = new Headers(response.headers);
  cookieHeaders.append(
    "set-cookie",
    `${TWO_FACTOR_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(TWO_FACTOR_SESSION_TTL_MS / 1000)}`,
  );
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: cookieHeaders });
}

/**
 * Loopback only, and only when the seed body asks for paidBills.
 * Two stored paid invoices (Ontario and Quebec) plus one unpaid bill that must stay off the receipt.
 */
async function seedTaxReceiptFixtures(
  sql: Awaited<ReturnType<typeof import("@/lib/db").getSql>>,
  userId: string,
  role: "parent" | "provider",
) {
  const centres = [
    {
      id: "e2e-tax-on",
      slug: "e2e-tax-on",
      name: "E2E Harbour",
      city: "Toronto",
      province: "ON",
      postal: "M5X 1A9",
      address: "100 King St",
      licence: "E2E-ON-100",
    },
    {
      id: "e2e-tax-qc",
      slug: "e2e-tax-qc",
      name: "E2E Garderie",
      city: "Montreal",
      province: "QC",
      postal: "H3C 0G7",
      address: "200 Rue Peel",
      licence: "E2E-QC-100",
    },
  ];
  for (const centre of centres) {
    await sql`
      insert into daycares (
        id, slug, name, name_fr, tagline, tagline_fr, description, description_fr,
        address, city, province, postal_code, lat, lng, hours, hours_fr,
        age_min_months, age_max_months, photos, license_number
      ) values (
        ${centre.id}, ${centre.slug}, ${centre.name}, ${centre.name},
        ${"Licensed centre"}, ${"Centre permis"},
        ${"Seeded so a tax receipt can use a paid bill."}, ${"Créé pour un reçu à partir d'une facture payée."},
        ${centre.address}, ${centre.city}, ${centre.province}, ${centre.postal},
        ${45.42}, ${-75.7},
        ${"7:30 a.m. to 5:30 p.m."}, ${"7 h 30 a 17 h 30"},
        ${6}, ${72}, ${""}, ${centre.licence}
      )
      on conflict (id) do update set
        province = excluded.province,
        city = excluded.city,
        address = excluded.address,
        postal_code = excluded.postal_code,
        license_number = excluded.license_number
    `;
    await sql`
      update daycares
      set is_test = 1, visibility = 'admin_only', listing_active = 0
      where id = ${centre.id}
    `.catch(() => undefined);
    if (role === "provider") {
      await sql`
        insert into provider_daycares (user_id, daycare_id)
        values (${userId}, ${centre.id})
        on conflict do nothing
      `;
    }
  }
  if (role !== "parent") return;
  await sql`
    insert into children (id, user_id, name, birthdate)
    values (${"e2e-tax-child"}, ${userId}, ${"Amina Parent"}, ${"2022-05-04"})
    on conflict (id) do update set user_id = excluded.user_id, name = excluded.name, birthdate = excluded.birthdate
  `;
  await sql`
    insert into bookings (
      id, user_id, daycare_id, child_id, start_month, schedule, age_group, status, monthly_amount
    ) values (
      ${"e2e-tax-booking"}, ${userId}, ${"e2e-tax-on"}, ${"e2e-tax-child"},
      ${"2026-01"}, ${"full"}, ${"toddler"}, ${"active"}, ${0}
    )
    on conflict (id) do update set
      user_id = excluded.user_id,
      daycare_id = excluded.daycare_id,
      child_id = excluded.child_id,
      status = 'active'
  `;
  const bills = [
    { id: "e2e-tax-inv-on", number: "E2E-2026-ON", daycareId: "e2e-tax-on", period: "2026-03", paidAt: "2026-03-15T15:00:00.000Z", cents: 120000, dollars: 1200, status: "paid" },
    { id: "e2e-tax-inv-qc", number: "E2E-2026-QC", daycareId: "e2e-tax-qc", period: "2026-04", paidAt: "2026-04-02T15:00:00.000Z", cents: 80000, dollars: 800, status: "paid" },
    { id: "e2e-tax-inv-open", number: "E2E-2026-OPEN", daycareId: "e2e-tax-on", period: "2026-05", paidAt: null, cents: 99900, dollars: 999, status: "sent" },
  ];
  for (const bill of bills) {
    await sql`
      insert into invoices (
        id, number, booking_id, parent_user_id, daycare_id, child_id, period, status,
        currency, subtotal, platform_fee, total, amount_cents, paid_at
      ) values (
        ${bill.id}, ${bill.number}, ${"e2e-tax-booking"}, ${userId}, ${bill.daycareId}, ${"e2e-tax-child"},
        ${bill.period}, ${bill.status}, ${"cad"}, ${bill.dollars}, ${0}, ${bill.dollars}, ${bill.cents}, ${bill.paidAt}
      )
      on conflict (id) do update set
        status = excluded.status,
        amount_cents = excluded.amount_cents,
        total = excluded.total,
        paid_at = excluded.paid_at,
        parent_user_id = excluded.parent_user_id
    `;
  }
  for (const day of ["2026-04-02", "2026-04-03", "2026-04-04"]) {
    await sql`
      insert into attendance (id, daycare_id, child_name, parent_user_id, day, status)
      values (${`e2e-tax-day-${day}`}, ${"e2e-tax-qc"}, ${"Amina Parent"}, ${userId}, ${day}, ${"arrived"})
      on conflict (id) do nothing
    `.catch(() => undefined);
  }
  await sql`
    insert into lead_requests (id, kind, status, user_id, daycare_id, message, conversation_id)
    values (${"e2e-tax-lead"}, ${"waitlist"}, ${"requested"}, ${userId}, ${"e2e-tax-on"}, ${"We need a spot in March."}, ${null})
    on conflict (id) do update set status = 'requested', conversation_id = null, user_id = excluded.user_id
  `.catch(() => undefined);
}

/**
 * Preview stand-in for the production Edmonton listing. Facts are the published
 * street, hours, and parent fee from migration 0068. No invented postal, spots, or rating.
 */
async function seedKidsWorldLive(sql: Awaited<ReturnType<typeof import("@/lib/db").getSql>>) {
  const id = "kids-world-daycare-kh2t";
  await sql`
    insert into daycares (
      id, slug, name, name_fr, tagline, tagline_fr, description, description_fr,
      address, city, province, postal_code, lat, lng, hours, hours_fr,
      age_min_months, age_max_months, photos, website,
      infant_monthly, toddler_monthly, preschool_monthly,
      rating_x10, review_count
    ) values (
      ${id}, ${id}, ${"Kids World Daycare"}, ${"Kids World Daycare"},
      ${""}, ${""}, ${""}, ${""},
      ${"11012 105 Avenue NW"}, ${"Edmonton"}, ${"AB"}, ${""},
      ${53.5483389}, ${-113.5107201},
      ${"7:00 a.m. – 5:30 p.m., Monday to Friday"},
      ${"7:00 a.m. – 5:30 p.m., Monday to Friday"},
      ${12}, ${60}, ${""}, ${"https://kidsworlddaycare.ca/"},
      ${326.25}, ${326.25}, ${326.25},
      ${0}, ${0}
    )
    on conflict (slug) do update set
      name = excluded.name,
      address = excluded.address,
      city = excluded.city,
      province = excluded.province,
      lat = excluded.lat,
      lng = excluded.lng,
      hours = excluded.hours,
      hours_fr = excluded.hours_fr,
      age_min_months = excluded.age_min_months,
      age_max_months = excluded.age_max_months,
      website = excluded.website,
      infant_monthly = excluded.infant_monthly,
      toddler_monthly = excluded.toddler_monthly,
      preschool_monthly = excluded.preschool_monthly,
      rating_x10 = excluded.rating_x10,
      review_count = excluded.review_count
  `;
  await sql`
    update daycares
    set claimed_at = coalesce(claimed_at, now()),
        claim_status = 'approved',
        license_number = '70051797',
        license_status = 'matched',
        registry_match_state = 'matched',
        license_verification_source = 'admin',
        listing_active = 1,
        visibility = 'public',
        is_test = 0,
        city = 'Edmonton',
        province = 'AB'
    where slug = ${id}
  `;
}

export const Route = createFileRoute("/api/e2e-seed")({
  server: {
    handlers: {
      GET: () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex, nofollow" } }),
      POST: ({ request }) => seed(request),
    },
  },
});
