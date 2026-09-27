import { createFileRoute } from "@tanstack/react-router";
import { e2eLoopbackFixtureRequest } from "@/lib/server/e2e-fixture.server";

/**
 * Loopback preview only. Creates a real parent or provider session that owns
 * a centre when asked. Production hosts and any process without
 * E2E_ROLE_FIXTURE=1 get 404. The role cookie is a separate path and is
 * ignored in production builds.
 */
const PASSWORD = "E2e-role-fixture-pass-1";

function emailFor(role: "parent" | "provider", paid: boolean) {
  const side = role === "provider" ? "provider" : "parent";
  return paid ? `e2e-${side}-paid@kidease.test` : `e2e-${side}@kidease.test`;
}

async function seed(request: Request) {
  if (!e2eLoopbackFixtureRequest(request)) return new Response("Not found", { status: 404 });
  let body: { role?: string; paid?: boolean; ownSlug?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const role = body.role === "provider" ? "provider" : "parent";
  const paid = Boolean(body.paid);
  const ownSlug = String(body.ownSlug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);
  const email = emailFor(role, paid);
  const { auth } = await import("@/lib/auth/server");
  const headers = request.headers;
  let response = await auth.api.signUpEmail({
    body: { email, password: PASSWORD, name: role === "provider" ? "E2E Daycare" : "E2E Parent" },
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
  const sql = await getSql();
  const users = await sql<{ id: string }>`select id from "user" where lower(email) = lower(${email}) limit 1`;
  const userId = users[0]?.id;
  if (!userId) {
    return Response.json({ ok: false, error: "seed-user-missing" }, { status: 500 });
  }
  await sql`
    insert into profiles (user_id, role) values (${userId}, ${role})
    on conflict (user_id) do update set role = ${role}
  `;
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
    }
  }
  return response;
}

export const Route = createFileRoute("/api/e2e-seed")({
  server: {
    handlers: {
      POST: ({ request }) => seed(request),
    },
  },
});
