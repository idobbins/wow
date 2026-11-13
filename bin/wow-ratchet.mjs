#!/usr/bin/env node
// The lint ratchet, run in place of a bare oxlint from the project root. It runs the project's own
// oxlint with wow.ratchet.args and the arguments it's given (paths, --fix), and fails on every
// finding but those the budgets in wow.ratchet.budgets hold. A budgeted (rule, file) must have
// exactly its count: one more fails and lists them all; one fewer fails too, until --write lowers
// the count, so the committed numbers are always the real ones.
//
//   wow-ratchet --write         lower each count to what the linted files have now
//   wow-ratchet --seed=<rule>   a new rule's counts as it lands (only a rule with none)
//
// Neither raises a count or adds a file to a rule that has counts: a file that gains a finding
// fixes it. wow.ratchet.groups lists folders linted alone, apart from the rest, since one oxlint
// checks its TypeScript programs one after another. wow.ratchet.concurrency caps how many oxlint
// runs at once (default 1): each can take gigabytes, and machines are shared (wow 11).
//
// Ported from fundlaunch-ai (lint/ratchet.mjs), published with the owner's OK.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { applyBudgets, loadBudgets, ruleOf, writeBudgets } from "../ratchet/budgets.mjs";

const ROOT = process.cwd();
const OXLINT = path.join(ROOT, "node_modules/.bin/oxlint");
const fail = (message) => {
  console.error(`wow-ratchet: ${message}`);
  process.exit(2);
};

const config = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).wow?.ratchet;
if (typeof config?.budgets !== "string")
  fail('set "wow": { "ratchet": { "budgets": "lint/grandfathered" } } in package.json');
if (!existsSync(OXLINT)) fail("no node_modules/.bin/oxlint; add oxlint as a dev dependency");
const DIR = path.join(ROOT, config.budgets);
const SHOWN = `${config.budgets}/`;
const FLAGS = config.args ?? [];
const GROUPS = config.groups ?? [];
const CONCURRENCY = config.concurrency ?? 1;
if (!Number.isInteger(CONCURRENCY) || CONCURRENCY < 1)
  fail("wow.ratchet.concurrency is how many oxlint runs at once: a whole number, 1 or more");

const args = process.argv.slice(2);
const write = args.includes("--write");
const seed = args.find((a) => a.startsWith("--seed="))?.slice("--seed=".length);
const passed = args.filter((a) => a !== "--write" && !a.startsWith("--seed="));
const paths = passed.filter((a) => !a.startsWith("-"));
if (seed && paths.length) fail("--seed counts the whole repo; pass no paths.");

/** oxlint over `targets`, as spawnSync reports a run. */
function oxlint(targets) {
  return new Promise((resolve) => {
    const child = spawn(OXLINT, [...FLAGS, ...targets, "--format=json"], { cwd: ROOT });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => resolve({ error, stdout, stderr }));
    child.on("close", (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

/**
 * oxlint's diagnostics, or why its run can't be held to the budgets. It exits 0 with no errors and
 * 1 with some, but 1 too when it couldn't lint: a bad flag, config or path. So a report counts only
 * when it parses and its errors agree with the exit; a spawn error, a signal or any other exit
 * fails before a budget is read or written.
 */
function diagnosticsOf({ error, signal, status, stdout, stderr }) {
  if (error) return { failed: `didn't run: ${error.message}` };
  if (signal) return { failed: `was killed by ${signal}` };
  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    return { failed: `exited ${status} without a JSON report`, output: stdout + stderr };
  }
  if (!Array.isArray(report?.diagnostics))
    return {
      failed: `exited ${status} with no diagnostics in its report`,
      output: stdout + stderr,
    };
  const errors = report.diagnostics.filter((d) => d.severity === "error").length;
  if (status !== (errors ? 1 : 0))
    return {
      failed: `exited ${status} with ${errors} errors in its report (0 with none, 1 with some)`,
      output: stderr,
    };
  return { diagnostics: report.diagnostics };
}

const groups = passed.length
  ? [passed]
  : [
      ...GROUPS.map((dir) => [dir]),
      [...GROUPS.flatMap((dir) => ["--ignore-pattern", `${dir}/**`]), "."],
    ];
/** `run` over `items`, at most `limit` at a time, in order. */
async function inTurns(items, limit, run) {
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await run(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
const results = (await inTurns(groups, CONCURRENCY, oxlint)).map(diagnosticsOf);
const broken = results.find((r) => r.failed);
if (broken) {
  const shown = (broken.output ?? "").trimEnd();
  if (shown) console.error(shown);
  fail(`oxlint ${broken.failed}; ${SHOWN} is left as it was.`);
}

const rel = (file) => path.relative(ROOT, path.resolve(ROOT, file)).split(path.sep).join("/");
const findings = results
  .flatMap((r) => r.diagnostics)
  .map((d) => ({
    rule: ruleOf(d.code),
    file: rel(d.filename),
    line: d.labels?.[0]?.span?.line ?? 0,
    column: d.labels?.[0]?.span?.column ?? 0,
    message: d.message,
    help: d.help,
  }));
const roots = paths.map(rel);
const linted = (file) =>
  !roots.length || roots.some((r) => r === "" || file === r || file.startsWith(`${r}/`));

const budgets = loadBudgets(DIR);
if (seed) {
  if (budgets.has(seed)) fail(`${seed} has counts already; --write lowers them.`);
  const found = findings.filter((f) => f.rule === seed);
  const files = new Map();
  for (const f of found) files.set(f.file, (files.get(f.file) ?? 0) + 1);
  budgets.set(seed, files);
  writeBudgets(DIR, budgets);
  console.log(`wow-ratchet: ${seed}: ${found.length} findings in ${files.size} files.`);
  process.exit(0);
}

const { rest, over, under } = applyBudgets(findings, budgets, linted);
if (write && under.length) {
  for (const { rule, file, found } of under) budgets.get(rule).set(file, found);
  writeBudgets(DIR, budgets);
}

rest.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
for (const f of rest) {
  console.error(`${f.file}:${f.line}:${f.column}: ${f.rule}: ${f.message}`);
  if (f.help) console.error(`  help: ${f.help}`);
}
for (const { rule, file, found, budget } of over)
  console.error(
    `wow-ratchet: ${file} has ${found} ${rule}, over its budget of ${budget} ` +
      `(${SHOWN}). Fix the new ones; all of them are listed above.`,
  );
for (const { rule, file, found, budget } of under)
  console.error(
    write
      ? `wow-ratchet: lowered ${file} ${rule}: ${budget} -> ${found}.`
      : `wow-ratchet: ${file} has ${found} ${rule}, under its budget of ${budget}.`,
  );
if (write && under.length) console.error(`wow-ratchet: commit ${SHOWN}.`);
if (!write && under.length)
  console.error(`wow-ratchet: lower the budgets with \`wow-ratchet --write\` and commit ${SHOWN}.`);
if (rest.length) console.error(`\n${rest.length} problem${rest.length === 1 ? "" : "s"}.`);
if (rest.length || (under.length && !write)) process.exit(1);
