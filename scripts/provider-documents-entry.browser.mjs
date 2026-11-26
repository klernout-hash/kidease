import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";
import { build } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = readFileSync(new URL("../src/routes/provider.tsx", import.meta.url), "utf8");
const first = source.indexOf('{documents?.kind === "pending"');
const last = source.indexOf('{desk === "listings" && centreOwner', first);
assert.ok(first >= 0 && last > first, "The fixture must exercise the actual route render branches");
// Real route JSX and resolver. Auth, listings, navigation and private documents are synthetic.
const entry = `
import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {providerDocumentsEntry} from "${root}src/lib/provider-documents-entry.ts";
const Button=({asChild,children,...p})=>asChild?children:<button {...p}>{children}</button>;
const Link=({to,search,children})=><a href={search ? to+"?"+new URLSearchParams(Object.entries(search).filter(([,value])=>value!=null)) : to}>{children}</a>;
const EmptyState=({title,body,extra})=><section><h2>{title}</h2><p>{body}</p>{extra}</section>;
const DeskSkeleton=()=> <span>Loading</span>;
function CentreDocumentChecklist({daycareId}){
  const [mountedFor]=useState(daycareId);
  return <div data-testid="checklist">{daycareId}:{mountedFor}</div>;
}
function App(){
  const [state,setState]=useState({deskSettled:false,deskLoadFailed:false,sessionReady:false,hasSession:false,canViewDocuments:false,listingIds:[]});
  window.fixture=next=>setState(prev=>({...prev,...next}));
  const documents=providerDocumentsEntry(state);
  const fr=document.documentElement.lang==="fr", centreOwner=state.owner===true;
  const t=k=>({loading:fr?"Chargement":"Loading",deskNavDocuments:"Documents",providerOnboardingLead:fr?"Aucun centre":"No centre",providerOnboardingClaim:fr?"Revendiquer un centre":"Claim a licensed centre"})[k];
  const deskPath="/provider", search={desk:"documents"};
  const refreshSessionDesks=()=>{ window.retrySession=(window.retrySession||0)+1; };
  const load=()=>{ window.retryDesk=(window.retryDesk||0)+1; };
  return <>${source.slice(first, last)}</>;
}
createRoot(document.getElementById("root")).render(<App />);
`;
const out = await build({
  root,
  configFile: false,
  publicDir: false,
  logLevel: "error",
  plugins: [
    react(),
    {
      name: "documents-entry-fixture",
      resolveId(id) {
        if (id === "virtual:documents-entry") return "\0virtual:documents-entry.jsx";
      },
      load(id) {
        if (id === "\0virtual:documents-entry.jsx") return entry;
      },
    },
  ],
  build: {
    write: false,
    rollupOptions: { input: "virtual:documents-entry", output: { codeSplitting: false } },
  },
});
const js = out.output.find((chunk) => chunk.type === "chunk" && chunk.isEntry).code;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
try {
  for (const [lang, width] of [
    ["en", 390],
    ["fr", 1280],
  ]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url === "https://docs-fixture.invalid/app.js")
        return route.fulfill({ contentType: "text/javascript", body: js });
      if (url !== "https://docs-fixture.invalid/provider?desk=documents") return route.abort();
      return route.fulfill({
        contentType: "text/html",
        body: `<html lang="${lang}"><div id="root"></div><script type="module" src="/app.js"></script></html>`,
      });
    });
    await page.goto("https://docs-fixture.invalid/provider?desk=documents");
    await page.getByRole("status").waitFor();
    assert.equal(await page.getByRole("link", { name: /claim|revendiquer/i }).count(), 0);
    await page.evaluate(() =>
      window.fixture({
        deskSettled: true,
        sessionReady: true,
        hasSession: true,
        canViewDocuments: true,
        listingIds: ["centre-a", "centre-b"],
        requestedCentre: "centre-a",
        owner: true,
      }),
    );
    await page.getByText("centre-a:centre-a").waitFor();
    await page.evaluate(() => window.fixture({ requestedCentre: "centre-b" }));
    await page.getByText("centre-b:centre-b").waitFor();
    await page.evaluate(() => window.fixture({ requestedCentre: "centre-unavailable" }));
    const returnLink = page.getByRole("link", { name: /view my documents|voir mes documents/i });
    await returnLink.waitFor();
    assert.equal(await returnLink.getAttribute("href"), "/provider?desk=documents");
    assert.equal(await page.getByTestId("checklist").count(), 0);
    await page.evaluate(() => window.fixture({ deskLoadFailed: true }));
    await page.getByRole("button", { name: /try again|réessayer/i }).click();
    assert.equal(
      await page.evaluate(() => window.retryDesk === 1 && window.retrySession === 1),
      true,
    );
    await page.evaluate(() => window.fixture({ deskLoadFailed: false, canViewDocuments: false }));
    await page.getByText(/do not have access|pas accès/i).waitFor();
    assert.equal(await page.getByTestId("checklist").count(), 0);
    await page.evaluate(() =>
      window.fixture({ canViewDocuments: true, listingIds: [], requestedCentre: undefined }),
    );
    await page.getByRole("link", { name: /claim|revendiquer/i }).waitFor();
    await page.close();
    console.log(
      `PASS ${lang.toUpperCase()} ${width}px: loading, correct centre, remount, unavailable, retry, denied and verified empty`,
    );
  }
} finally {
  await browser.close();
}
