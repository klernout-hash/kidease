/**
 * Open picture books for Story Corner.
 * Files are stored on disk. The reader never hotlinks a book file.
 * CC BY-NC and ND items are skipped. CC BY-SA stays unmodified.
 */

import { createHash } from "node:crypto";
import { GOAL_THEMES, PROVINCE_CODES, type AgeBand, type GoalTheme, type ProvinceCode } from "../curriculum/pack.ts";

export const GDL_API = "https://content.digitallibrary.io/wp-json/content-api/v1/books/";
export const UNITE_FOR_LITERACY_URL = "https://www.uniteforliteracy.com/";

export type LicenceClass = "by" | "by-sa" | "skip";

export type BookCreators = {
  author: string;
  illustrator: string;
  designer: string;
  editor: string;
  translator: string;
  publisher: string;
};

export type StoredBook = {
  id: string;
  source: "gdl" | "storyweaver";
  sourceKey: string;
  title: string;
  language: "en" | "fr" | "other";
  age: AgeBand;
  licence: string;
  licenceUrl: string;
  licenceClass: "by" | "by-sa";
  credit: string;
  sha256: string;
  localPath: string;
  goalIds: string[];
  unmodified: true;
  changeNote: string;
  creators: BookCreators;
  attributionUrl: string;
};

const NOT_NAMED = "Not named on the source page";

