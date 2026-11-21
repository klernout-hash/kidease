/** Read selected UI copy as data. Never import or evaluate an application module. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const COPY_FILES = { en: "src/lib/copy-en.ts", fr: "src/lib/copy-fr.ts" };
const SUPPORT_FILE = "src/lib/support.ts";

function sourceFile(root, relative) {
  const source = readFileSync(join(root, relative), "utf8");
  const file = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (file.parseDiagnostics.length) throw new Error(`Invalid TypeScript in static copy source: ${relative}`);
  return file;
}

function unwrap(expression) {
  while (
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isParenthesizedExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  ) expression = expression.expression;
  return expression;
}

function exportedConstant(file, name) {
  const matches = [];
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if (!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (!(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) matches.push(declaration.initializer);
    }
  }
  if (matches.length !== 1 || !matches[0]) throw new Error(`Expected one exported static const ${name} in ${file.fileName}`);
  return unwrap(matches[0]);
}

function supportImportIsExact(file) {
  return file.statements.some((statement) =>
    ts.isImportDeclaration(statement) &&
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === "./support.ts" &&
    !statement.importClause?.isTypeOnly &&
    statement.importClause?.namedBindings &&
    ts.isNamedImports(statement.importClause.namedBindings) &&
    statement.importClause.namedBindings.elements.some((element) =>
      !element.isTypeOnly && !element.propertyName && element.name.text === "SUPPORT_INBOX_EMAIL",
    ),
  );
}

function literalText(expression, { file, key, supportEmail }) {
  const value = unwrap(expression);
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text;
  if (ts.isTemplateExpression(value)) {
    let text = value.head.text;
    for (const span of value.templateSpans) {
      const item = unwrap(span.expression);
      if (ts.isStringLiteral(item) || ts.isNoSubstitutionTemplateLiteral(item)) text += item.text;
      else if (ts.isIdentifier(item) && item.text === "SUPPORT_INBOX_EMAIL" && supportImportIsExact(file)) text += supportEmail;
      else throw new Error(`Nonstatic interpolation in ${file.fileName}:${key}`);
      text += span.literal.text;
    }
    return text;
  }
  throw new Error(`Nonstatic copy in ${file.fileName}:${key}`);
}

export function readSupportEmail(root) {
  const file = sourceFile(root, SUPPORT_FILE);
  const value = exportedConstant(file, "SUPPORT_INBOX_EMAIL");
  if (!ts.isStringLiteral(value) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.text)) {
    throw new Error("SUPPORT_INBOX_EMAIL must be a static email string literal");
  }
  return value.text;
}

export function readStaticCopy(root, keys) {
  if (!Array.isArray(keys) || !keys.length || keys.some((key) => typeof key !== "string" || !key)) {
    throw new Error("Static copy requires explicit nonempty string keys");
  }
  if (new Set(keys).size !== keys.length) throw new Error("Static copy keys must be unique");
  const supportEmail = readSupportEmail(root);
  const packs = {};
  for (const [locale, relative] of Object.entries(COPY_FILES)) {
    const file = sourceFile(root, relative);
    const object = exportedConstant(file, locale);
    if (!ts.isObjectLiteralExpression(object)) throw new Error(`Expected a static ${locale} copy object`);
    const properties = new Map();
    for (const property of object.properties) {
      if (!ts.isPropertyAssignment(property) || (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))) {
        throw new Error(`Unsupported property in ${relative}; static copy must not inherit or spread values`);
      }
      const key = property.name.text;
      if (properties.has(key)) throw new Error(`Duplicate copy key ${relative}:${key}`);
      properties.set(key, property.initializer);
    }
    const pack = Object.create(null);
    for (const key of keys) {
      if (!properties.has(key)) throw new Error(`Unknown copy key ${relative}:${key}`);
      pack[key] = literalText(properties.get(key), { file, key, supportEmail });
    }
    packs[locale] = Object.freeze(pack);
  }
  return Object.freeze(packs);
}

export function readStaticCopyProvenance(root) {
  return [...Object.values(COPY_FILES), SUPPORT_FILE].map((path) => {
    const source = readFileSync(join(root, path));
    return { path, sha256: createHash("sha256").update(source).digest("hex"), bytes: source.length };
  });
}
