import type { Sql } from "./db.ts";
import { applyManagedListingPhotos, listingPhotosChanged, managedListingPhotos, splitPhotoList } from "./listing-photo.ts";
import {
  MAX_LISTING_SPACES,
  PHOTO_DELETE_CONFIRM,
  SPACE_DELETE_CONFIRM,
  groupListingSpaces,
  normalizeSpaceInput,
  photoRemovalNeedsConfirm,
  type ListingSpace,
  type SpaceGroup,
} from "./listing-spaces.ts";
import { prepareListingUploadPhoto } from "./server/polish-listing-photo.ts";

const NOT_YOURS = "Not your listing";

type SpaceRow = {
  id: string;
  name: string;
  space_type: string;
  amenities: string | null;
  accessibility: string | null;
  sort_order: number | null;
};

type PhotoRow = { space_id: string; photo_src: string; sort_order: number | null };

function keys(raw: string | null): string[] {
  return String(raw ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

async function assertCanEditSpaces(sql: Sql, userId: string, daycareId: string) {
  const id = daycareId.trim();
  if (!id || !userId.trim()) throw new Error(NOT_YOURS);
  const owned = await sql<{ user_id: string }>`
    select user_id from provider_daycares
    where user_id = ${userId} and daycare_id = ${id}
    limit 1
  `.catch(() => []);
  if (owned[0]) return;
  const member = await sql<{ role: string }>`
    select role from centre_members
    where user_id = ${userId} and daycare_id = ${id} and status = 'active'
    limit 1
  `.catch(() => [] as { role: string }[]);
  const role = member[0]?.role;
  if (role === "owner" || role === "manager") return;
  throw new Error(NOT_YOURS);
}

async function readPhotoColumn(sql: Sql, daycareId: string): Promise<string> {
  const rows = await sql<{ photos: string | null }>`
    select photos from daycares where id = ${daycareId} limit 1
  `;
  if (!rows[0]) throw new Error("Listing not found");
  return rows[0].photos ?? "";
}

async function readSpaces(sql: Sql, daycareId: string, rawPhotos: string): Promise<SpaceGroup> {
  const spaces = await sql<SpaceRow>`
    select id, name, space_type, amenities, accessibility, sort_order
    from listing_spaces
    where daycare_id = ${daycareId}
    order by sort_order, name
  `.catch(() => [] as SpaceRow[]);
  const photos = spaces.length
    ? await sql<PhotoRow>`
        select space_id, photo_src, sort_order
        from listing_space_photos
        where daycare_id = ${daycareId}
        order by sort_order
      `.catch(() => [] as PhotoRow[])
    : [];
  const bySpace = new Map<string, string[]>();
  for (const row of photos) {
    const list = bySpace.get(row.space_id) ?? [];
    list.push(row.photo_src);
    bySpace.set(row.space_id, list);
  }
  const mapped: ListingSpace[] = spaces.map((row) => ({
    id: row.id,
    name: row.name,
    spaceType: (row.space_type || "other") as ListingSpace["spaceType"],
    amenities: keys(row.amenities),
    accessibility: keys(row.accessibility),
    sort: Number(row.sort_order ?? 0),
    photos: bySpace.get(row.id) ?? [],
  }));
  return groupListingSpaces(rawPhotos, mapped);
}

export async function listListingSpacesForCentre(sql: Sql, userId: string, daycareId: string): Promise<SpaceGroup> {
  await assertCanEditSpaces(sql, userId, daycareId);
  return readSpaces(sql, daycareId, await readPhotoColumn(sql, daycareId));
}

/** Public labels for photos already on the listing. Missing table returns no spaces. */
export async function readPublicListingSpaces(sql: Sql, daycareId: string, rawPhotos: string | string[]): Promise<SpaceGroup> {
  const photos = Array.isArray(rawPhotos) ? rawPhotos.join(",") : rawPhotos;
  try {
    return await readSpaces(sql, daycareId, photos);
  } catch {
    return groupListingSpaces(photos, []);
  }
}

export async function saveListingSpace(
  sql: Sql,
  userId: string,
  input: { daycareId: string; id?: string; name: unknown; spaceType: unknown; amenities?: unknown; accessibility?: unknown },
): Promise<SpaceGroup> {
  await assertCanEditSpaces(sql, userId, input.daycareId);
  const parsed = normalizeSpaceInput(input);
  if (!parsed.ok) throw new Error(parsed.error);
  const amenities = parsed.amenities.join(",");
  const accessibility = parsed.accessibility.join(",");
  const id = String(input.id ?? "").trim();
  if (id) {
    const owned = await sql<{ id: string }>`
      select id from listing_spaces where id = ${id} and daycare_id = ${input.daycareId} limit 1
    `;
    if (!owned[0]) throw new Error("Room not found");
    await sql`
      update listing_spaces set
        name = ${parsed.name},
        space_type = ${parsed.spaceType},
        amenities = ${amenities},
        accessibility = ${accessibility},
        updated_at = now()
      where id = ${id} and daycare_id = ${input.daycareId}
    `;
  } else {
    const count = await sql<{ n: number }>`
      select count(*)::int as n from listing_spaces where daycare_id = ${input.daycareId}
    `;
    if (Number(count[0]?.n ?? 0) >= MAX_LISTING_SPACES) throw new Error("This listing already has 12 rooms or spaces.");
    const sort = await sql<{ n: number }>`
      select coalesce(max(sort_order), 0)::int as n from listing_spaces where daycare_id = ${input.daycareId}
    `;
    const nextId = `sp_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
    await sql`
      insert into listing_spaces (id, daycare_id, name, space_type, amenities, accessibility, sort_order)
      values (
        ${nextId},
        ${input.daycareId},
        ${parsed.name},
        ${parsed.spaceType},
        ${amenities},
        ${accessibility},
        ${Number(sort[0]?.n ?? 0) + 1}
      )
    `;
  }
  return readSpaces(sql, input.daycareId, await readPhotoColumn(sql, input.daycareId));
}

export async function deleteListingSpace(
  sql: Sql,
  userId: string,
  input: { daycareId: string; spaceId: string; confirm?: boolean },
): Promise<SpaceGroup> {
  await assertCanEditSpaces(sql, userId, input.daycareId);
  if (input.confirm !== true) throw new Error(SPACE_DELETE_CONFIRM);
  const before = await readPhotoColumn(sql, input.daycareId);
  const owned = await sql<{ id: string }>`
    select id from listing_spaces where id = ${input.spaceId} and daycare_id = ${input.daycareId} limit 1
  `;
  if (!owned[0]) throw new Error("Room not found");
  await sql`delete from listing_spaces where id = ${input.spaceId} and daycare_id = ${input.daycareId}`;
  const after = await readPhotoColumn(sql, input.daycareId);
  if (after !== before) throw new Error("Room delete must keep the listing photos");
  return readSpaces(sql, input.daycareId, after);
}

export async function setListingSpacePhotos(
  sql: Sql,
  userId: string,
  input: { daycareId: string; spaceId: string; photoSrcs: string[] },
): Promise<SpaceGroup> {
  await assertCanEditSpaces(sql, userId, input.daycareId);
  const raw = await readPhotoColumn(sql, input.daycareId);
  const live = new Set(managedListingPhotos(raw));
  const ordered: string[] = [];
  for (const src of input.photoSrcs) {
    const photo = String(src ?? "").trim();
    if (!photo || !live.has(photo) || ordered.includes(photo)) continue;
    ordered.push(photo);
  }
  const owned = await sql<{ id: string }>`
    select id from listing_spaces where id = ${input.spaceId} and daycare_id = ${input.daycareId} limit 1
  `;
  if (!owned[0]) throw new Error("Room not found");
  for (const photo of ordered) {
    await sql`
      delete from listing_space_photos
      where daycare_id = ${input.daycareId} and photo_src = ${photo}
    `;
  }
  await sql`delete from listing_space_photos where space_id = ${input.spaceId}`;
  for (let index = 0; index < ordered.length; index += 1) {
    await sql`
      insert into listing_space_photos (space_id, daycare_id, photo_src, sort_order)
      values (${input.spaceId}, ${input.daycareId}, ${ordered[index]}, ${index})
    `;
  }
  return readSpaces(sql, input.daycareId, raw);
}

export async function pruneListingSpacePhotos(sql: Sql, daycareId: string, livePhotos: string[]) {
  const live = new Set(livePhotos.filter(Boolean));
  const rows = await sql<{ photo_src: string }>`
    select photo_src from listing_space_photos where daycare_id = ${daycareId}
  `.catch(() => [] as { photo_src: string }[]);
  for (const row of rows) {
    if (live.has(row.photo_src)) continue;
    await sql`
      delete from listing_space_photos
      where daycare_id = ${daycareId} and photo_src = ${row.photo_src}
    `;
  }
}

export async function writeListingPhotoList(
  sql: Sql,
  userId: string,
  input: { daycareId: string; photos: string[]; confirmRemoval?: boolean },
): Promise<SpaceGroup> {
  await assertCanEditSpaces(sql, userId, input.daycareId);
  const previous = await readPhotoColumn(sql, input.daycareId);
  const before = splitPhotoList(previous);
  const polished: string[] = [];
  for (const src of input.photos) {
    const next = await prepareListingUploadPhoto(src);
    if (next) polished.push(next);
  }
  const photos = applyManagedListingPhotos(previous, polished);
  const dropped = photoRemovalNeedsConfirm(before, splitPhotoList(photos));
  if (dropped.length && input.confirmRemoval !== true) throw new Error(PHOTO_DELETE_CONFIRM);
  if (listingPhotosChanged(previous, photos)) {
    await sql`
      update daycares set
        photos = ${photos},
        last_photo_updated_at = now()
      where id = ${input.daycareId}
    `.catch(async () => {
      await sql`update daycares set photos = ${photos} where id = ${input.daycareId}`;
    });
    await pruneListingSpacePhotos(sql, input.daycareId, managedListingPhotos(photos));
  }
  return readSpaces(sql, input.daycareId, photos);
}
