/** Two exact source excerpts, compiled without loading either owning app module. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import ts from "typescript";
import { readStaticCopy, readStaticCopyProvenance } from "./a11y-static-copy.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const copyKeys = [
  "searchRadius",
  "mapRoad",
  "mapSat",
  "useLocation",
  "mapSavedOnly",
  "mapSearchRadius",
  "km",
];

function parse(root, path) {
  const bytes = readFileSync(join(root, path));
  const source = ts.createSourceFile(
    path,
    bytes.toString("utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  assert.equal(source.parseDiagnostics.length, 0, `Parse source ${path}`);
  return { path, bytes, source };
}

function className(node) {
  if (!ts.isJsxElement(node)) return null;
  const attribute = node.openingElement.attributes.properties.find(
    (item) => ts.isJsxAttribute(item) && item.name.text === "className",
  );
  return attribute?.initializer && ts.isStringLiteral(attribute.initializer)
    ? attribute.initializer.text
    : null;
}

function singleNode(file, predicate, label) {
  const matches = [];
  function visit(node) {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file.source);
  assert.equal(matches.length, 1, `Expected one exact ${label}`);
  const node = matches[0];
  const text = node.getText(file.source);
  return {
    text,
    className: className(node),
    evidence: {
      path: file.path,
      line: file.source.getLineAndCharacterOfPosition(node.getStart(file.source)).line + 1,
      sha256: hash(text),
    },
  };
}

export async function buildVisualControlsFixture(root, out, phase) {
  const requestedCss = process.env.VISUAL_CSS_FILE;
  const buildDirectories = [
    ".vercel/output/static/assets",
    ".output/public/assets",
    "dist/client/assets",
  ].map((path) => join(root, path));
  const candidates = requestedCss
    ? [resolve(requestedCss)]
    : buildDirectories.flatMap((directory) =>
        existsSync(directory)
          ? readdirSync(directory)
              .filter((name) => /^styles.*\.css$/.test(name))
              .map((name) => join(directory, name))
          : [],
      );
  assert.equal(candidates.length, 1, "Use one finished build stylesheet or set VISUAL_CSS_FILE");
  const cssFile = realpathSync(candidates[0]);
  const cssDirectories = [...buildDirectories, join(root, "artifacts/visual-controls")].map(
    (path) => path + sep,
  );
  assert(
    cssDirectories.some((path) => cssFile.startsWith(path)) && cssFile.endsWith(".css"),
    "Use this checkout's built CSS or its private archived copy",
  );
  const cssBytes = readFileSync(cssFile);
  const explore = parse(root, "src/components/explore-search-bar.tsx");
  const map = parse(root, "src/components/map-view.tsx");
  const radius = singleNode(
    explore,
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === "SearchRadiusSelect",
    "radius function",
  );
  const options = singleNode(
    explore,
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.length === 1 &&
      node.declarationList.declarations[0].name.getText(explore.source) === "RADIUS_KM_OPTIONS",
    "radius options",
  );
  assert.match(options.text, /^const RADIUS_KM_OPTIONS = \[5, 10, 25, 50\] as const;$/);
  const controls = singleNode(
    map,
    (node) => className(node)?.startsWith("ke-map-controls "),
    "complete map control stack",
  );
  const badge = singleNode(
    map,
    (node) =>
      className(node) === "pointer-events-none absolute left-3 top-[4.6rem] z-[400] lg:top-3",
    "map radius badge",
  );
  const mapRoot = singleNode(
    map,
    (node) =>
      className(node) === "relative size-full min-h-[280px] overflow-hidden rounded-lg bg-map",
    "map host class",
  );
  const sourceFiles = [
    "src/lib/utils.ts",
    "src/lib/html-text.ts",
    "src/lib/languages.ts",
    "src/lib/units.ts",
  ];
  const allowed = new Set(sourceFiles.map((file) => join(root, file)));
  const allowedPackages = new Set([
    "react",
    "react-dom/client",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
    "lucide-react",
    "clsx",
    "tailwind-merge",
  ]);
  const packs = readStaticCopy(root, copyKeys);
  const fixture = join(out, `.fixture-${phase}`);
  const entry = join(fixture, "entry.tsx");
  await mkdir(fixture, { recursive: true });
  const modules = new Set();
  const generated = `
    import React,{useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {LocateFixed,Plus,Minus} from 'lucide-react';
    import {cn} from ${JSON.stringify(join(root, "src/lib/utils.ts"))};
    import {displayDistance,displayDistanceFor} from ${JSON.stringify(join(root, "src/lib/units.ts"))};
    const packs=${JSON.stringify(packs)};
    function useCopy(){const locale=document.documentElement.lang;return {locale,t:key=>{const text=packs[locale][key];if(typeof text!=='string')throw new Error('Missing static copy');return text;}};}
    ${options.text}
    ${radius.text}
    function Fixture(){
      const {t,locale}=useCopy();const [value,setValue]=useState(25);const [base,setMapBase]=useState('roadmap');
      const locating=false,itemsOnly=false,radiusKm=25;
      function setBase(next){window.__visualControls.layers.push(next);setMapBase(next);}
      function locateMe(){window.__visualControls.locates++;}
      function bumpZoom(delta){window.__visualControls.zooms.push(delta);}
      function onRadius(next){window.__visualControls.radii.push(next);setValue(next);}
      return <main style={{padding:'1rem',maxWidth:'70rem',margin:'auto'}}>
        <h1 className="text-xl font-semibold">Synthetic control excerpts</h1>
        <p className="mt-2 text-sm">Actual source JSX; no app route, catalogue or map service.</p>
        <section className="mt-6 space-y-3" aria-label="Synthetic radius controls">
          <div data-radius="regular"><SearchRadiusSelect value={value} onChange={onRadius}/></div>
          <div data-radius="quiet"><SearchRadiusSelect value={value} onChange={onRadius} quiet/></div>
        </section>
        <section className="mt-6" aria-label="Synthetic map controls" data-map-host style={{height:280}}>
          <div className=${JSON.stringify(mapRoot.className)}>
            ${badge.text}
            ${controls.text}
          </div>
        </section>
      </main>;
    }
    createRoot(document.getElementById('root')).render(<Fixture/>);
  `;
  // mapRoot records the exact owning class without evaluating the owning component.
  assert(
    mapRoot.text.startsWith(
      '<div className="relative size-full min-h-[280px] overflow-hidden rounded-lg bg-map">',
    ),
  );
  await writeFile(entry, generated);
  function localFile(id, importer) {
    const clean = id.split(/[?#]/)[0];
    if (clean.startsWith("/")) return clean;
    if (clean.startsWith(".") && importer)
      return resolve(dirname(importer.split(/[?#]/)[0]), clean);
    return null;
  }
  try {
    const built = await build({
      configFile: false,
      envDir: false,
      root: fixture,
      publicDir: false,
      logLevel: "error",
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
      plugins: [
        {
          name: "only-visual-control-excerpts",
          enforce: "pre",
          resolveId(id, importer) {
            const file = localFile(id, importer);
            if (file?.startsWith(join(root, "src") + sep))
              assert(allowed.has(file), "Unexpected application dependency");
          },
          load(id) {
            const file = id.split(/[?#]/)[0];
            if (file.startsWith(join(root, "src") + sep)) {
              assert(allowed.has(file), "Unexpected application source");
              assert.equal(realpathSync(file), file, "Use original pure helper source");
              modules.add(relative(root, file));
            }
          },
          transform(code, id) {
            const file = id.split(/[?#]/)[0];
            if (file !== entry && !allowed.has(file)) return;
            const ast = ts.createSourceFile(
              file,
              code,
              ts.ScriptTarget.Latest,
              true,
              ts.ScriptKind.TSX,
            );
            for (const statement of ast.statements) {
              if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly)
                continue;
              if (
                statement.importClause?.namedBindings &&
                ts.isNamedImports(statement.importClause.namedBindings) &&
                statement.importClause.namedBindings.elements.every((item) => item.isTypeOnly)
              )
                continue;
              const specifier = statement.moduleSpecifier.text;
              if (allowedPackages.has(specifier)) continue;
              const candidate = localFile(specifier, file);
              assert(
                candidate &&
                  [candidate, candidate + ".ts", candidate + ".tsx"].some((path) =>
                    allowed.has(path),
                  ),
                "Unlisted runtime import in source excerpt fixture",
              );
            }
          },
        },
        react(),
      ],
      build: {
        write: false,
        minify: false,
        sourcemap: false,
        lib: { entry, formats: ["iife"], name: "VisualControlsFixture" },
      },
    });
    const output = (Array.isArray(built) ? built : [built]).flatMap((item) => item.output);
    const script = output
      .filter((item) => item.type === "chunk")
      .map((item) => item.code)
      .join("\n");
    assert(script.length);
    let css = cssBytes.toString("utf8");
    const fonts = [];
    css = css.replace(/url\((['"]?)(\/fonts\/[^)'"\s]+)\1\)/g, (_, _quote, font) => {
      const path = join(root, "public", font);
      assert(existsSync(path));
      const bytes = readFileSync(path);
      fonts.push({ path: relative(root, path), sha256: hash(bytes) });
      return `url(data:font/woff2;base64,${bytes.toString("base64")})`;
    });
    const provenance = {
      kind: "Exact AST source excerpts with synthetic state; not full ExploreSearchBar, PlaceSearch, MapView or route acceptance",
      excerpts: [options.evidence, radius.evidence, badge.evidence, controls.evidence],
      source: [explore, map].map((file) => ({ path: file.path, sha256: hash(file.bytes) })),
      pureRuntimeModules: [...modules].sort(),
      copy: readStaticCopyProvenance(root),
      copyKeys,
      compiledCss: { path: relative(root, cssFile), sha256: hash(cssBytes) },
      fonts,
      sourceReads: sourceFiles.map((path) => ({
        path,
        sha256: hash(readFileSync(join(root, path))),
      })),
    };
    return { script, css, packs, provenance };
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}
