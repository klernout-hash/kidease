/** Opt-in local build evidence; never emits a public build asset. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";

const HEAVY_SDK = /(?:^|\/)node_modules\/(?:maplibre-gl|recharts|twilio-video|@twilio\/|posthog-js|@sentry\/|monaco-editor|@tiptap\/|@ckeditor\/|lexical(?:\/|$)|quill(?:\/|$))/;
const inside = (root, file) => {
  const rel = relative(root, file);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
};
const normalizeId = (id, root) =>
  (isAbsolute(id) ? relative(root, id) : id.split(root).join("."))
    .replaceAll("\\", "/").replaceAll("\0", "virtual:");

export function buildGraph(bundle, { root, entryInputCount = null, sourceSha = null, codeModuleIds = [] } = {}) {
  const includeCode = new Set(codeModuleIds);
  const chunks = Object.values(bundle).filter((item) => item.type === "chunk").map((item) => {
    const moduleIds = Object.keys(item.modules).map((id) => normalizeId(id, root)).sort();
    const renderedModules = Object.entries(item.modules).map(([id, rendered]) => {
      const normalizedId = normalizeId(id, root);
      return {
        id: normalizedId,
        renderedLength: typeof rendered.renderedLength === "number" ? rendered.renderedLength : null,
        renderedExports: [...(rendered.renderedExports ?? [])].sort(),
        ...(includeCode.has(normalizedId) ? { code: rendered.code ?? null } : {}),
      };
    }).sort((a, b) => a.id.localeCompare(b.id));
    return {
      fileName: item.fileName, isEntry: item.isEntry, isDynamicEntry: item.isDynamicEntry,
      imports: [...item.imports].sort(), dynamicImports: [...item.dynamicImports].sort(),
      rawBytes: Buffer.byteLength(item.code), gzip9Bytes: gzipSync(item.code, { level: 9 }).length,
      moduleIds, renderedModules, heavySdkModules: moduleIds.filter((id) => HEAVY_SDK.test(id)),
    };
  }).sort((a, b) => a.fileName.localeCompare(b.fileName));
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const entries = chunks.filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName);
  const visited = new Set();
  const visit = (name) => {
    if (visited.has(name) || !byName.has(name)) return;
    visited.add(name);
    for (const imported of byName.get(name).imports) visit(imported);
  };
  for (const entry of entries) visit(entry);
  const initialChunks = chunks.filter((chunk) => visited.has(chunk.fileName));
  const moduleIds = [...new Set(initialChunks.flatMap((chunk) => chunk.moduleIds))].sort();
  const initialRendered = initialChunks.flatMap((chunk) => chunk.renderedModules);
  return {
    schemaVersion: 2, generatedAt: new Date().toISOString(), sourceSha, entryInputCount, entries,
    method: "Emitted client chunks; initial closure follows static imports only. Per-chunk gzip level 9; not navigation wire bytes or timing. Per-module rendered length/exports come from Rolldown before chunk minification; missing metadata stays null, distinct from zero. Module code is included only for explicitly requested source IDs.",
    initial: {
      chunkCount: initialChunks.length,
      rawBytes: initialChunks.reduce((sum, chunk) => sum + chunk.rawBytes, 0),
      gzip9Bytes: initialChunks.reduce((sum, chunk) => sum + chunk.gzip9Bytes, 0),
      chunkNames: initialChunks.map((chunk) => chunk.fileName), moduleIds,
      renderedModuleIds: [...new Set(initialRendered.filter((item) => item.renderedLength > 0).map((item) => item.id))].sort(),
      zeroRenderedModuleIds: [...new Set(initialRendered.filter((item) => item.renderedLength === 0).map((item) => item.id))].sort(),
      unknownRenderedModuleIds: [...new Set(initialRendered.filter((item) => item.renderedLength === null).map((item) => item.id))].sort(),
      heavySdkModules: moduleIds.filter((id) => HEAVY_SDK.test(id)),
    },
    chunks,
  };
}

export function polishBuildGraphPlugin({
  out = process.env.POLISH_BUILD_GRAPH_OUT,
  sourceSha = process.env.POLISH_SOURCE_SHA ?? null,
  codeModuleIds = (process.env.POLISH_BUILD_GRAPH_CODE_MODULES ?? "").split(",").map((id) => id.trim()).filter(Boolean),
} = {}) {
  if (!out) return undefined;
  let root = process.cwd();
  let entryInputCount = null;
  return {
    name: "kidease:polish-build-graph", apply: "build",
    applyToEnvironment: (environment) => environment.name === "client",
    configResolved(config) { root = config.root; },
    options(options) {
      const input = options.input;
      entryInputCount = typeof input === "string" ? 1 : Array.isArray(input) ? input.length : input ? Object.keys(input).length : 0;
    },
    generateBundle(options, bundle) {
      if (this.environment?.name !== "client") return;
      const file = resolve(out);
      if (!isAbsolute(out) || !inside(resolve(root, ".."), file) ||
          (options.dir && inside(resolve(root, options.dir), file)) ||
          ["public", "dist", ".output", ".vercel"].some((dir) => inside(resolve(root, dir), file))) {
        throw new Error("POLISH_BUILD_GRAPH_OUT must be an absolute task-root path outside public/build output.");
      }
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `${JSON.stringify(buildGraph(bundle, { root, entryInputCount, sourceSha, codeModuleIds }), null, 2)}\n`);
    },
  };
}
