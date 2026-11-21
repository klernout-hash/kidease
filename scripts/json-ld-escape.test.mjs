import assert from "node:assert/strict";
import { test } from "node:test";
import { listingJsonLdScript } from "../src/lib/listing-seo.ts";
import { escapeJsonForScript } from "../src/lib/page-seo.ts";

test("listing JSON-LD cannot close the script tag", () => {
  const script = listingJsonLdScript({
    name: '</script><script>alert(1)</script>',
    slug: "centre",
    city: "Winnipeg",
    province: "MB",
    address: "1 <Main> & Co",
  });
  assert.doesNotMatch(script, /<script/i);
  assert.match(script, /\\u003c/);
  assert.equal(escapeJsonForScript('{"a":"<"}').includes("<"), false);
});
