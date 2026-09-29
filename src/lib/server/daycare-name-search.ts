import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { correctCentreNameTypos } from "@/lib/listing-slug";
import { PUBLIC_LISTING_SQL } from "@/lib/listing-visibility";

export type DaycareNameHit = {
  slug: string;
  name: string;
  city: string;
  province: string;
};

/** Dropdown cap. A shorter query still ranks exact and prefix names first. */
export const DAYCARE_NAME_MATCH_LIMIT = 40;

function likePiece(value: string) {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export const matchDaycareNames = createServerFn({ method: "GET" })
  .validator((raw: string) => {
    const q = String(raw || "").trim().slice(0, 80);
    if (q.length < 2) return "";
    return q;
  })
  .handler(async ({ data: q }): Promise<DaycareNameHit[]> => {
    if (!q) return [];
    const sql = await getSql();
    const contains = `%${likePiece(q)}%`;
    const prefix = `${likePiece(q)}%`;
    const rows = await sql.query<{
      slug: string;
      name: string;
      city: string | null;
      province: string | null;
    }>(
      `select slug, name, city, province
       from daycares
       where ${PUBLIC_LISTING_SQL}
         and (
           name ilike $1 escape '\\'
           or coalesce(name_fr, '') ilike $1 escape '\\'
         )
       order by
         case
           when lower(name) = lower($2) then 0
           when name ilike $3 escape '\\' then 1
           else 2
         end,
         name
       limit ${DAYCARE_NAME_MATCH_LIMIT}`,
      [contains, q, prefix],
    );
    return rows
      .filter((row) => row.slug && row.name)
      .map((row) => ({
        slug: row.slug,
        name: correctCentreNameTypos(row.name),
        city: row.city?.trim() || "",
        province: row.province?.trim() || "",
      }));
  });
