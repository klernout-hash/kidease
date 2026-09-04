import { getSql } from "@/lib/db";
import { getCatalog } from "@/lib/catalog";
import { sameCentreLocation } from "@/lib/listing-match";

export type CentrePlace = { name: string; address: string; city: string };

export async function assertNewListingAllowed(input: CentrePlace & { userId: string }) {
  const name = input.name.trim();
  const address = input.address.trim();
  const city = input.city.trim();
  if (!name || !address || !city) {
    throw new Error("Centre name, address, and city are required.");
  }

  const place = { name, address, city };
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    name: string;
    address: string;
    city: string;
    user_id: string | null;
  }>`
    select d.id, d.name, d.address, d.city, p.user_id
    from daycares d
    left join provider_daycares p on p.daycare_id = d.id
  `.catch(() => []);

  for (const row of rows) {
    if (!sameCentreLocation(place, row)) continue;
    if (row.user_id === input.userId) {
      throw new Error("You already manage this location on this account.");
    }
    if (row.user_id) {
      throw new Error("This location is already registered to another account.");
    }
    throw new Error("This centre is already in KidEase. Use Claim a centre to attach it.");
  }

  for (const listed of await getCatalog()) {
    if (!sameCentreLocation(place, listed)) continue;
    throw new Error("This centre is already in KidEase. Use Claim a centre to attach it to this email.");
  }
}
