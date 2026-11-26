import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import ts from "typescript";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { readStaticCopy, readStaticCopyProvenance } from "./a11y-static-copy.mjs";

const COPY_KEYS = [
  "searchRadius",
  "searchWhenHint",
  "findChildcare",
  "searchSubmit",
  "searchBarAria",
  "close",
  "searchWhere",
  "searchWhereHint",
  "whereSuggested",
  "whereNearby",
  "whereNearbyHint",
  "useLocation",
  "searchWhen",
  "searchWhenNote",
  "searchClearDates",
  "searchDaycare",
  "searchDaycareHint",
  "searchChildAge",
  "searchStartNow",
  "searchStartThisMonth",
  "searchStartNextMonth",
  "searchNameEmpty",
  "searchNameMore",
  "infant",
  "toddler",
];
const SOURCE_FILES = [
  "src/components/explore-search-bar.tsx",
  "src/components/daycare-name-field.tsx",
  "src/components/chip.tsx",
  "src/lib/search-start.ts",
  "src/lib/dismiss-popovers.ts",
  "src/lib/utils.ts",
  "src/lib/cad-format.ts",
  "src/lib/html-text.ts",
  "src/lib/languages.ts",
];
const DATE_DECLARATIONS = [
  "ISO_DATE",
  "isIsoDate",
  "OPENING_HORIZON_DAYS",
  "localIsoDate",
  "dateAsksForOpenSpot",
  "startWindowForDate",
  "formatExploreDateRange",
];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

function exactDateHelpers(root) {
  const source = readFileSync(join(root, "src/lib/explore-search.ts"), "utf8");
  const ast = ts.createSourceFile("explore-search.ts", source, ts.ScriptTarget.Latest, true);
  assert.equal(ast.parseDiagnostics.length, 0);
  const found = DATE_DECLARATIONS.map((name) => {
    const matches = ast.statements.filter(
      (node) =>
        (ts.isFunctionDeclaration(node) && node.name?.text === name) ||
        (ts.isVariableStatement(node) &&
          node.declarationList.declarations.some(
            (item) => ts.isIdentifier(item.name) && item.name.text === name,
          )),
    );
    assert.equal(matches.length, 1, `Exact date declaration: ${name}`);
    return {
      name,
      text: matches[0].getText(ast),
      line: ast.getLineAndCharacterOfPosition(matches[0].getStart(ast)).line + 1,
    };
  });
  return {
    code: transpile(found.map((item) => item.text).join("\n")),
    declarations: found.map(({ name, text, line }) => ({ name, line, sha256: hash(text) })),
    sourceSha256: hash(source),
  };
}

