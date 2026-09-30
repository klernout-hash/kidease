import assert from "node:assert/strict";
import { test } from "node:test";
import { bumpGradle, bumpPbxproj, parseBumpArgs } from "./bump-native-version.mjs";

test("bump writes the same version into gradle and Xcode", () => {
  assert.deepEqual(parseBumpArgs(["--version", "1.0.1", "--build", "2"]), { version: "1.0.1", build: "2" });
  const gradle = bumpGradle('versionCode 1\nversionName "1.0.0"\n', "1.0.1", "2");
  assert.match(gradle, /versionCode 2/);
  assert.match(gradle, /versionName "1.0.1"/);
  const pbx = bumpPbxproj("MARKETING_VERSION = 1.0.0;\nCURRENT_PROJECT_VERSION = 1;\n", "1.0.1", "2");
  assert.match(pbx, /MARKETING_VERSION = 1.0.1;/);
  assert.match(pbx, /CURRENT_PROJECT_VERSION = 2;/);
});
