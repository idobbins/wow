#!/usr/bin/env node
// `wow-guard deps|dashes|dag|needs-isaac|all`, or `wow-guard answer <path>`, run from the project
// root. Config: package.json's "wow" key.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dag, DAG, skipWithout } from "../guards/dag.mjs";
import { dashes } from "../guards/dashes.mjs";
import { deps } from "../guards/deps.mjs";
import { answer, ledger, LEDGER } from "../guards/operator.mjs";

const GUARDS = {
  deps: { run: (root) => deps(root), ok: "every dependency is in dependencies.json with a reason" },
  dashes: { run: (root, wow) => dashes(root, wow.dashes), ok: "the product shows no em dash" },
  // `all` skips a project with no DAG or ledger yet, so pinning a newer wow doesn't fail (wow 9).
  dag: {
    run: (root) => dag(root),
    skip: skipWithout(DAG, "dag"),
    ok: "every node is sound, every dep is a node, and no cycle",
  },
  "needs-isaac": {
    run: (root) => ledger(root),
    skip: skipWithout(LEDGER, "needs-isaac"),
    ok: "every item is sound, and none holds a secret",
  },
};
// Not in `all`: it checks one answer file, which lives outside the repo.
const ANSWER = {
  run: (root, wow, path) => answer(root, path),
  ok: "the answer is short and leads",
};

const [command, path] = process.argv.slice(2);
const one = GUARDS[command] || command === "answer";
const names = command === "all" ? Object.keys(GUARDS) : one ? [command] : null;
if (!names) {
  const usage = `wow-guard ${Object.keys(GUARDS).join("|")}|all, or wow-guard answer <path>`;
  console.error(`usage: ${usage}`);
  process.exit(2);
}

const root = process.cwd();
const wow = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).wow ?? {};
let failed = false;
for (const name of names) {
  const guard = GUARDS[name] ?? ANSWER;
  const skipped = command === "all" && guard.skip?.(root);
  if (skipped) {
    console.log(`wow-guard ${name}: ${skipped}`);
    continue;
  }
  const problems = guard.run(root, wow, path);
  for (const problem of problems) console.error(`wow-guard ${name}: ${problem}`);
  if (problems.length === 0) console.log(`wow-guard ${name}: ${guard.ok}`);
  failed ||= problems.length > 0;
}
process.exit(failed ? 1 : 0);
