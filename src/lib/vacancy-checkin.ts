/**
 * Weekly open-spot check-in. One tap stores a total.
 * 3 means 3 or more. This module does not send mail or SMS.
 */

export const VACANCY_CHECKIN_CHOICES = [0, 1, 2, 3] as const;

export type VacancyCheckinChoice = (typeof VACANCY_CHECKIN_CHOICES)[number];

export const VACANCY_CHECKIN_TTL_MS = 8 * 24 * 60 * 60 * 1000;

export function isVacancyCheckinChoice(value: unknown): value is VacancyCheckinChoice {
  const n = Number(value);
  return (VACANCY_CHECKIN_CHOICES as readonly number[]).includes(n);
}

export function vacancyCheckinLabel(choice: VacancyCheckinChoice): "0" | "1" | "2" | "3+" {
  if (choice === 3) return "3+";
  if (choice === 2) return "2";
  if (choice === 1) return "1";
  return "0";
}

/** Age-group columns are cleared only when the centre says there are no open spots. */
export function vacancyCheckinWrite(choice: VacancyCheckinChoice): {
  spots: number;
  plus: boolean;
  clearAgeSpots: boolean;
} {
  return {
    spots: choice,
    plus: choice === 3,
    clearAgeSpots: choice === 0,
  };
}
