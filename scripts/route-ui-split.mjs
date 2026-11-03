/**
 * Keep route screens out of the first JavaScript download.
 *
 * TanStack Start code-splits a route component only when that function is not
 * exported. French pages import the screen from the English route file, so the
 * export stayed in the static route graph and the home page preloaded it.
 *
 * On the client build only:
 * - PascalCase function exports in route files lose `export`, so the splitter
 *   can move the screen into an async chunk.
 * - Other route files import those screens from `?ke-ui`, a second copy that
 *   loads with the French page, not with the shell.
 *
 * Source files on disk are unchanged, so route tests still read the same text.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const UI_QUERY = "ke-ui";

export function isComponentExportName(name) {
  return name !== "Route" && /^[A-Z]/.test(name) && /[a-z]/.test(name);
}

function specifierImportedName(spec) {
  const trimmed = spec.trim();
  if (!trimmed || trimmed.startsWith("type ")) return "";
  return trimmed.split(/\s+as\s+/)[0].replace(/^type\s+/, "").trim();
}

export function stripPascalFunctionExports(code) {
  return code.replace(
    /^export ((?:async )?function) ([A-Za-z0-9_]+)/gm,
    (full, kind, name) => (isComponentExportName(name) ? `${kind} ${name}` : full),
  );
}

/**
 * Move PascalCase specifiers onto `?ke-ui`. Loaders and heads stay on the
 * route module so the shell can still match the route.
 */
export function rewriteRouteUiImports(code, importerId) {
  return code.replace(
    /import\s*\{([^}]+)\}\s*from\s*(["'])([^"']+)\2/g,
    (full, specifiers, quote, source) => {
      if (source.includes(`?${UI_QUERY}`)) return full;
      if (!isRouteModuleSource(importerId, source)) return full;
      const parts = specifiers
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      const ui = [];
      const rest = [];
      for (const part of parts) {
        if (isComponentExportName(specifierImportedName(part))) ui.push(part);
        else rest.push(part);
      }
      if (!ui.length) return full;
      const lines = [];
      if (rest.length) lines.push(`import { ${rest.join(", ")} } from ${quote}${source}${quote}`);
      lines.push(`import { ${ui.join(", ")} } from ${quote}${source}?${UI_QUERY}${quote}`);
      return lines.join("\n");
    },
  );
}

export function transformRouteModule(code, importerId) {
  if (!importerId || importerId.includes(`?${UI_QUERY}`)) return code;
  if (!importerId.includes(`${path.sep}src${path.sep}routes${path.sep}`) && !importerId.includes("/src/routes/")) {
    return code;
  }
  if (importerId.includes("__root__")) return code;
  return stripPascalFunctionExports(rewriteRouteUiImports(code, importerId));
}

function isRouteModuleSource(importerId, source) {
  if (source.startsWith("@/routes/")) return true;
  if (!source.startsWith("./") && !source.startsWith("../")) return false;
  const file = importerId.split("?")[0];
  const resolved = path.normalize(path.join(path.dirname(file), source));
  return resolved.includes(`${path.sep}src${path.sep}routes${path.sep}`) || resolved.includes("/src/routes/");
}

export function routeUiSplitPlugin() {
  return {
    name: "kidease:route-ui-split",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === "client";
    },
    async resolveId(source, importer, options) {
      if (!source.includes(`?${UI_QUERY}`)) return null;
      const bare = source.replace(`?${UI_QUERY}`, "");
      const resolved = await this.resolve(bare, importer, { skipSelf: true, ...options });
      if (!resolved || resolved.external) return null;
      return `${resolved.id}?${UI_QUERY}`;
    },
    load(id) {
      if (!id.includes(`?${UI_QUERY}`)) return null;
      const file = id.split("?")[0];
      return readFileSync(file, "utf8");
    },
    transform(code, id) {
      const next = transformRouteModule(code, id);
      if (next === code) return null;
      return { code: next, map: null };
    },
  };
}
