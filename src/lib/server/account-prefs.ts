import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { isShippedLocale, type ShippedLocale } from "@/lib/languages";
import { parseThemePreference, type ThemePreference } from "@/lib/theme";

export const getMyTheme = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ThemePreference> => {
    try {
      const sql = await getSql();
      const rows = await sql<{ theme: string | null }>`
        select theme from profiles where user_id = ${context.userId} limit 1
      `;
      return parseThemePreference(rows[0]?.theme);
    } catch {
      return "system";
    }
  });

export const saveMyTheme = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { theme?: string }) => parseThemePreference(input?.theme))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      insert into profiles (user_id, role, theme)
      values (${context.userId}, 'parent', ${data})
      on conflict (user_id) do update set theme = excluded.theme
    `;
    return { theme: data };
  });

export const saveMyLocale = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { locale?: string } | undefined): ShippedLocale => {
    const locale = input?.locale;
    if (!isShippedLocale(locale)) throw new Error("Unsupported language");
    return locale;
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      insert into profiles (user_id, role, locale, locale_chosen)
      values (${context.userId}, 'parent', ${data}, true)
      on conflict (user_id) do update set locale = excluded.locale, locale_chosen = true
    `;
    return { locale: data };
  });
