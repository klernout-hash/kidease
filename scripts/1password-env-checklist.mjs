#!/usr/bin/env node
/**
 * Print the KidEase 1Password Environments name checklist.
 * Never prints secret values. Safe to run in CI without tokens.
 *
 *   npm run ops:1password-checklist
 *   npm run ops:1password-checklist -- --presence
 *   npm run ops:1password-checklist -- --json
 */
import {
  ENVIRONMENT_NAMES,
  GROUPS,
  VERCEL_PROJECT,
  formatChecklist,
  listedVariableNames,
  presenceReport,
} from "./1password-env-inventory.mjs";

const args = new Set(process.argv.slice(2));
const names = listedVariableNames();

if (args.has("--json")) {
  const payload = {
    vercelProject: VERCEL_PROJECT,
    environments: ENVIRONMENT_NAMES.map((item) => item.name),
    names,
    groups: GROUPS.map((group) => ({
      id: group.id,
      title: group.title,
      docs: group.docs,
      vars: group.vars.map((item) => ({
        name: item.name,
        concealed: item.concealed,
        vercel: item.vercel,
        required: item.required,
      })),
    })),
  };
  if (args.has("--presence")) {
    payload.presence = presenceReport(names);
  }
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(0);
}

const presence = args.has("--presence") ? presenceReport(names) : undefined;
process.stdout.write(`${formatChecklist(GROUPS, { presence })}\n`);