export async function buildHomeSearchFixture(root, out) {
  const staticCopy = readStaticCopy(root, COPY_KEYS);
  const packs = staticCopy;
  assert.ok(packs.en && packs.fr, "Existing static copy reader returns both literal packs");
  const dates = exactDateHelpers(root);
  const virtual = {
    "@/lib/explore-search": dates.code,
    "@/lib/default-origin":
      "export function isNeutralCanadaOrigin(){throw Error('Unexpected origin path in focus fixture');}",
    "@/lib/geo":
      "export function nearestCities(){throw Error('Unexpected catalogue path in focus fixture');}",
    "@/lib/use-copy": `const packs=${JSON.stringify(packs)};export function useCopy(){const locale=window.__homeHit.locale;return {locale,t:key=>{if(!(key in packs[locale]))throw Error('Unlisted literal copy '+key);return packs[locale][key]}};}`,
    "@/lib/server/daycare-name-search": `export const DAYCARE_NAME_MATCH_LIMIT=40;export function matchDaycareNames({data}){window.__homeHit.lookups.push(data);return Promise.resolve([{slug:'synthetic-maple',name:'Synthetic Maple',city:'Synthetic city',province:'MB'}]);}`,
    "@tanstack/react-router": `import{createElement}from'react';export function useNavigate(){return value=>{window.__homeHit.navigations.push(value);return Promise.resolve()}}export function Link({to,params,search,children,onClick,...props}){return createElement('a',{...props,href:'#synthetic-daycare',onClick:event=>{onClick?.(event);event.preventDefault();window.__homeHit.navigations.push({to,params,search});}},children);}`,
    // This boundary preserves the passed DOM/ARIA/classes and event bubbling.
    // It does not claim PlaceSearch autocomplete or geocoding coverage.
    "@/components/place-search": `import{createElement}from'react';export function PlaceSearch({id,name,value,onChange,placeholder,className,inputClassName,ariaLabel,ariaLabelledBy}){return createElement('div',{className:'relative z-30 min-w-0 flex-1 overflow-visible '+(className||'')},createElement('input',{id,name,value,onChange:event=>onChange(event.target.value),placeholder,className:inputClassName,role:'combobox','aria-expanded':false,'aria-label':ariaLabel,'aria-labelledby':ariaLabelledBy,autoComplete:'off'}));}`,
    "virtual:home-search-entry":
      transpile(`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ExploreSearchBar}from'@/components/explore-search-bar';import{useCopy}from'@/lib/use-copy';
      function Fixture(){const f=window.__homeHit;const{t}=useCopy();const[values,setValues]=useState({where:'',name:'',from:'',to:''});const[start,setStart]=useState('');const[radius,setRadius]=useState(25);const[age,setAge]=useState('');
      f.reset=()=>{setValues({where:'',name:'',from:'',to:''});setStart('');setRadius(25);setAge('')};
      return <><button type="button" data-fixture-reset onClick={()=>f.reset()}>Fixture reset</button><ExploreSearchBar className="mx-auto mt-1 w-full max-w-[960px]" prominent compactSubmit startCollapsed={false} values={values} start={start} radiusKm={radius} onRadiusChange={value=>{f.radii.push(value);setRadius(value)}} onWhereChange={where=>setValues(current=>({...current,where}))} onWhereResolved={value=>f.resolved.push(value)} onNameChange={name=>setValues(current=>({...current,name}))} onDatesChange={value=>setValues(current=>({...current,...value}))} onStartChange={setStart} onChildAge={id=>{f.ages.push(id);setAge(id)}} childAges={[{id:'infant',label:t('infant'),on:age==='infant'},{id:'toddler',label:t('toddler'),on:age==='toddler'}]} onSubmit={where=>f.submits.push({where,name:values.name,radius})}/></>};createRoot(document.getElementById('root')).render(<Fixture/>);`),
  };
  const allowed = new Set(SOURCE_FILES.map((file) => join(root, file)));
  const aliasKey = (id) => {
    const clean = id.split("?")[0];
    if (Object.hasOwn(virtual, clean)) return clean;
    if (clean.startsWith(join(root, "src") + "/")) {
      const key = "@/" + relative(join(root, "src"), clean).replace(/\.[cm]?[jt]sx?$/, "");
      if (Object.hasOwn(virtual, key)) return key;
    }
    return null;
  };
  const built = await build({
    configFile: false,
    envDir: false,
    publicDir: false,
    root,
    cacheDir: join(out, "vite-cache"),
    logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    resolve: { alias: { "@": join(root, "src") } },
    plugins: [
      {
        name: "closed-home-search-focus-fixture",
        enforce: "pre",
        resolveId(id) {
          const key = aliasKey(id);
          if (key) return "\0home-hit:" + key;
          const file = id.split("?")[0];
          if (
            file.startsWith(join(root, "src") + "/") &&
            ![...allowed].some((item) => item === file || item.replace(/\.tsx?$/, "") === file)
          )
            throw Error("Unlisted source in home focus fixture: " + relative(root, file));
        },
        load(id) {
          return id.startsWith("\0home-hit:") ? virtual[id.slice(10)] : null;
        },
        transform(_code, id) {
          const file = id.split("?")[0];
          if (file.startsWith(join(root, "src") + "/") && !allowed.has(file))
            throw Error("Unlisted resolved home focus source");
        },
      },
      react(),
    ],
    build: {
      write: false,
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      rolldownOptions: {
        input: "virtual:home-search-entry",
        output: { format: "iife", name: "HomeHitFixture", codeSplitting: false },
      },
    },
  });
  const output = (Array.isArray(built) ? built : [built]).flatMap((item) => item.output);
  const chunks = output.filter((item) => item.type === "chunk");
  const script = chunks.map((item) => item.code).join("\n");
  assert.ok(script && !script.includes("process.env.NODE_ENV"));
  const moduleGraph = chunks.flatMap((item) => Object.keys(item.modules));
  for (const id of moduleGraph)
    if (id.startsWith(join(root, "src") + "/"))
      assert.ok(allowed.has(id), "Closed actual module graph");
  const assets = join(root, ".vercel/output/static/assets");
  const candidates = readdirSync(assets).filter((name) => /^styles-.*\.css$/.test(name));
  if (!process.env.VISUAL_CSS_FILE)
    assert.equal(
      candidates.length,
      1,
      "Require one finished built stylesheet or explicit VISUAL_CSS_FILE",
    );
  const cssFile = process.env.VISUAL_CSS_FILE || join(assets, candidates[0]);
  assert.match(basename(cssFile), /^styles-.*\.css$/, "Use the built application stylesheet");
  const originalCss = readFileSync(cssFile);
  assert.ok(originalCss.length > 1000, "Finished compiled CSS is required");
  const fonts = [];
  const css = originalCss
    .toString("utf8")
    .replace(/url\((['"]?)(\/fonts\/[^)'"\s]+)\1\)/g, (_match, _quote, font) => {
      const bytes = readFileSync(join(root, "public", font));
      fonts.push({ path: "public" + font, sha256: hash(bytes) });
      return `url(data:font/woff2;base64,${bytes.toString("base64")})`;
    });
  return {
    script,
    css,
    copy: packs,
    provenance: {
      scope:
        "Actual ExploreSearchBar + DaycareNameField with structural PlaceSearch/lookup/router boundaries; not autocomplete, full routes or real data",
      source: [...SOURCE_FILES, "src/lib/explore-search.ts"].map((file) => ({
        file,
        sha256: hash(readFileSync(join(root, file))),
      })),
      dateDeclarations: dates.declarations,
      dateSourceSha256: dates.sourceSha256,
      copy: readStaticCopyProvenance(root),
      copyKeys: COPY_KEYS,
      compiledCss: {
        path: relative(root, cssFile),
        sha256: hash(originalCss),
        bytes: originalCss.length,
      },
      fonts,
      moduleGraph,
    },
  };
}
