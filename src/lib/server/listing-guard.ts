import { getSql } from "@/lib/db";
import { getCatalog } from "@/lib/catalog";
import {
  DAYCARE_ALREADY_LISTED,
  findDuplicateListing,
  sameDaycareListing,
  type ListingIdentityInput,
} from "@/lib/listing-identity";

export type CentrePlace = ListingIdentityInput;

export async function assertNewListingAllowed(input: ListingIdentityInput & { userId: string }) {
  const name = input.name.trim();
  const address = (input.address || "").trim();
  const city = input.city.trim();
  if (!name || !address || !city) {
    throw new Error("Centre name, address, and city are required.");
  }

  const incoming: ListingIdentityInput = {
    name,
    address,
    city,
    province: input.province,
    postalCode: input.postalCode,
    licenseNumber: input.licenseNumber,
  };

  const sql = await getSql();
  const rows = await sql<{
    id: string;
    name: string;
    address: string;
    city: string;
    province: string | null;
    postal_code: string | null;
    license_number: string | null;
    user_id: string | null;
  }>`
    select d.id, d.name, d.address, d.city, d.province, d.postal_code, d.license_number, p.user_id
    from daycares d
    left join provider_daycares p on p.daycare_id = d.id
  `.catch(async () => {
    return sql<{
      id: string;
      name: string;
      address: string;
      city: string;
      province: string | null;
      postal_code: string | null;
      license_number: string | null;
      user_id: string | null;
    }>`
      select d.id, d.name, d.address, d.city, null::text as province, null::text as postal_code,
             null::text as license_number, p.user_id
      from daycares d
      left join provider_daycares p on p.daycare_id = d.id
    `.catch(() => []);
  });

  const neonHit = findDuplicateListing(
    incoming,
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      address: row.address,
      city: row.city,
      province: row.province,
      postalCode: row.postal_code,
      licenseNumber: row.license_number,
      userId: row.user_id,
    })),
    input.userId,
  );
  if (neonHit) throw new Error(DAYCARE_ALREADY_LISTED);

  const catalog = await getCatalog().catch(() => []);
  for (const listed of catalog) {
    if (
      !sameDaycareListing(incoming, {
        name: listed.name,
        address: listed.address,
        city: listed.city,
        province: listed.province,
        postalCode: listed.postalCode,
        licenseNumber: listed.licenseNumber,
      })
    ) {
      continue;
    }
    throw new Error(DAYCARE_ALREADY_LISTED);
  }
}
