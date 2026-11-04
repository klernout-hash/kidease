import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { stripPascalFunctionExports, transformRouteModule } from "./route-ui-split.mjs";

const routes = path.join("/repo", "src", "routes");

test("pascal screen exports become local so the route splitter can move them", () => {
  const out = stripPascalFunctionExports(`export function LoginScreen() {}\nexport async function loginLoader() {}\nexport const Route = {};\nexport function HomePage() {}\n`);
  assert.match(out, /^function LoginScreen/m);
  assert.match(out, /^function HomePage/m);
  assert.match(out, /export async function loginLoader/);
  assert.match(out, /export const Route/);
});

test("french pages load screens from the async copy and keep loaders on the route", () => {
  const importer = path.join(routes, "fr.search.tsx");
  const out = transformRouteModule(
    `import { SearchScreen, searchLoader, searchPageHead } from "@/routes/search";\n`,
    importer,
  );
  assert.match(out, /import \{ searchLoader, searchPageHead \} from "@\/routes\/search"/);
  assert.match(out, /import \{ SearchScreen \} from "@\/routes\/search\?ke-ui"/);
});

test("relative home import keeps the loader on the route module", () => {
  const importer = path.join(routes, "fr.index.tsx");
  const out = transformRouteModule(
    `import { HomePage, homeValidateSearch, loadProductHome } from "./index";\nexport function FrProductHome() { return null }\n`,
    importer,
  );
  assert.match(out, /import \{ homeValidateSearch, loadProductHome \} from "\.\/index"/);
  assert.match(out, /import \{ HomePage \} from "\.\/index\?ke-ui"/);
  assert.match(out, /^function FrProductHome/m);
});

test("library imports and the root route stay as written", () => {
  const importer = path.join(routes, "index.tsx");
  const code = `import { Shell } from "@/components/shell";\nexport function HomePage() {}\n`;
  const out = transformRouteModule(code, importer);
  assert.match(out, /from "@\/components\/shell"/);
  assert.match(out, /^function HomePage/m);
  const root = transformRouteModule(`export function RootDocument() {}`, path.join(routes, "__root__.tsx"));
  assert.match(root, /export function RootDocument/);
});
