import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { monthsBetween } from "@/lib/utils";

export type ParentFitFacts = {
  childAgeMonths: number | null;
  languages: string[];
};

/** Age and home language only. No name, no birthdate, no other child. */
export const loadParentFitFacts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ParentFitFacts> => {
    const sql = await getSql();
    const rows = await sql<{ birthdate: string | null; home_language: string | null }>`
      select birthdate, home_language
      from children
      where user_id = ${context.userId}
      order by created_at
      limit 4
    `.catch(() => [] as Array<{ birthdate: string | null; home_language: string | null }>);
    const languages = new Set<string>();
    let childAgeMonths: number | null = null;
    for (const row of rows) {
      const birth = String(row.birthdate || "").slice(0, 10);
      if (childAgeMonths == null && birth) childAgeMonths = monthsBetween(birth);
      const language = String(row.home_language || "").trim();
      if (language) languages.add(language.slice(0, 24));
    }
    return { childAgeMonths, languages: [...languages].slice(0, 4) };
  });
