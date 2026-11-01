import { isShippedLocale, SHIPPED_LOCALES, type ShippedLocale } from "../languages.ts";
import type { AgeBand, GoalTheme, ProvinceCode } from "./pack.ts";
import { DOCS } from "./i18n/docs.ts";
import { GOAL_TEXT } from "./i18n/goals.ts";
import { PLAY } from "./i18n/play.ts";
import { CURRICULUM_UI, UI_KEYS, type CurriculumUiKey } from "./i18n/ui.ts";

export function asCurriculumLocale(locale: string | null | undefined): ShippedLocale {
  return isShippedLocale(locale) ? locale : "en";
}

export function curriculumUi(locale: string | null | undefined, key: CurriculumUiKey): string {
  const pack = CURRICULUM_UI[asCurriculumLocale(locale)];
  const value = pack[key];
  if (!value || !value.trim()) throw new Error(`Missing curriculum copy ${key}`);
  return value;
}

export function curriculumGoal(locale: string | null | undefined, province: ProvinceCode, theme: GoalTheme): string {
  const value = GOAL_TEXT[asCurriculumLocale(locale)][province][theme];
  if (!value || !value.trim()) throw new Error(`Missing goal ${province} ${theme}`);
  return value;
}

export function curriculumRequirement(locale: string | null | undefined, province: ProvinceCode): string {
  const value = DOCS[asCurriculumLocale(locale)].requirement[province];
  if (!value || !value.trim()) throw new Error(`Missing requirement ${province}`);
  return value;
}

export function curriculumDoc(locale: string | null | undefined, province: ProvinceCode): { title: string; prompts: readonly string[] } {
  const pack = DOCS[asCurriculumLocale(locale)];
  return { title: pack.title[province], prompts: pack.prompts[province] };
}

function fill(template: string, place: string, prop: string): string {
  return template.replaceAll("{place}", place).replaceAll("{prop}", prop);
}

export function curriculumActivity(
  locale: string | null | undefined,
  province: ProvinceCode,
  theme: GoalTheme,
): { title: string; materials: string; steps: string[] } {
  const pack = PLAY[asCurriculumLocale(locale)];
  const template = pack.templates[theme];
  const place = pack.place[province];
  const prop = pack.prop[province];
  return {
    title: fill(template.title, place, prop),
    materials: fill(template.materials, place, prop),
    steps: template.steps.map((step) => fill(step, place, prop)),
  };
}

export function curriculumAge(locale: string | null | undefined, age: AgeBand): string {
  const key =
    age === "infant" ? "ageInfant" : age === "toddler" ? "ageToddler" : age === "school" ? "ageSchool" : "agePreschool";
  return curriculumUi(locale, key);
}

export function curriculumDay(locale: string | null | undefined, index: number): string {
  const keys = ["dayMon", "dayTue", "dayWed", "dayThu", "dayFri"] as const;
  return curriculumUi(locale, keys[index] || "dayMon");
}

export function fillGoal(template: string, goal: string, n?: number): string {
  return template.replaceAll("{goal}", goal).replaceAll("{n}", String(n ?? ""));
}

/** Quebec keeps French. New Brunswick keeps English and French. The menu language is always included. */
export function contentLocales(province: ProvinceCode | null, locale: string | null | undefined): ShippedLocale[] {
  const selected = asCurriculumLocale(locale);
  if (province === "NB") {
    const list: ShippedLocale[] = ["en", "fr"];
    if (selected !== "en" && selected !== "fr") list.push(selected);
    return list;
  }
  if (province === "QC") {
    if (selected === "fr") return ["fr"];
    return ["fr", selected];
  }
  return [selected];
}

export type CurriculumFlatKey = string;

export function flattenCurriculumLocale(locale: ShippedLocale): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of UI_KEYS) out[`ui.${key}`] = CURRICULUM_UI[locale][key];
  for (const province of Object.keys(GOAL_TEXT.en) as ProvinceCode[]) {
    for (const theme of Object.keys(GOAL_TEXT.en[province]) as GoalTheme[]) {
      out[`goal.${province}.${theme}`] = GOAL_TEXT[locale][province][theme];
    }
    out[`doc.title.${province}`] = DOCS[locale].title[province];
    out[`req.${province}`] = DOCS[locale].requirement[province];
    DOCS[locale].prompts[province].forEach((prompt, index) => {
      out[`doc.prompt.${province}.${index}`] = prompt;
    });
    out[`place.${province}`] = PLAY[locale].place[province];
    out[`prop.${province}`] = PLAY[locale].prop[province];
  }
  for (const theme of Object.keys(PLAY.en.templates) as GoalTheme[]) {
    const template = PLAY[locale].templates[theme];
    out[`play.${theme}.title`] = template.title;
    out[`play.${theme}.materials`] = template.materials;
    template.steps.forEach((step, index) => {
      out[`play.${theme}.step.${index}`] = step;
    });
  }
  return out;
}

export function curriculumLocaleList(): readonly ShippedLocale[] {
  return SHIPPED_LOCALES;
}
