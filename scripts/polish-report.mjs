#!/usr/bin/env node
/** Build a self-contained review report from preserved local evidence. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidence = resolve(process.argv[2] || resolve(repo, "../evidence"));
const output = resolve(
  process.argv[3] || resolve(repo, "../deliverables/KidEase-performance-polish-report.html"),
);
const read = (path) => JSON.parse(readFileSync(resolve(evidence, path), "utf8"));
const data = read("comparison.json");
const manual = read("final-manual-review/summary.json");
const drawer = read("final-manual-review/drawer.json");
const menu = JSON.parse(
  readFileSync(resolve(repo, "artifacts/performance-polish/menu-comparison.json"), "utf8"),
);
const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const num = (value, digits = 3) =>
  value === null || value === undefined
    ? "Unavailable"
    : Number(value.toFixed(digits)).toLocaleString("en-CA", { maximumFractionDigits: digits });
const range = (value, digits = 3) => `${num(value.min, digits)}–${num(value.max, digits)}`;
const names = {
  home: "Home",
  search: "Search",
  listing: "Listing",
  login: "Login",
  parent: "Parent desk",
  daycare: "Daycare desk",
  admin: "Admin desk",
};
const metricCell = (row, key, digits = 3) =>
  `<td class="numeric"><span>${num(row.before[key].median, digits)} <span class="arrow">→</span> <strong>${num(row.after[key].median, digits)}</strong></span></td>`;
const rows = data.rows
  .map(
    (row) =>
      `<tr><th scope="row">${names[row.id]}<small>${row.locale.toUpperCase()}${row.id === "admin" && row.locale === "fr" ? " · English main copy" : ""}</small></th><td class="numeric">${row.before.samples} / ${row.after.samples}</td>${metricCell(row, "lcpMs")}<td class="numeric ranges">${range(row.before.lcpMs)}<br><span>${range(row.after.lcpMs)}</span></td>${metricCell(row, "cls", 6)}${metricCell(row, "tbtMs")}${metricCell(row, "javascriptGzipBytes", 0)}</tr>`,
  )
  .join("");
const coreConsistency = data.contentComparisons
  .filter((row) => ["home", "search"].includes(row.id))
  .map(
    (row) =>
      `<tr><th>${names[row.id]} · ${row.locale.toUpperCase()}</th><td>${esc(row.beforeWarmListingCounts.join(", "))}</td><td>${esc(row.afterWarmListingCounts.join(", "))}</td><td>${row.sameListingSlugSetsAcrossWarmProbes ? "Identical sets" : "Unverified / different"}</td></tr>`,
  )
  .join("");

function png(path) {
  const bytes = readFileSync(path);
  return {
    url: `data:image/png;base64,${bytes.toString("base64")}`,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}
function imageFile(path) {
  if (path.endsWith(".png")) return png(path);
  return {
    url: `data:image/jpeg;base64,${readFileSync(path).toString("base64")}`,
    width: 250,
    height: 499,
  };
}
function shot(path, label, provenance) {
  const item = imageFile(path);
  return `<figure><figcaption><strong>${esc(label)}</strong><small>${esc(provenance)}</small></figcaption><div class="image-scroll" tabindex="0" aria-label="${esc(label)} screenshot; scroll to inspect"><img src="${item.url}" width="${item.width}" height="${item.height}" loading="lazy" alt="${esc(label)}: captured local KidEase page"></div></figure>`;
}
const pairs = [];
for (const [id, label] of [
  ["home", "Home"],
  ["login", "Login"],
  ["listing", "Listing"],
]) {
  const before = resolve(
    repo,
    `artifacts/performance-polish/before-public/before-${id}-en-390-portrait.png`,
  );
  const after = resolve(
    repo,
    `artifacts/performance-polish/after-public/after-${id}-en-390-portrait.png`,
  );
  pairs.push(
    `<article class="shot-pair"><h3>${label} · 390 px · EN</h3><p>Classic look, light theme. Full-page PNGs from the focused public capture; these images do not certify the full page/viewport matrix.</p><div class="pair">${shot(before, "Before", "Default branch 75cf0cd3 · before-public")}${shot(after, "After", "Measured build 2f7a2ee1 · after-public")}</div></article>`,
  );
}
const searchBefore = resolve(evidence, "before/lighthouse/search-en-1-final.jpg");
const searchAfter = resolve(evidence, "after/lighthouse/search-en-1-final.jpg");
pairs.push(
  `<article class="shot-pair"><h3>Search · 412 px simulated viewport · EN</h3><p>Actual Lighthouse final frames, compressed to 250 px by Lighthouse. The full 390 px search PNGs are retained in the evidence bundle; each is about 4.9 MB and more than 47,000 px tall.</p><div class="pair">${shot(searchBefore, "Before", "Lighthouse original sample 1 · 412 × 823 CSS px")}${shot(searchAfter, "After", "Lighthouse original sample 1 · 412 × 823 CSS px")}</div></article>`,
);
const drawerBefore = resolve(
  repo,
  "artifacts/performance-polish/before-menu/before-menu-fr-1280x320-classic-light-large-text-bottom.png",
);
const drawerAfter = resolve(
  repo,
  "artifacts/performance-polish/after-menu/after-menu-fr-1280x320-classic-light-large-text-bottom.png",
);
if (existsSync(drawerBefore) && existsSync(drawerAfter))
  pairs.push(
    `<article class="shot-pair wide-pair"><h3>Drawer · 1280 × 320 px · FR · largest app text</h3><p>Classic look, light theme, after scrolling to the final controls. This short landscape case exposed the unreachable appearance control in the baseline.</p><div class="pair">${shot(drawerBefore, "Before", "Final control bottom: 366.125 px, outside the 320 px viewport")}${shot(drawerAfter, "After", "Final control bottom: 306.875 px, reachable by scrolling")}</div></article>`,
  );

const published = "6d3d4c982de817d856e9649912e3a8fa390e209f";
const publishedTree = "a78834c37765155ec66526abf5a8e2a0f336e8d6";
const rawJson = JSON.stringify(data).replaceAll("<", "\\u003c");
const downloadJson = `data:application/json;base64,${Buffer.from(JSON.stringify(data, null, 2)).toString("base64")}`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KidEase · Performance and visual polish review</title><style>
:root{color-scheme:light;--ink:#17263e;--muted:#526078;--brand:#1a3790;--line:#dce3ed;--soft:#f3f6fb;--warn:#973b19;--warn-bg:#fff4e9;--ok:#176442}*{box-sizing:border-box}body{margin:0;background:#fff;color:var(--ink);font:16px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:var(--brand);text-underline-offset:3px}a:focus-visible,summary:focus-visible,[tabindex]:focus-visible{outline:3px solid var(--brand);outline-offset:3px}header,main,footer{max-width:1240px;margin:auto;padding:32px 40px}header{padding-top:56px;padding-bottom:24px}.eyebrow{text-transform:uppercase;letter-spacing:.13em;font-weight:700;font-size:.75rem;color:var(--brand)}h1{font-size:clamp(2rem,4vw,3.5rem);line-height:1.08;max-width:850px;letter-spacing:-.04em;margin:16px 0}h2{font-size:1.75rem;line-height:1.2;letter-spacing:-.025em;margin:0 0 12px}h3{font-size:1.15rem;line-height:1.3;margin:0 0 8px}p{max-width:84ch;margin:0 0 16px}.lede{font-size:1.15rem;color:var(--muted);max-width:78ch}.status{display:inline-flex;align-items:center;min-height:36px;padding:5px 12px;border:1px solid #dfaa79;background:var(--warn-bg);color:var(--warn);border-radius:999px;font-size:.8rem;font-weight:650}.meta{color:var(--muted);font-size:.875rem}nav{display:flex;flex-wrap:wrap;gap:8px;margin:24px 0 0}nav a,.download{display:inline-flex;min-height:44px;align-items:center;padding:9px 14px;border:1px solid var(--line);border-radius:10px;text-decoration:none;font-weight:600}.pr{background:var(--brand);color:white;border-color:var(--brand)}.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.card{border:1px solid var(--line);border-radius:16px;padding:20px;background:var(--soft)}.number{display:block;font-size:2rem;font-weight:750;letter-spacing:-.04em;font-variant-numeric:tabular-nums;line-height:1.1;margin-bottom:8px}.card p{font-size:.9rem;margin:0;color:var(--muted)}section{margin-top:44px;scroll-margin-top:20px}.note{border-left:4px solid var(--brand);background:var(--soft);padding:16px 20px;border-radius:0 12px 12px 0;margin:20px 0}.warning{border-color:var(--warn);background:var(--warn-bg)}.note p:last-child{margin-bottom:0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.panel{border:1px solid var(--line);border-radius:16px;padding:24px}.table-scroll{overflow:auto;border:1px solid var(--line);border-radius:12px;margin:20px 0;max-width:100%}table{border-collapse:collapse;width:100%;font-size:.82rem}th,td{padding:12px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}thead th{background:var(--soft);font-weight:700;white-space:normal}tbody tr:last-child>*{border-bottom:0}tbody tr:nth-child(even){background:#fafbfd}th small{display:block;font-size:.72rem;font-weight:450;color:var(--muted);max-width:130px}.numeric{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.ranges{color:var(--muted);font-size:.75rem}.ranges span{color:var(--ink)}.arrow{color:var(--muted);padding:0 3px}.metrics-table{min-width:1050px}.small-table{min-width:480px}.tag{font-size:.75rem;font-weight:700;color:var(--warn)}ul{padding-left:22px;margin:10px 0}li{margin-bottom:8px}code{font-size:.82em;overflow-wrap:anywhere;background:var(--soft);padding:2px 5px;border-radius:4px}details{border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin-top:20px}summary{cursor:pointer;font-weight:650}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0;min-width:0}figcaption{margin-bottom:10px}figcaption strong{display:block}figcaption small{display:block;color:var(--muted);font-size:.78rem}.image-scroll{max-height:560px;overflow:auto;border:1px solid var(--line);border-radius:12px;background:var(--soft);padding:10px}.image-scroll img{display:block;width:min(100%,390px);height:auto;margin:auto;background:#fff}.shot-pair{border-top:1px solid var(--line);padding-top:24px;margin-top:28px}.shot-pair>p{font-size:.875rem;color:var(--muted)}.wide-pair .image-scroll img{width:100%;max-width:none}.wide-pair .image-scroll{padding:0}.footnote{font-size:.8rem;color:var(--muted)}footer{border-top:1px solid var(--line);margin-top:40px;padding-top:24px;padding-bottom:48px;color:var(--muted);font-size:.85rem}.scope-count{font-variant-numeric:tabular-nums;font-weight:700}.checks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.checks article{border:1px solid var(--line);border-radius:12px;padding:18px}.checks strong{display:block;font-size:1.3rem}.checks p{font-size:.875rem;color:var(--muted);margin:6px 0 0}@media(max-width:760px){header,main,footer{padding-left:20px;padding-right:20px}.cards{grid-template-columns:repeat(2,minmax(0,1fr))}.grid,.checks{grid-template-columns:1fr}.pair{gap:12px}.card{padding:16px}.number{font-size:1.65rem}h2{font-size:1.5rem}.image-scroll{padding:4px;max-height:480px}.metrics-table{font-size:.78rem}.numeric{white-space:nowrap}}@media(max-width:400px){.pair{grid-template-columns:1fr}.cards{gap:10px}}@media print{header,main,footer{padding:20px;max-width:none}.image-scroll{max-height:700px}.cards,.panel,.shot-pair{break-inside:avoid}nav{display:none}section{margin-top:28px}.table-scroll{overflow:visible}.metrics-table{min-width:0;font-size:9px}th,td{padding:6px}}
</style></head><body><header><div class="eyebrow">KidEase · Local review evidence · 12 November 2026</div><h1>Performance and visual polish</h1><p class="lede">Shared controls are easier to use and the daycare desk loads less JavaScript. The requested performance and full coverage targets remain incomplete.</p><span class="status">Draft review · Targets still unmet</span><nav aria-label="Report sections"><a class="pr" href="https://github.com/klernout-hash/kidease/pull/841">Review draft PR #841</a><a href="#metrics">Exact metrics</a><a href="#proof">Screenshots</a><a href="#validation">Validation</a><a href="#limits">Remaining work</a></nav></header><main>
<div class="cards"><article class="card"><strong class="number">−5.93%</strong><p>Loaded script gzip bytes on the first EN daycare desk navigation</p></article><article class="card"><strong class="number">14 / 14</strong><p>Measured route/locale rows still over the 200 KB script budget</p></article><article class="card"><strong class="number">10 / 14</strong><p>Measured route/locale rows still over the 2.5 s LCP target</p></article><article class="card"><strong class="number">${manual.cases}</strong><p>Settled focused page cases; ${manual.documentOverflowCases} document overflow cases in that limited review</p></article></div>
<div class="note warning"><p><strong>This is a review draft, not a release sign-off.</strong> No merge or production release was performed. The draft PR triggered the repository’s automatic Vercel preview checks; main CI was still in progress at report preparation. Overall performance targets are not achieved, some touch targets remain too small, and the full public/dynamic/desk viewport matrix remains outstanding.</p></div>
<section id="changes"><h2>What changed</h2><div class="grid"><article class="panel"><h3>Loading and bandwidth</h3><ul><li>Heavy daycare desk panes move behind dynamic imports. Features remain available when opened.</li><li>Map initialization waits for the host to be on screen; map work has bounded concurrency and lifecycle/deadline cancellation.</li><li>Likely routes can preload on navigation intent.</li><li>Existing responsive image, subset font, and clean/classic look systems remain in use.</li></ul></article><article class="panel"><h3>Controls and layout</h3><ul><li>Shared controls use the design tokens and more consistent tap dimensions.</li><li>Compact appearance/language controls and selected pills, card actions and navigation targets were enlarged.</li><li>The drawer includes summary controls in its keyboard loop, restores the opener’s focus, and scrolls in short landscape layouts.</li><li>English and French fixture checks preserve the existing Canada/province wording and feature flags.</li></ul></article></div><p class="footnote">App subscriptions remain off. Parent-to-daycare payment code and Stripe settings were preserved; no live payment, account-management or messaging action was tested.</p></section>
<section id="metrics"><h2>Exact before and after metrics</h2><p><strong>Exploratory readings under host contention.</strong> The before/after servers and databases were separate, but layout workers and Node checks ran concurrently on the same shared Mac. These are not causally isolated benchmarks.</p><p>Cells show <strong>before → after</strong>. LCP ranges retain every sample, including cold-server fallback outliers. Core pages have three samples per phase; desk homes have one. Desk values are single observations, not a stable median.</p><div class="table-scroll" tabindex="0" aria-label="Exact metrics table; scroll horizontally"><table class="metrics-table"><thead><tr><th>Page / locale</th><th>Samples<br>before / after</th><th>LCP ms<br>median</th><th>LCP range ms<br>before / after</th><th>CLS<br>median</th><th>TBT ms<br>median</th><th>Script gzip bytes<br>median</th></tr></thead><tbody>${rows}</tbody></table></div><div class="note warning"><p><strong>Target failures:</strong> LCP ${data.targetFailures.lcp}/14, CLS ${data.targetFailures.cls}/14, and script gzip ${data.targetFailures.javascript}/14. The daycare desk CLS remains 0.170109. INP is unavailable for every route.</p><p>EN search median LCP increased from 4,630.410 to 5,116.313 ms, with an after range reaching 12,129.250 ms. Home is essentially unchanged. These small, host-contended lab sample sets do not establish statistical significance, an overall speedup, or the cause of the observed EN search regression. Unchanged search query logic does not establish causality without an isolated rerun.</p></div><a class="download" href="${downloadJson}" download="KidEase-metric-comparison.json">Download embedded metric data</a>
<details><summary>Measurement method and limits</summary><p>${esc(data.methodology.device)} ${esc(data.methodology.network)} Lighthouse ${esc(data.methodology.lighthouseVersion)}; actual host Chrome is recorded in the raw samples.</p><ul><li>Simulated Slow 4G: 150 ms RTT, 1,638.4 Kbit/s throughput, 4× CPU slowdown; 412 × 823 CSS px at DPR 1.75.</li><li>Every navigation uses a fresh Chrome profile. The first matrix begins with a fresh dedicated local PGLite process; the two core repeats use that warmed process. Layout workers and Node checks ran concurrently on the same shared Mac during timing collection, so host CPU contention was not isolated.</li><li>External browser requests and <code>/api/health</code> are blocked. This does not measure production CDN/R2, map tiles, third-party services, a physical phone, or physical 4G.</li><li>TBT is a navigation lab metric. It is not INP. No field INP claim is made.</li><li>Script bytes sum each unique loaded same-origin script compressed with gzip level 9. Inline document scripts are excluded, making this a lower bound for the full budget.</li><li>Actual Lighthouse final screenshots for EN/FR parent, daycare and admin were visually inspected and show loaded content. Independent same-session checks verify settled desk markers. A later readiness check alone cannot prove what an earlier timing frame rendered.</li></ul></details>
<details><summary>Document fallback and content consistency</summary><p>Server document sizes vary when the initial HTML is a fallback and browser data later fills the page. The first EN home document was 51,455 → 51,739 bytes before/after, versus warmed documents of 298,910 → 303,730 bytes. The first after EN search document was 41,929 bytes versus 489,396 bytes in warm repeats. These outliers were retained.</p><div class="table-scroll"><table class="small-table"><thead><tr><th>Warm readiness probe</th><th>Before listing counts</th><th>After listing counts</th><th>Listing slug set</th></tr></thead><tbody>${coreConsistency}</tbody></table></div><p class="footnote">These are independent settled DOM checks. SSR article counts were unavailable with the selected Lighthouse audit set; document byte counts, observed server latency, exact LCP nodes, final frames and listing slug sets remain in the evidence.</p></details></section>
<section><h2>Provider loading graph</h2><div class="grid"><article class="panel"><h3>Actual first EN navigation</h3><strong class="number">896,074 → 842,917 B</strong><p>53,157 fewer gzip bytes, or 5.93%. The budget remains far above 200,000 bytes.</p><p class="footnote">Not loaded on this first navigation: top-rated desk 45,953 B, centre employees 8,022 B, Stripe invoice list 3,413 B, DocuSign copy 2,862 B and tax receipt studio 2,051 B. Other added/shared chunks offset part of that saving. This is deferral, not feature deletion.</p></article><article class="panel"><h3>Static dependency graph</h3><strong class="number">869,629 → 816,827 B</strong><p>Statically reachable modules: 245 → 239. The direct route entry can grow while heavy panes move behind dynamic imports.</p><p class="footnote">Static reachability and actual loaded scripts are separate measurements. Core public script budgets increased by about 2.4 KB instead of improving.</p></article></div></section>
<section id="validation"><h2>Focused validation</h2><div class="checks"><article><strong>${manual.cases} settled page cases</strong><p>${manual.http200} HTTP 200 responses, ${manual.documentOverflowCases} document overflow cases and ${manual.pageErrors.length} recorded page errors in the supplemental review.</p></article><article><strong>${manual.drawerCases} drawer checks</strong><p>EN/FR, classic/clean and light/dark: focus restored, keyboard loop returned to Close, and the final controls remained reachable.</p></article><article><strong>2,824 unit tests</strong><p>Repository tests passed. The phone e2e shard’s four checks and the local production bundle checks passed.</p></article></div><p class="footnote">The focused page review covers home, login, parent and provider surfaces at selected 320, 390 and 1280 px states. Local synthetic PGLite accounts only. These counts do not certify every screen, every interactive control, AA contrast, physical devices, or true 200% browser UI zoom.</p>
<div class="table-scroll"><table class="small-table"><thead><tr><th>Measured issue</th><th>Before</th><th>After</th><th>Evidence / scope</th></tr></thead><tbody><tr><th>Menu opener</th><td>42 × 42 px</td><td>44 × 44 px</td><td>Drawer comparison; 1280 × 320 landscape</td></tr><tr><th>Listing Save overlay</th><td>42 × 42 px</td><td>44 × 44 px</td><td>Home / 390 px; measured overlay rectangles</td></tr><tr><th>Drawer final appearance control</th><td>Bottom 366.125 px, outside viewport</td><td>Bottom 306.875 px, reachable</td><td>1280 × 320, largest app text</td></tr><tr><th>Escape restores opener</th><td>Failed 16/16 cases</td><td>15/16 primary cases passed; one timeout passed on retry</td><td>Opening remains intermittent after the fixed one-second settle</td></tr></tbody></table></div><p class="footnote">Drawer primary comparison: ${menu.runs.after.statuses.passed} passed and one opening timeout; the identical retry passed. Initial activation sometimes required multiple attempts, so startup first-activation responsiveness remains unresolved. The supplemental eight settled keyboard/scroll checks passed after opening.</p></section>
<section id="proof"><h2>Representative before and after screenshots</h2><p>Images are embedded in this file. Scroll inside each frame to inspect the full capture. The complete evidence bundle retains additional widths, themes, languages, source metadata and failed/partial runs.</p>${pairs.join("")}</section>
<section id="limits"><h2>Remaining limits and decisions</h2><div class="grid"><article class="panel"><h3>Still failing or unavailable</h3><ul><li>Parent quick-search input remains 42 px high in the focused 320/390/1280 px cases.</li><li>Some Button class overrides leave the Claim listing control at 38.5 px; cookie controls at 38.5 px and composite inner inputs at 14 px remain flagged.</li><li>The automated scanner still reports tap-target, text clipping and geometric overlap candidates. Geometric collisions require review; they are not a confirmed unique bug count.</li><li>Organization and staff fixtures reach the shared provider surface; distinct memberships and populated desk coverage are unavailable.</li><li>The government gate redirects its fixture to home. It is excluded from successful desk coverage.</li><li>French admin uses <code>/admin?lang=fr</code>, but its existing main copy remains English. The original <code>/fr/admin</code> 404 diagnostic was preserved.</li></ul></article><article class="panel"><h3>Review before extending scope</h3><ul><li>Decide how to reduce the shared first-page script graph while preserving features; none of the measured routes meets the requested 200 KB budget.</li><li>Resolve the daycare desk layout shift and investigate the search fallback/render-delay path.</li><li>Finish the full public, dynamic and authenticated desk matrix across the requested widths, orientations, large text, clean/classic and light/dark combinations.</li><li>Run true browser 200% zoom and physical mid-range-phone checks. The existing half-width reflow simulation is not browser UI zoom.</li><li>Complete keyboard/label/alt and AA contrast review, then obtain representative field INP without treating TBT as a substitute.</li></ul></article></div><div class="note warning"><p><strong>Coverage is incomplete.</strong> Failed, gated, interrupted and unrun cases remain recorded. Some early screenshots showed transient skeletons; they are diagnostic evidence, not successful authenticated screen checks. No blanket “all screens passed” claim is made.</p></div></section>
<section id="provenance"><h2>Source and reproducibility</h2><p><a href="https://github.com/klernout-hash/kidease/pull/841">Draft PR #841</a> is the review destination. The measured build’s runtime files match the initial published core commit; only three test files differ between the measured and published commits.</p><details><summary>Verified revisions and evidence files</summary><ul><li>Default-branch baseline: <code>${esc(data.methodology.beforeSourceSha)}</code></li><li>Measured application build: <code>${esc(data.methodology.afterSourceSha)}</code></li><li>Initial published core commit: <code>${published}</code></li><li>Initial published core Git tree: <code>${publishedTree}</code></li></ul><p>Runtime equivalence is distinct from complete Git tree identity. Source, public assets, package manifests, build configuration and server runtime files are unchanged between the measured and published commits.</p><ul><li><code>evidence/comparison.json</code> and <code>comparison.md</code>: exact medians, ranges, 72 canonical navigation records, 60 valid timing samples and 12 gated records across both phases.</li><li><code>evidence/{before,after}/lighthouse*</code>: raw Lighthouse JSON/HTML, loaded-script sizes, final frames and per-sample metadata.</li><li><code>evidence/final-manual-review</code>: ${manual.cases} settled page cases, ${drawer.length} drawer cases and screenshots.</li><li><code>artifacts/performance-polish</code>: layout manifests, representative PNGs, menu checks and preserved partial/failed runs.</li><li><code>scripts/polish-lighthouse.mjs</code>, <code>polish-compare.mjs</code> and <code>polish-report.mjs</code>: reproducible local capture and report generation.</li></ul><p class="footnote">App subscriptions remain off. Feature visibility flags, Stripe configuration and production user data were not modified. No real account or charge was used; no messages were sent.</p></details></section>
</main><footer>Prepared for review from separate local fixture databases on a shared, contended host. This report embeds its metric data and representative images; it does not fetch external assets. Full route acceptance and performance-target compliance remain outstanding.</footer><script type="application/json" id="metric-data">${rawJson}</script></body></html>`;
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, html);
const bytes = Buffer.byteLength(html);
if (bytes > 10 * 1024 * 1024) throw new Error(`Report exceeds 10 MiB: ${bytes} bytes`);
console.log(
  JSON.stringify({
    output,
    bytes,
    screenshotPairs: pairs.length,
    metricRows: data.rows.length,
    manualCases: manual.cases,
    drawerCases: drawer.length,
    selfContained: true,
  }),
);
