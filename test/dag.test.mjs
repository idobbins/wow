import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { dagProblems } from "../guards/dag.mjs";
import { guard, project, WOW } from "./project.mjs";

const OK = "wow-guard dag: every node is sound, every dep is a node, and no cycle\n";
const T = "2026-11-16T22:04:00Z";
const node = (id, status, deps, more = {}) => ({
  id,
  title: `Unit ${id}`,
  status,
  deps,
  files: [`src/${id}.ts`],
  proof: `npm test fails when ${id} breaks`,
  ...more,
  created: T,
  updated: T,
});
// A sound graph: 0002 and 0003 wait on 0001, 0004 waits on both.
const SOUND = [
  node("0001", "done", []),
  node("0002", "doing", ["0001"]),
  node("0003", "blocked", ["0001"], {
    waiting: "the operator: which price?",
    decisions: [{ by: "operator", at: T, text: "Monthly, not yearly." }],
  }),
  node("0004", "todo", ["0002", "0003"]),
];
const jsonl = (nodes) =>
  nodes.map((n) => (typeof n === "string" ? n : JSON.stringify(n))).join("\n") + "\n";
const dagGuard = (nodes) =>
  guard(project({ "package.json": {}, ".wow/dag.jsonl": jsonl(nodes) }), "dag");
const fails = (...messages) => ({
  status: 1,
  stdout: "",
  stderr: messages.map((m) => `wow-guard dag: .wow/dag.jsonl${m}\n`).join(""),
});
const without = (n, field) => Object.fromEntries(Object.entries(n).filter(([k]) => k !== field));
const at = (i, n) => SOUND.with(i, n);

test("passes a sound graph", () => {
  assert.deepEqual(dagGuard(SOUND), { status: 0, stdout: OK, stderr: "" });
});

// Each rule: the sound graph with one break planted, and the exact message it must give.
const CASES = [
  [
    "a line that isn't JSON, which also loses its node",
    at(1, '{"id":"0002",'),
    fails(":2: isn't one JSON object", ":4: 0004 depends on 0002, which isn't a node"),
  ],
  ["a missing required field", at(1, without(SOUND[1], "title")), fails(':2: missing "title"')],
  [
    "a duplicate id",
    [...SOUND.slice(0, 2), node("0002", "todo", []), ...SOUND.slice(2)],
    fails(":3: id 0002 is on line 2 already"),
  ],
  [
    "a dep on a missing id",
    at(3, node("0004", "todo", ["0002", "0009"])),
    fails(":4: 0004 depends on 0009, which isn't a node"),
  ],
  ["a self-dep", at(3, node("0004", "todo", ["0004"])), fails(":4: 0004 depends on itself")],
  [
    "a cycle, printed as its path",
    at(0, node("0001", "done", ["0004"])),
    fails(": cycle 0001 -> 0004 -> 0002 -> 0001", ": cycle 0001 -> 0004 -> 0003 -> 0001"),
  ],
  [
    "a status outside the set",
    at(1, { ...SOUND[1], status: "wip" }),
    fails(':2: "status" must be todo, doing, blocked or done'),
  ],
  [
    "lines out of id order",
    [SOUND[0], SOUND[2], SOUND[1], SOUND[3]],
    fails(":3: id 0002 comes after 0003; sort the lines by id"),
  ],
  [
    "a field of the wrong shape",
    at(1, { ...SOUND[1], deps: "0001", updated: "2026-11-16T15:04:00-07:00" }),
    fails(
      ':2: "deps" must be a list of ids',
      ':2: "updated" must be a UTC ISO 8601 time, like 2026-11-16T22:04:00Z',
    ),
  ],
  ["an unknown field", at(1, { ...SOUND[1], owner: "me" }), fails(':2: unknown field "owner"')],
  [
    "a done node without proof",
    at(0, without(SOUND[0], "proof")),
    fails(':1: a done node needs "proof"'),
  ],
  [
    "a blocked node without what it waits on",
    at(2, without(SOUND[2], "waiting")),
    fails(':3: a blocked node needs "waiting"'),
  ],
];
for (const [rule, nodes, expected] of CASES)
  test(`fails on ${rule}`, () => assert.deepEqual(dagGuard(nodes), expected));

test("dag requires the file; all skips a project that has none yet", () => {
  const root = project({
    "package.json": { wow: { dashes: { roots: ["src"] } } },
    "dependencies.json": { npm: { ".": {} } },
    "src/a.ts": "export const a = 1;\n",
  });
  assert.deepEqual(guard(root, "dag"), {
    status: 1,
    stdout: "",
    stderr:
      "wow-guard dag: .wow/dag.jsonl is missing: record the work there, one node per line (https://github.com/idobbins/wow/blob/main/docs/dag.md)\n",
  });
  assert.deepEqual(guard(root, "all"), {
    status: 0,
    stdout: [
      "wow-guard deps: every dependency is in dependencies.json with a reason",
      "wow-guard dashes: the product shows no em dash",
      "wow-guard dag: no .wow/dag.jsonl yet, skipped; `wow-guard dag` requires it",
      "wow-guard needs-isaac: no .wow/needs-isaac.jsonl yet, skipped; `wow-guard needs-isaac` requires it",
      "",
    ].join("\n"),
    stderr: "",
  });
});

test("wow's own graph passes, and so does the example docs/dag.md queries", () => {
  assert.deepEqual(guard(WOW, "dag"), { status: 0, stdout: OK, stderr: "" });
  assert.deepEqual(dagProblems(readFileSync(join(WOW, "docs/dag.example.jsonl"), "utf8")), []);
});