export function classifyLicence(raw: string | null | undefined): LicenceClass {
  const value = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
  if (!value) return "skip";
  if (value.includes("nc") || value.includes("nd")) return "skip";
  const by = value.includes("cc-by") || value.includes("ccby") || value.includes("creative-commons") || value.includes("cc0") || value.includes("public-domain");
  if (!by) return "skip";
  if (value.includes("sa")) return "by-sa";
  return "by";
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function shaMatches(bytes: Uint8Array, expected: string): boolean {
  const want = expected.trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(want) && sha256Hex(bytes) === want;
}

export function emptyCreators(): BookCreators {
  return { author: NOT_NAMED, illustrator: NOT_NAMED, designer: NOT_NAMED, editor: NOT_NAMED, translator: NOT_NAMED, publisher: NOT_NAMED };
}

export function gdlCredit(input: { title: string; publisher: string; licence: string }): string {
  const publisher = input.publisher.trim() || "the publisher named on the Global Digital Library record";
  return `${input.title}. Publisher: ${publisher}. Shared by the Global Digital Library (content.digitallibrary.io). Licence: ${input.licence}. ${licenceUrlFor(input.licence)}`;
}

export function storyweaverCredit(input: BookCreators & { title: string }): string {
  return [
    input.title,
    `Author: ${input.author}`,
    `Illustrator: ${input.illustrator}`,
    `Translator: ${input.translator}`,
    `Publisher: ${input.publisher}`,
    "StoryWeaver",
    "https://creativecommons.org/licenses/by/4.0/",
  ].join(". ");
}

export function licenceUrlFor(raw: string): string {
  const kind = classifyLicence(raw);
  if (kind === "by-sa") return "https://creativecommons.org/licenses/by-sa/4.0/";
  if (kind === "by") return "https://creativecommons.org/licenses/by/4.0/";
  return "";
}

export function uniteForLiteracy(): { href: string; embed: false; note: string } {
  return {
    href: UNITE_FOR_LITERACY_URL,
    embed: false,
    note: "Unite for Literacy opens on their site. KidEase does not embed it.",
  };
}

export function storyweaverStatus(env: Record<string, string | undefined> | NodeJS.ProcessEnv = {}): { enabled: false; reason: string } | { enabled: true; reason: string } {
  const token = String(env.STORYWEAVER_API_TOKEN || "").trim();
  if (!token) {
    return { enabled: false, reason: "StoryWeaver stays off until an account token is set. Read Along videos are NC-ND and are always skipped." };
  }
  return { enabled: true, reason: "A token is set. This build still does not call StoryWeaver. Read Along videos stay skipped." };
}

export function storyweaverItemAllowed(input: { title: string; kind?: string; licence: string }): boolean {
  const blob = `${input.title} ${input.kind || ""}`.toLowerCase();
  if (blob.includes("read along") || blob.includes("read-along") || blob.includes("readalong")) return false;
  return classifyLicence(input.licence) !== "skip";
}

type GdlTerm = { name?: string; slug?: string };

export type GdlBook = {
  postId?: number;
  title?: string;
  description?: string;
  publisher?: string;
  language?: GdlTerm[];
  license?: GdlTerm[];
  topic?: GdlTerm[];
  h5pUrl?: string;
  epubUrl?: string;
  post_name?: string;
};

export function gdlLanguage(book: GdlBook): "en" | "fr" | "other" {
  const slug = String(book.language?.[0]?.slug || "").toLowerCase();
  if (slug === "en" || slug === "english") return "en";
  if (slug === "fr" || slug === "french" || slug === "fr-fr") return "fr";
  return "other";
}

export function ageFromText(text: string): AgeBand {
  const value = text.toLowerCase();
  if (value.includes("infant") || value.includes("baby")) return "infant";
  if (value.includes("toddler")) return "toddler";
  if (value.includes("school")) return "school";
  return "preschool";
}

export function themeFromText(text: string): GoalTheme {
  const value = text.toLowerCase();
  if (/famil|friend|mom|dad|belong|hello/.test(value)) return "belong";
  if (/body|food|sleep|health|water/.test(value)) return "well";
  if (/word|song|talk|read|letter/.test(value)) return "talk";
  if (/share|earth|help|care|communit/.test(value)) return "care";
  return "play";
}

export function goalIdsForTheme(theme: GoalTheme, province?: ProvinceCode | null): string[] {
  if (province) return [`${province}-${theme}`];
  return PROVINCE_CODES.map((code) => `${code}-${theme}`);
}

export function planGdlBook(book: GdlBook): { keep: false; reason: string } | { keep: true; plan: Omit<StoredBook, "sha256" | "localPath"> & { remoteFile: string } } {
  const licenceName = String(book.license?.[0]?.slug || book.license?.[0]?.name || "");
  const licenceClass = classifyLicence(licenceName);
  if (licenceClass === "skip") return { keep: false, reason: `skip licence ${licenceName || "missing"}` };
  if (!storyweaverItemAllowed({ title: String(book.title || ""), kind: String(book.publisher || ""), licence: licenceName })) {
    return { keep: false, reason: "skip read-along or non-BY item" };
  }
  const remoteFile = String(book.h5pUrl || book.epubUrl || "").trim();
  if (!remoteFile.startsWith("https://")) return { keep: false, reason: "no downloadable file" };
  const language = gdlLanguage(book);
  const title = String(book.title || "").trim();
  if (!title) return { keep: false, reason: "missing title" };
  const topic = (book.topic || []).map((term) => term.name || "").join(" ");
  const theme = themeFromText(`${title} ${book.description || ""} ${topic}`);
  const age = ageFromText(`${topic} ${book.description || ""}`);
  const creators = emptyCreators();
  creators.publisher = String(book.publisher || "").trim() || "Global Digital Library";
  const id = `gdl-${language}-${book.postId || book.post_name || title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return {
    keep: true,
    plan: {
      id,
      source: "gdl",
      sourceKey: String(book.postId || book.post_name || title),
      title,
      language,
      age,
      licence: licenceName || "CC-BY-4.0",
      licenceUrl: licenceUrlFor(licenceName || "cc-by-4.0"),
      licenceClass,
      credit: gdlCredit({ title, publisher: creators.publisher, licence: licenceName || "CC BY 4.0" }),
      goalIds: goalIdsForTheme(theme),
      unmodified: true,
      changeNote: "",
      creators,
      attributionUrl: "https://digitallibrary.io/",
      remoteFile,
    },
  };
}

export function localBookPath(id: string, fileName: string): string {
  const safeId = id.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80);
  const safeName = fileName.replace(/[^a-z0-9._-]+/gi, "-").slice(0, 80);
  return `data/story-corner/files/${safeId}/${safeName}`;
}

export function readerFileAllowed(localPath: string): boolean {
  if (!localPath.startsWith("data/story-corner/files/")) return false;
  if (localPath.includes("..") || localPath.includes("\\")) return false;
  if (/^https?:/i.test(localPath)) return false;
  return true;
}

export type StoryShelfFallback = "none" | "other-language" | "official-languages";

/** Prefer the menu language. English and French fall back to each other. Other languages fall back to the stored official-language books. */
export function pickStoryBooks<T extends { language: "en" | "fr" | "other" }>(
  books: readonly T[],
  locale: string,
): { books: T[]; fallback: StoryShelfFallback } {
  if (locale === "en" || locale === "fr") {
    const match = books.filter((book) => book.language === locale);
    if (match.length) return { books: match, fallback: "none" };
    const other = locale === "en" ? "fr" : "en";
    return { books: books.filter((book) => book.language === other), fallback: "other-language" };
  }
  return {
    books: books.filter((book) => book.language === "en" || book.language === "fr"),
    fallback: "official-languages",
  };
}

export function shelfBooks(books: readonly StoredBook[], input: { language?: "en" | "fr"; province?: ProvinceCode | null; goalId?: string }): StoredBook[] {
  return books.filter((book) => {
    if (input.language && book.language !== input.language) return false;
    if (input.province && !book.goalIds.some((id) => id.startsWith(`${input.province}-`))) return false;
    if (input.goalId && !book.goalIds.includes(input.goalId)) return false;
    return book.unmodified === true && classifyLicence(book.licence) !== "skip";
  });
}

export function creditVisible(book: { credit: string; licenceUrl: string; source: string }): boolean {
  if (book.source !== "gdl" && book.source !== "storyweaver") return false;
  if (!book.credit.trim() || !book.licenceUrl.startsWith("https://creativecommons.org/")) return false;
  return true;
}

export const GOAL_THEME_LIST = GOAL_THEMES;
