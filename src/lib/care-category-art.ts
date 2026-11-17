/** Original KidEase category illustrations. These are not listing photos. */

export const CARE_CATEGORY_SOURCES = {
  all: "KidEase_All.png",
  child_care_centre: "KidEase_Centres.png",
  family_home: "KidEase_Home_Daycares.png",
  group_home: "KidEase_Group_Homes.png",
  nursery_preschool: "KidEase_Nursery.png",
  school_age: "KidEase_School_Age.png",
  before_after: "KidEase_Before_After.png",
  open: "KidEase_Open_Spots.png",
} as const;

export type CareCategoryId = keyof typeof CARE_CATEGORY_SOURCES;

export function careCategoryArt(id: string): { src: string; webp: string } | null {
  if (!Object.hasOwn(CARE_CATEGORY_SOURCES, id)) return null;
  const key = id as CareCategoryId;
  const file = CARE_CATEGORY_SOURCES[key];
  return {
    src: `/photos/care-icons/${file}`,
    // 128px WebP of the same art (about 10 KB instead of about 95 KB); shown up to 56px.
    webp: `/photos/care-icons/${file.replace(/\.png$/, ".webp")}`,
  };
}
