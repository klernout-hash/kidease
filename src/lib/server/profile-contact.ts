import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";

export type ContactProfile = {
  name: string;
  phone: string;
  email: string;
  bio: string;
};

function cleanName(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function cleanPhone(value: unknown) {
  return String(value ?? "").replace(/[^0-9+()\-\.\s]/g, "").trim().slice(0, 32);
}

function cleanBio(value: unknown) {
  return String(value ?? "").trim().slice(0, 400);
}

export const getMyContact = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ContactProfile> => {
    const sql = await getSql();
    await sql`
      insert into profiles (user_id, role) values (${context.userId}, 'parent')
      on conflict (user_id) do nothing
    `;
    const rows = await sql<{ display_name: string | null; phone: string | null; bio: string | null }>`
      select display_name, phone, bio from profiles where user_id = ${context.userId} limit 1
    `;
    const authRows = await sql<{ name: string | null; email: string | null }>`
      select name, email from "user" where id = ${context.userId} limit 1
    `;
    const row = rows[0];
    const auth = authRows[0];
    return {
      name: row?.display_name?.trim() || auth?.name?.trim() || "",
      phone: row?.phone?.trim() || "",
      email: auth?.email?.trim() || "",
      bio: row?.bio?.trim() || "",
    };
  });

export const saveMyContact = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name?: string; phone?: string; bio?: string }) => ({
    name: cleanName(input?.name),
    phone: cleanPhone(input?.phone),
    bio: cleanBio(input?.bio),
  }))
  .handler(async ({ context, data }): Promise<ContactProfile> => {
    const sql = await getSql();
    await sql`
      insert into profiles (user_id, role, display_name, phone, bio)
      values (${context.userId}, 'parent', ${data.name || null}, ${data.phone || null}, ${data.bio || null})
      on conflict (user_id) do update set
        display_name = excluded.display_name,
        phone = excluded.phone,
        bio = excluded.bio
    `;
    if (data.name) {
      await sql`update "user" set name = ${data.name} where id = ${context.userId}`;
    }
    const authRows = await sql<{ name: string | null; email: string | null }>`
      select name, email from "user" where id = ${context.userId} limit 1
    `;
    return {
      name: data.name || authRows[0]?.name?.trim() || "",
      phone: data.phone,
      email: authRows[0]?.email?.trim() || "",
      bio: data.bio,
    };
  });
