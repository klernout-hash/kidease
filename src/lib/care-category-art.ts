/**
 * Category pictures for the phone home row.
 *
 * Each picture is a KidEase feel photo already in public/photos
 * (playroom, cottage, kitchen, and the other stills). It illustrates
 * the category. It is not a photo of a listed centre.
 */

export const CARE_CATEGORY_SOURCES = {
  all: "community.jpg",
  child_care_centre: "brick.jpg",
  family_home: "cottage.jpg",
  group_home: "kitchen.jpg",
  nursery_preschool: "playroom.jpg",
  school_age: "nature.jpg",
  before_after: "hero.jpg",
  open: "welcome.jpg",
} as const;

export type CareCategoryId = keyof typeof CARE_CATEGORY_SOURCES;

export function careCategoryArt(id: string): { gif: string; still: string; source: string } | null {
  if (!(id in CARE_CATEGORY_SOURCES)) return null;
  const key = id as CareCategoryId;
  return {
    gif: `/photos/care-cats/${key}.gif`,
    still: `/photos/care-cats/${key}.jpg`,
    source: `/photos/${CARE_CATEGORY_SOURCES[key]}`,
  };
}
