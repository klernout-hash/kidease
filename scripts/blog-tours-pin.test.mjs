import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BLOG_POSTS, blogArticlePaths, blogPost } from "../src/lib/blog-posts.ts";
import { LOCALE_PAIRED_PATHS, localePath } from "../src/lib/locale-path.ts";
import { cityCentre, pinIsFar } from "../src/lib/pin-drift.ts";
import { sitemapPublicPaths } from "../src/lib/sitemap.ts";
import { FOOTER_KIDEASE } from "../src/lib/site-footer-nav.ts";
import { summarizeTourCounts } from "../src/lib/tour-counts.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("blog posts are paired in English and French and stay factual", () => {
  assert.equal(BLOG_POSTS.length, 3);
  const banned = /\$10|free forever|gratuit pour toujours|rating|étoiles|government|gouvernement|★/i;
  for (const post of BLOG_POSTS) {
    assert.equal(blogPost(post.slug)?.slug, post.slug);
    assert.ok(post.paragraphs.en.length >= 3);
    assert.equal(post.paragraphs.en.length, post.paragraphs.fr.length);
    const blob = [...post.paragraphs.en, ...post.paragraphs.fr, post.title.en, post.title.fr].join("\n");
    assert.doesNotMatch(blob, banned);
  }
  assert.equal(blogPost("nope"), null);
  assert.ok(LOCALE_PAIRED_PATHS.includes("/blog"));
  assert.equal(localePath("/blog/find-care", "fr"), "/fr/blog/find-care");
  const paths = sitemapPublicPaths();
  assert.ok(paths.includes("/blog"));
  assert.ok(paths.includes("/fr/blog"));
  for (const path of blogArticlePaths()) assert.ok(paths.includes(path), path);
  assert.ok(FOOTER_KIDEASE.some((link) => link.to === "/blog" && link.labelEn === "Blog" && link.labelFr === "Blogue"));
  assert.match(readFileSync(join(root, "src/routes/blog.tsx"), "utf8"), /createFileRoute\("\/blog"\)/);
  assert.match(readFileSync(join(root, "src/routes/fr.blog.tsx"), "utf8"), /createFileRoute\("\/fr\/blog"\)/);
  assert.match(readFileSync(join(root, "src/routeTree.gen.ts"), "utf8"), /fullPath: '\/blog\/\$slug'/);
  assert.match(readFileSync(join(root, "src/routeTree.gen.ts"), "utf8"), /fullPath: '\/fr\/blog\/\$slug'/);
});

test("tour counts keep waiting requests out of booked seats", () => {
  const fromSlots = summarizeTourCounts({
    slots: [
      { pending: 2, accepted: 1, booked: 9 },
      { pending: 0, accepted: 3 },
    ],
  });
  assert.deepEqual(fromSlots, { openRequests: 2, bookedSeats: 4, postedTimes: 2 });
  const fromRequests = summarizeTourCounts({
    requests: [
      { kind: "tour", status: "pending" },
      { kind: "tour", status: "waiting" },
      { kind: "tour", status: "accepted" },
      { kind: "tour", status: "confirmed" },
      { kind: "tour", status: "declined" },
      { kind: "enrolment", status: "accepted" },
    ],
  });
  assert.deepEqual(fromRequests, { openRequests: 2, bookedSeats: 2, postedTimes: 0 });
  assert.match(readFileSync(join(root, "src/components/tour-availability-desk.tsx"), "utf8"), /counts\.bookedSeats/);
  assert.doesNotMatch(readFileSync(join(root, "src/components/tour-availability-desk.tsx"), "utf8"), /tourTimesBooked/);
  assert.doesNotMatch(readFileSync(join(root, "src/components/tour-calendar-page.tsx"), "utf8"), /block text-\[10px\]/);
});

test("a Laval pin in Winnipeg is far, and a same-name town in another province is not", () => {
  const laval = cityCentre("Laval", "QC");
  assert.equal(laval?.label, "Laval, QC");
  assert.equal(pinIsFar(45.6066, -73.7124, "Laval", "QC"), false);
  assert.equal(pinIsFar(49.842245, -97.093046, "Laval", "QC"), true);
  assert.equal(pinIsFar(49.842245, -97.093046, "Winnipeg", "MB"), false);
  assert.equal(pinIsFar(43.4675, -79.6877, "Oakville", "MB"), false);
  assert.equal(cityCentre("Lavallee", "MB"), null);
  const sql = readFileSync(join(root, "scripts/manual-sql/0207_laval_pin_drift.sql"), "utf8");
  assert.equal(existsSync(join(root, "migrations/0207_laval_pin_drift.sql")), false);
  assert.match(sql, /lower\(btrim\(city\)\) = 'laval'/);
  assert.match(sql, /does not invent a street/);
  assert.doesNotMatch(sql, /49\.842245/);
});
