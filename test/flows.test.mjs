import assert from "node:assert/strict";
import { test } from "node:test";
import { guard, project, WOW } from "./project.mjs";

const OK = "wow-guard core-flows: every flow is sound, and every gap is a node still open\n";
const T = "2026-11-17T19:50:00Z";
const flow = (id, status, more = {}) => ({
  id,
  created: T,
  updated: T,
  title: `Flow ${id}`,
  status,
  scenarios: status === "uncovered" ? [] : [`test/${id}.test.ts`],
  ...more,
});
// A sound list: one covered, one partly covered with its gap open as 0002, one uncovered as 0003.
const SOUND = [
  flow("0001", "covered"),
  flow("0002", "partly", { node: "0002" }),
  flow("0003", "uncovered", { node: "0003" }),
];
const node = (id, status) => ({
  id,
  title: `Unit ${id}`,
  status,
  deps: [],
  ...(status === "done" ? { proof: "commit abc1234" } : {}),
  created: T,
  updated: T,
});
const DAG = [node("0001", "done"), node("0002", "todo"), node("0003", "doing")];
const jsonl = (rows) =>
  rows.map((r) => (typeof r === "string" ? r : JSON.stringify(r))).join("\n") + "\n";
const flowsGuard = (flows, dag = DAG) =>
  guard(
    project({
      "package.json": {},
      ".wow/core-flows.jsonl": jsonl(flows),
      ...(dag ? { ".wow/dag.jsonl": jsonl(dag) } : {}),
    }),
    "core-flows",
  );
const fails = (...messages) => ({
  status: 1,
  stdout: "",
  stderr: messages.map((m) => `wow-guard core-flows: .wow/core-flows.jsonl${m}\n`).join(""),
});
const without = (n, field) => Object.fromEntries(Object.entries(n).filter(([k]) => k !== field));
const at = (i, n) => SOUND.with(i, n);

test("passes a sound flow list", () => {
  assert.deepEqual(flowsGuard(SOUND), { status: 0, stdout: OK, stderr: "" });
});

// Each rule: the sound list with one break planted, and the exact message it must give.
const CASES = [
  ["a line that isn't JSON", at(1, '{"id":"0002",'), fails(":2: isn't one JSON object")],
  [
    "a missing required field",
    at(0, without(SOUND[0], "scenarios")),
    fails(':1: missing "scenarios"'),
  ],
  ["an unknown field", at(0, { ...SOUND[0], owner: "me" }), fails(':1: unknown field "owner"')],
  [
    "a status outside the set",
    at(0, { ...SOUND[0], status: "not covered" }),
    fails(':1: "status" must be covered, partly or uncovered'),
  ],
  [
    "a duplicate id",
    [SOUND[0], SOUND[1], { ...SOUND[2], id: "0002" }],
    fails(":3: id 0002 is on line 2 already"),
  ],
  [
    "lines out of id order",
    [SOUND[0], SOUND[2], SOUND[1]],
    fails(":3: id 0002 comes after 0003; sort the lines by id"),
  ],
  [
    "a time that isn't UTC Z",
    at(0, { ...SOUND[0], updated: "2026-11-17T12:50:00-07:00" }),
    fails(':1: "updated" must be a UTC ISO 8601 time, like 2026-11-16T22:04:00Z'),
  ],
  [
    "a gap without its node",
    [SOUND[0], without(SOUND[1], "node"), without(SOUND[2], "node")],
    fails(
      ':2: a partly flow needs "node", the unit that closes its gap (wow 13)',
      ':3: an uncovered flow needs "node", the unit that closes its gap (wow 13)',
    ),
  ],
  [
    "a gap whose node isn't in the graph",
    at(2, { ...SOUND[2], node: "0009" }),
    fails(":3: node 0009 isn't in .wow/dag.jsonl"),
  ],
  [
    "a gap whose node is done",
    at(1, { ...SOUND[1], node: "0001" }),
    fails(":2: node 0001 is done, so the flow is covered now, or needs a new node"),
  ],
  [
    "a covered flow that still names a node",
    at(0, { ...SOUND[0], node: "0002" }),
    fails(':1: a covered flow names no "node"; its gap is closed'),
  ],
  [
    "covered with no scenario, and uncovered with one",
    [{ ...SOUND[0], scenarios: [] }, SOUND[1], { ...SOUND[2], scenarios: ["test/x.ts"] }],
    fails(
      ":1: a covered flow names the scenarios that drive it",
      ":3: an uncovered flow has no scenarios; mark it partly",
    ),
  ],
];
for (const [rule, flows, expected] of CASES)
  test(`fails on ${rule}`, () => assert.deepEqual(flowsGuard(flows), expected));

test("a gap fails without a graph to hold its node", () => {
  assert.deepEqual(
    flowsGuard(SOUND, null),
    fails(":2: node 0002 isn't in .wow/dag.jsonl", ":3: node 0003 isn't in .wow/dag.jsonl"),
  );
});

test("core-flows requires the file; all skips a project that has none yet", () => {
  const root = project({ "package.json": {} });
  assert.deepEqual(guard(root, "core-flows"), {
    status: 1,
    stdout: "",
    stderr:
      "wow-guard core-flows: .wow/core-flows.jsonl is missing: list the core user flows there, one per line (https://github.com/idobbins/wow/blob/main/docs/reliability.md#core-flows)\n",
  });
  assert.match(
    guard(root, "all").stdout,
    /wow-guard core-flows: no \.wow\/core-flows\.jsonl yet, skipped; `wow-guard core-flows` requires it\n/,
  );
});

test("wow's own flow list passes", () => {
  assert.deepEqual(guard(WOW, "core-flows"), { status: 0, stdout: OK, stderr: "" });
});
