#!/usr/bin/env node
/** Promote source-checked visual content limits after frozen collectors finish. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] || "../evidence/iteration-2");
const read = (name) => JSON.parse(readFileSync(resolve(root, name), "utf8"));
const parity = read("content-parity-review.json");
const note = [
  "<!-- content-parity-start -->",
  "## Content parity limits",
  "",
  "The route, fixture identity and collection protocol are paired. Full fixture data is not identical.",
  "",
  `Search visible licensed-centre totals are ${parity.search.beforeVisibleLicensedCentreTotal} before → ${parity.search.afterVisibleLicensedCentreTotal} final in both EN/FR. The first ${parity.search.originalSsrArticlesPerSample} SSR article slug sets and independently settled first-page sets match. Full result totals do not. No cause of the difference is established; preserve all LCP regressions without a causal speedup or regression inference.`,
  "",
  "Visible parent request rows differ: EN 2 before → 1 final; FR 1 before → 2 final. These n=1 observations compare the same route and protocol, not identical full fixture state or a stable median.",
  "",
  parity.integrity,
  "",
  "See content-parity-review.json and the original source-matched final-frame pairs. Earlier canonical screenshot sets retain their own source and data provenance.",
  "<!-- content-parity-end -->",
].join("\n");
for (const stem of ["comparison", "supplement-comparison"]) {
  const data = read(`${stem}.json`);
  if (
    data.beforeSourceSha !== parity.beforeSourceSha ||
    data.afterSourceSha !== parity.afterSourceSha
  ) {
    throw new Error(`Content review source mismatch for ${stem}.`);
  }
  data.contentParity = parity;
  data.methodology.contentParity =
    "Matched route/protocol and first-page listing sets; search totals425→426 and parent visible requestrows differ. Full data identity and causal attribution are not established.";
  for (const row of data.rows) {
    if (row.id === "search") row.contentParityReview = parity.search;
    if (row.id === "parent")
      row.contentParityReview = {
        ...parity.parent,
        visibleRequestRowsForLocale: parity.parent.visibleRequestRows[row.locale],
      };
  }
  writeFileSync(resolve(root, `${stem}.json`), JSON.stringify(data, null, 2));
  const markdownPath = resolve(root, `${stem}.md`);
  const markdown = readFileSync(markdownPath, "utf8").replace(
    /\n?<!-- content-parity-start -->[\s\S]*?<!-- content-parity-end -->\n?/g,
    "",
  );
  writeFileSync(markdownPath, `${markdown.trimEnd()}\n\n${note}\n`);
}
console.log(
  JSON.stringify({
    updated: ["comparison", "supplement-comparison"],
    sourceMatched: true,
    searchTotals: [425, 426],
    fullFixtureDataIdentical: false,
  }),
);
