import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { project, ratchet } from "./project.mjs";

// The project's own oxlint, with one rule so the counts are easy to plant.
const OXLINTRC = { categories: { correctness: "off" }, rules: { "no-debugger": "error" } };
const PKG = { wow: { ratchet: { budgets: "lint/grandfathered", groups: ["sub"] } } };
const BUDGET = "lint/grandfathered/no-debugger.json";
const budget = (counts) => `${JSON.stringify({ rule: "no-debugger", counts }, null, 2)}\n`;
const debuggers = (n) => "debugger;\n".repeat(n);
const finding = (file, line) =>
  `${file}:${line}:1: no-debugger: \`debugger\` statement is not allowed\n  help: Remove the debugger statement`;
const read = (root) => readFileSync(join(root, BUDGET), "utf8");
const lines = (...list) => `${list.join("\n")}\n`;

test("--seed records a new rule's counts, which then hold", () => {
  const root = project({
    "package.json": PKG,
    ".oxlintrc.json": OXLINTRC,
    "a.js": debuggers(2),
    "sub/b.js": debuggers(1),
  });
  assert.deepEqual(ratchet(root, "--seed=no-debugger"), {
    status: 0,
    stdout: "wow-ratchet: no-debugger: 3 findings in 2 files.\n",
    stderr: "",
  });
  assert.equal(read(root), budget({ "a.js": 2, "sub/b.js": 1 }));
  assert.deepEqual(ratchet(root), { status: 0, stdout: "", stderr: "" });
  assert.deepEqual(ratchet(root, "--seed=no-debugger"), {
    status: 2,
    stdout: "",
    stderr: "wow-ratchet: no-debugger has counts already; --write lowers them.\n",
  });
});

test("one more finding fails, and --write never raises a count or adds a file", () => {
  const root = project({
    "package.json": PKG,
    ".oxlintrc.json": OXLINTRC,
    [BUDGET]: budget({ "a.js": 2, "sub/b.js": 1 }),
    "a.js": debuggers(3),
    "sub/b.js": debuggers(1),
    "c.js": debuggers(1),
  });
  const stderr = lines(
    finding("a.js", 1),
    finding("a.js", 2),
    finding("a.js", 3),
    finding("c.js", 1),
    "wow-ratchet: a.js has 3 no-debugger, over its budget of 2 (lint/grandfathered/). Fix the new ones; all of them are listed above.",
    "",
    "4 problems.",
  );
  assert.deepEqual(ratchet(root), { status: 1, stdout: "", stderr });
  assert.deepEqual(ratchet(root, "--write"), { status: 1, stdout: "", stderr });
  assert.equal(read(root), budget({ "a.js": 2, "sub/b.js": 1 }));
});

test("one fewer finding fails until --write lowers the count", () => {
  const root = project({
    "package.json": PKG,
    ".oxlintrc.json": OXLINTRC,
    [BUDGET]: budget({ "a.js": 2, "sub/b.js": 1 }),
    "a.js": debuggers(1),
    "sub/b.js": "",
  });
  assert.deepEqual(ratchet(root), {
    status: 1,
    stdout: "",
    stderr: lines(
      "wow-ratchet: a.js has 1 no-debugger, under its budget of 2.",
      "wow-ratchet: sub/b.js has 0 no-debugger, under its budget of 1.",
      "wow-ratchet: lower the budgets with `wow-ratchet --write` and commit lint/grandfathered/.",
    ),
  });
  assert.deepEqual(ratchet(root, "--write"), {
    status: 0,
    stdout: "",
    stderr: lines(
      "wow-ratchet: lowered a.js no-debugger: 2 -> 1.",
      "wow-ratchet: lowered sub/b.js no-debugger: 1 -> 0.",
      "wow-ratchet: commit lint/grandfathered/.",
    ),
  });
  assert.equal(read(root), budget({ "a.js": 1 }));
  assert.deepEqual(ratchet(root), { status: 0, stdout: "", stderr: "" });
});

test("an oxlint run that can't lint leaves the budgets as they were", () => {
  const root = project({
    "package.json": PKG,
    ".oxlintrc.json": { rules: { "no-such-rule": "error" } },
    [BUDGET]: budget({ "a.js": 2 }),
    "a.js": "",
  });
  const { status, stderr } = ratchet(root, "--write");
  assert.equal(status, 2);
  assert.match(stderr, /Rule 'no-such-rule' not found/);
  assert.equal(
    stderr.trimEnd().split("\n").at(-1),
    "wow-ratchet: oxlint exited 1 without a JSON report; lint/grandfathered/ is left as it was.",
  );
  assert.equal(read(root), budget({ "a.js": 2 }));
  assert.deepEqual(ratchet(project({ "package.json": {} })), {
    status: 2,
    stdout: "",
    stderr:
      'wow-ratchet: set "wow": { "ratchet": { "budgets": "lint/grandfathered" } } in package.json\n',
  });
});

// A fake oxlint that holds for 300 ms, then logs how many copies of it are running.
const FAKE_OXLINT = `#!/usr/bin/env node
const fs = require("node:fs");
const me = "running/" + process.pid;
fs.mkdirSync("running", { recursive: true });
fs.writeFileSync(me, "");
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
fs.appendFileSync("overlap.log", fs.readdirSync("running").length + "\\n");
fs.rmSync(me);
process.stdout.write('{"diagnostics":[]}');
`;
const withFake = (ratchetConfig) => {
  const root = project({
    "package.json": { wow: { ratchet: { budgets: "lint/grandfathered", ...ratchetConfig } } },
  });
  const bin = join(root, "node_modules/.bin/oxlint");
  rmSync(bin);
  writeFileSync(bin, FAKE_OXLINT, { mode: 0o755 });
  return root;
};
const overlap = (root) =>
  readFileSync(join(root, "overlap.log"), "utf8").trim().split("\n").map(Number);

test("concurrency 1, the default, never runs two oxlints at once", () => {
  const root = withFake({ groups: ["a", "b"] });
  assert.deepEqual(ratchet(root), { status: 0, stdout: "", stderr: "" });
  assert.deepEqual(overlap(root), [1, 1, 1]);
  const wide = withFake({ groups: ["a", "b"], concurrency: 3 });
  assert.deepEqual(ratchet(wide), { status: 0, stdout: "", stderr: "" });
  assert.ok(Math.max(...overlap(wide)) > 1, "concurrency 3 runs the groups side by side");
  assert.deepEqual(ratchet(withFake({ concurrency: 0 })), {
    status: 2,
    stdout: "",
    stderr:
      "wow-ratchet: wow.ratchet.concurrency is how many oxlint runs at once: a whole number, 1 or more\n",
  });
});
