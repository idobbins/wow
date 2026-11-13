#!/usr/bin/env node
// `wow-guard deps|dashes|all`, run from the project root. Config is the "wow" key of package.json.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dashes } from "../guards/dashes.mjs";
import { deps } from "../guards/deps.mjs";

const GUARDS = {
  deps: { run: (root) => deps(root), ok: "every dependency is in dependencies.json with a reason" },
  dashes: { run: (root, wow) => dashes(root, wow.dashes), ok: "the product shows no em dash" },
};

const [command] = process.argv.slice(2);
const names = command === "all" ? Object.keys(GUARDS) : GUARDS[command] ? [command] : null;
if (!names) {
  console.error(`usage: wow-guard ${Object.keys(GUARDS).join("|")}|all`);
  process.exit(2);
}

const root = process.cwd();
const wow = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).wow ?? {};
let failed = false;
for (const name of names) {
  const problems = GUARDS[name].run(root, wow);
  for (const problem of problems) console.error(`wow-guard ${name}: ${problem}`);
  if (problems.length === 0) console.log(`wow-guard ${name}: ${GUARDS[name].ok}`);
  failed ||= problems.length > 0;
}
process.exit(failed ? 1 : 0);
