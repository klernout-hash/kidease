/**
 * One way to score a daycare: from its daycares row. Admin's approval queue,
 * the Approve guard, and the daycare's own desk all call this, so the
 * numbers always match end to end.
 */

import { checklistHasAges, checklistHasFees, checklistHasHours } from "./listing-incomplete.ts";
import { realManagedListingPhotos } from "./listing-photo.ts";
import { profileHealth, type DaycareHealthRow, type ProfileHealth } from "./profile-health.ts";

/** SQL column list for DaycareHealthRow (alias `d` = daycares). */
export const DAYCARE_HEALTH_COLUMNS = `d.photos, d.license_number, d.license_status, d.license_expiry::text as license_expiry,
  d.registry_match_state, d.license_photo, d.screening_on_file, d.staff_screening_attested, d.province,
  d.infant_monthly, d.toddler_monthly, d.preschool_monthly, d.part_time_monthly,
  d.ages_confirmed, d.age_min_months, d.age_max_months, d.hours, d.phone, d.contact_email, d.address`;

export function realPhotoList(photos: string | null | undefined): string[] {
  // Same list the Photo tour and photo manager count.
  return realManagedListingPhotos(photos);
}

export function healthFromDaycareRow(r: DaycareHealthRow, now: Date = new Date()): ProfileHealth {
  const feeRow = {
    province: r.province,
    infantMonthly: r.infant_monthly,
    toddlerMonthly: r.toddler_monthly,
    preschoolMonthly: r.preschool_monthly,
    partTimeMonthly: r.part_time_monthly,
    agesKnown: r.ages_confirmed === 1 || r.ages_confirmed === true ? true : undefined,
    ageMinMonths: r.age_min_months ?? 0,
    ageMaxMonths: r.age_max_months ?? 0,
  };
  return profileHealth(
    {
      licenseNumber: r.license_number,
      licenseStatus: r.license_status,
      registryMatchState: r.registry_match_state,
      licensePhoto: r.license_photo,
      licenseExpiry: r.license_expiry,
      screeningOnFile: r.screening_on_file === true || r.screening_on_file === 1,
      staffScreeningAttested: r.staff_screening_attested === true || r.staff_screening_attested === 1,
      photoCount: realPhotoList(r.photos).length,
      hasFees: checklistHasFees(feeRow),
      hasAges: checklistHasAges(feeRow),
      hasHours: checklistHasHours(r.hours),
      phone: r.phone,
      email: r.contact_email,
      address: r.address,
    },
    now,
  );
}
