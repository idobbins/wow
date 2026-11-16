#!/usr/bin/env node
// `wow-guard deps|dashes|dag|all`, run from the project root. Config: package.json's "wow" key.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dag, dagSkip } from "../guards/dag.mjs";
import { dashes } from "../guards/dashes.mjs";
import { deps } from "../guards/deps.mjs";

const GUARDS = {
  deps: { run: (root) => deps(root), ok: "every dependency is in dependencies.json with a reason" },
  dashes: { run: (root, wow) => dashes(root, wow.dashes), ok: "the product shows no em dash" },
  // `all` skips a project with no DAG yet, so pinning a newer wow doesn't fail its loop (wow 9).
  dag: {
    run: (root) => dag(root),
    skip: dagSkip,
    ok: "every node is sound, every dep is a node, and no cycle",
  },
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
  const skipped = command === "all" && GUARDS[name].skip?.(root);
  if (skipped) {
    console.log(`wow-guard ${name}: ${skipped}`);
    continue;
  }
  const problems = GUARDS[name].run(root, wow);
  for (const problem of problems) console.error(`wow-guard ${name}: ${problem}`);
  if (problems.length === 0) console.log(`wow-guard ${name}: ${GUARDS[name].ok}`);
  failed ||= problems.length > 0;
}
process.exit(failed ? 1 : 0);
