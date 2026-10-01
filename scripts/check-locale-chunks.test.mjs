import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { activateLocale, extraPack, isExtraLocale, loadExtraCopy } from "../src/lib/extra-copy.ts";
import { tx } from "../src/lib/copy.ts";
import { extraLocalePreloadProblems, localesInText } from "./check-locale-chunks.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("english and french do not wait on an extra language pack", async () => {
  assert.equal(isExtraLocale("en"), false);
  assert.equal(isExtraLocale("fr"), false);
  assert.equal(isExtraLocale("zh"), true);
  assert.equal(tx("en", "forgotPassword"), "Forgot password?");
  assert.equal(tx("fr", "forgotPassword"), "Mot de passe oublié ?");
  assert.equal(extraPack("de"), undefined);
  assert.equal(await activateLocale("en"), true);
  assert.equal(await activateLocale("fr"), true);
  assert.equal(extraPack("zh"), undefined);
});

test("one extra language loads without the other seven", async () => {
  const pack = await loadExtraCopy("zh");
  assert.equal(tx("zh", "forgotPassword"), pack.forgotPassword);
  assert.equal(extraPack("es"), undefined);
  assert.equal(tx("es", "forgotPassword"), "Forgot password?");
  const es = await loadExtraCopy("es");
  assert.match(es.forgotPassword, /contraseña/);
  assert.equal(tx("es", "forgotPassword"), es.forgotPassword);
});

test("a newer language choice cancels an older extra-pack apply", async () => {
  const first = activateLocale("de");
  const second = activateLocale("it");
  const [firstOk, secondOk] = await Promise.all([first, second]);
  assert.equal(firstOk, false);
  assert.equal(secondOk, true);
});

test("client shell must not preload extra language packs", () => {
  const zh = "忘记密码？";
  const de = "Passwort vergessen?";
  assert.deepEqual(localesInText(`<h1>${zh}</h1>`), ["zh"]);
  assert.deepEqual(
    extraLocalePreloadProblems({
      html: `<link rel="modulepreload" href="/assets/locale-zh-abc.js">`,
      assets: [{ name: "locale-zh-abc.js", text: zh }],
    }),
    ["locale-zh-abc.js is preloaded with zh"],
  );
  assert.deepEqual(
    extraLocalePreloadProblems({
      html: `<script type="module" src="/assets/index-abc.js"></script>`,
      assets: [
        { name: "index-abc.js", text: "english" },
        { name: "locale-zh-abc.js", text: zh },
        { name: "locale-de-abc.js", text: de },
      ],
    }),
    [],
  );
  assert.deepEqual(
    extraLocalePreloadProblems({
      html: "",
      assets: [{ name: "copy-abc.js", text: `${zh} ${de}` }],
    }),
    ["copy-abc.js bundles zh,de"],
  );
  const extra = readFileSync(join(root, "src/lib/extra-copy.ts"), "utf8");
  assert.doesNotMatch(extra, /^import \w+ from "\.\/i18n\//m);
  assert.match(extra, /import\("\.\/i18n\/zh\.json"/);
  const boot = readFileSync(join(root, "src/components/native-boot.tsx"), "utf8");
  const select = readFileSync(join(root, "src/components/language-select.tsx"), "utf8");
  assert.match(boot, /isExtraLocale\(saved\)/);
  assert.match(boot, /activateLocale\(saved\)/);
  assert.match(select, /activateLocale\(next\)/);
  assert.match(readFileSync(join(root, "package.json"), "utf8"), /check-locale-chunks\.mjs/);
});
