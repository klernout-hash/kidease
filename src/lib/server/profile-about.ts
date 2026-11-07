import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { cleanProfileAbout, emptyProfileAbout, type ProfileAbout } from "@/lib/profile-about";

export type AboutProfile = ProfileAbout & {
  /** True only when a real identity check exists. This save never sets it. */
  identityVerified: false;
  centres: string[];
};

function parseAbout(raw: unknown): ProfileAbout {
  if (typeof raw === "string") {
    try {
      return cleanProfileAbout(JSON.parse(raw));
    } catch {
      return emptyProfileAbout();
    }
  }
  return cleanProfileAbout(raw);
}

async function linkedCentres(sql: Awaited<ReturnType<typeof getSql>>, userId: string) {
  try {
    const centres = await sql<{ slug: string }>`
      select d.slug
      from provider_daycares pd
      join daycares d on d.id = pd.daycare_id
      where pd.user_id = ${userId}
      union
      select d.slug
      from centre_members m
      join daycares d on d.id = m.daycare_id
      where m.user_id = ${userId} and m.status = 'active'
    `;
    return centres.map((row) => row.slug).filter(Boolean).slice(0, 12);
  } catch {
    return [];
  }
}

export const getMyAbout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AboutProfile> => {
    const sql = await getSql();
    const rows = await sql<{ about: unknown }>`
      select about from profiles where user_id = ${context.userId} limit 1
    `;
    return {
      ...parseAbout(rows[0]?.about),
      identityVerified: false,
      centres: await linkedCentres(sql, context.userId),
    };
  });

export const saveMyAbout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => cleanProfileAbout(input))
  .handler(async ({ context, data }): Promise<AboutProfile> => {
    const sql = await getSql();
    const payload = JSON.stringify(data);
    await sql`
      insert into profiles (user_id, role, about)
      values (${context.userId}, 'parent', ${payload}::jsonb)
      on conflict (user_id) do update set about = excluded.about
    `;
    const rows = await sql<{ about: unknown }>`
      select about from profiles where user_id = ${context.userId} limit 1
    `;
    return {
      ...parseAbout(rows[0]?.about),
      identityVerified: false,
      centres: await linkedCentres(sql, context.userId),
    };
  });
