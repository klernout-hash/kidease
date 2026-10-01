import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  groundListingDraft,
  listingDraftSchema,
  listingWriterEventProps,
  listingWriterModelUser,
  listingWriterSource,
} from "../src/lib/ai/listing-writer.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("invented fees and programs are flagged and removed", () => {
  const source = listingWriterSource("https://example.com", "Play-based care for toddlers in Winnipeg.");
  const draft = groundListingDraft(
    {
      description: "Play-based care for toddlers in Winnipeg. Tuition is $900 a month.",
      programSummary: "A Montessori forest program.",
      highlights: ["Play-based care", "Open spots this week"],
      unsourced: [],
    },
    source,
  );
  assert.match(draft.description, /Play-based care for toddlers in Winnipeg/);
  assert.doesNotMatch(draft.description, /\$900/);
  assert.equal(draft.programSummary, "");
  assert.deepEqual(draft.highlights, ["Play-based care"]);
  assert.ok(draft.unsourced.some((line) => line.includes("$900")));
  assert.ok(draft.unsourced.some((line) => /Montessori/i.test(line)));
  assert.equal(listingDraftSchema.safeParse({ description: "ok", listingId: "x" }).success, false);
});

test("the model only sees the website address and the scrubbed notes", () => {
  const seen = listingWriterModelUser(
    "https://example.com",
    "French program. Email owner@example.com. Child name: Sam.",
  );
  assert.match(seen, /example\.com/);
  assert.match(seen, /French program/);
  assert.equal(seen.includes("owner@example.com"), false);
  assert.equal(seen.includes("Sam"), false);
  assert.equal(listingWriterModelUser("", ""), "");
});

test("events and the server stay on listing facts", () => {
  assert.deepEqual(listingWriterEventProps({ daycare_id: "dy_1", notes: "secret", email: "a@b.c" }), {
    daycare_id: "dy_1",
  });
  const server = read("src/lib/server/listing-writer.ts");
  const ui = read("src/components/listing-writer.tsx");
  const form = read("src/components/provider-listing-forms.tsx");
  assert.match(server, /feature: "ai-listing-writer"/);
  assert.match(server, /select website from daycares/);
  assert.doesNotMatch(server, /select[^;]*phone|description from daycares/i);
  assert.match(server, /listingWriterModelUser\(website, data\.notes\)/);
  assert.match(ui, /AI_FLAGS\.listingWriter/);
  assert.match(ui, /listing_writer_used/);
  assert.match(form, /listing_writer_published/);
  assert.doesNotMatch(ui, /updateListing/);
});
