import assert from "node:assert/strict";
import { test } from "node:test";
import { guard, project, WOW } from "./project.mjs";

const OK = "wow-guard needs-isaac: every item is sound, and none holds a secret\n";
const T = "2026-11-17T19:44:00Z";
const item = (id, status, more = {}) => ({
  id,
  created: T,
  updated: T,
  kind: "decision",
  title: `Item ${id}`,
  recommended: "monthly",
  options: ["monthly", "yearly"],
  detail: "Billing period for the paid plan; monthly matches the trial.",
  link: "research/review/billing.html",
  status,
  ...more,
});
// A sound ledger: one open, one done with the node that records the answer, one dropped.
const SOUND = [
  item("0001", "done", { resolved_by: "node 0012" }),
  item("0002", "open", { kind: "secret", recommended: null, options: [], link: null }),
  item("0003", "dropped", { resolved_by: "operator: not needed after 0001" }),
];
const jsonl = (items) =>
  items.map((n) => (typeof n === "string" ? n : JSON.stringify(n))).join("\n") + "\n";
const ledgerGuard = (items) =>
  guard(project({ "package.json": {}, ".wow/needs-isaac.jsonl": jsonl(items) }), "needs-isaac");
const fails = (...messages) => ({
  status: 1,
  stdout: "",
  stderr: messages.map((m) => `wow-guard needs-isaac: .wow/needs-isaac.jsonl${m}\n`).join(""),
});
const without = (n, field) => Object.fromEntries(Object.entries(n).filter(([k]) => k !== field));
const at = (i, n) => SOUND.with(i, n);
const SECRET = "looks like a secret; store it in the secret store and name where";

test("passes a sound ledger, and an empty one", () => {
  assert.deepEqual(ledgerGuard(SOUND), { status: 0, stdout: OK, stderr: "" });
  const empty = project({ "package.json": {}, ".wow/needs-isaac.jsonl": "" });
  assert.deepEqual(guard(empty, "needs-isaac"), { status: 0, stdout: OK, stderr: "" });
});

// Each rule: the sound ledger with one break planted, and the exact message it must give.
const CASES = [
  ["a line that isn't JSON", at(1, '{"id":"0002",'), fails(":2: isn't one JSON object")],
  ["a missing required field", at(1, without(SOUND[1], "detail")), fails(':2: missing "detail"')],
  ["an unknown field", at(1, { ...SOUND[1], owner: "me" }), fails(':2: unknown field "owner"')],
  [
    "a kind outside the set",
    at(1, { ...SOUND[1], kind: "question" }),
    fails(':2: "kind" must be decision, secret, action or review'),
  ],
  [
    "a status outside the set",
    at(1, { ...SOUND[1], status: "closed" }),
    fails(':2: "status" must be open, done or dropped'),
  ],
  [
    "a duplicate id",
    [...SOUND.slice(0, 2), item("0002", "open"), SOUND[2]],
    fails(":3: id 0002 is on line 2 already"),
  ],
  [
    "lines out of id order",
    [SOUND[0], SOUND[2], SOUND[1]],
    fails(":3: id 0002 comes after 0003; sort the lines by id"),
  ],
  [
    "a time that isn't UTC Z",
    at(1, { ...SOUND[1], updated: "2026-11-17T12:44:00-07:00" }),
    fails(':2: "updated" must be a UTC ISO 8601 time, like 2026-11-16T22:04:00Z'),
  ],
  [
    "detail over 300 characters",
    at(1, { ...SOUND[1], detail: "x".repeat(301) }),
    fails(':2: "detail" must be text of at most 300 characters'),
  ],
  [
    "a title over more than one line",
    at(1, { ...SOUND[1], title: "Pick a plan\nand a price" }),
    fails(':2: "title" must be one line of text'),
  ],
  [
    "a recommendation that isn't an option",
    at(0, { ...SOUND[0], recommended: "weekly" }),
    fails(':1: "recommended" must be null or one of the options'),
  ],
  [
    "a link that isn't null or a path",
    at(1, { ...SOUND[1], link: 7 }),
    fails(':2: "link" must be null or the review page\'s path'),
  ],
  [
    "a done or dropped item without resolved_by",
    [without(SOUND[0], "resolved_by"), SOUND[1], without(SOUND[2], "resolved_by")],
    fails(':1: a done item needs "resolved_by"', ':3: a dropped item needs "resolved_by"'),
  ],
  [
    "an open item with resolved_by",
    at(1, { ...SOUND[1], resolved_by: "node 0012" }),
    fails(':2: an open item has no "resolved_by"; close it or drop the field'),
  ],
  [
    "a secret by its prefix, in any field",
    [
      { ...SOUND[0], detail: "the key is sk-proj-4f9aZk2Lm8Qw7Ex1Rt5Y" },
      { ...SOUND[1], title: "Rotate ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6" },
      { ...SOUND[2], recommended: null, options: ["xoxb-1234567890-abcdefghij", "AKIAIOSFODNN7EXAMPLE"] },
    ],
    fails(`:1: "detail" ${SECRET}`, `:2: "title" ${SECRET}`, `:3: "options" ${SECRET}`),
  ],
  [
    "a long run that mixes cases and digits",
    at(1, { ...SOUND[1], detail: "set it to Zq81vX0pLk3RtY7wNb2Mc6Hd4Fj9Gs5A" }),
    fails(`:2: "detail" ${SECRET}`),
  ],
];
for (const [rule, items, expected] of CASES)
  test(`fails on ${rule}`, () => assert.deepEqual(ledgerGuard(items), expected));

test("no secret in a sha, a uuid, a path or a node id", () => {
  const plain = {
    ...SOUND[2],
    detail: "landed 3ebd76d4a1f0c2b9e8d7a6b5c4d3e2f1a0b9c8d7, run 0f8e7d6c-5b4a-4321-8fed-cba987654321",
    link: "/home/operator/research/review/grok-interop-v1-with-a-long-name.html",
  };
  assert.deepEqual(ledgerGuard(at(2, plain)), { status: 0, stdout: OK, stderr: "" });
});

test("needs-isaac requires the file", () => {
  assert.deepEqual(guard(project({ "package.json": {} }), "needs-isaac"), {
    status: 1,
    stdout: "",
    stderr:
      "wow-guard needs-isaac: .wow/needs-isaac.jsonl is missing: keep what only the operator can do there, even empty (https://github.com/idobbins/wow/blob/main/docs/operator.md)\n",
  });
});

test("wow's own ledger passes", () => {
  assert.deepEqual(guard(WOW, "needs-isaac"), { status: 0, stdout: OK, stderr: "" });
});

const ANSWER = [
  "Yes, the sign-up flow sends the invite now.",
  "",
  ...Array.from({ length: 10 }, (_, i) => `- point ${i + 1}`),
  "",
  "Isaac-only:",
  "- approve the price",
  "- and the region",
  "",
].join("\n");
const answerGuard = (text) => guard(project({ "package.json": {}, "a.md": text }), "answer", "a.md");
const answerFails = (...messages) => ({
  status: 1,
  stdout: "",
  stderr: messages.map((m) => `wow-guard answer: a.md${m}\n`).join(""),
});

test("answer passes a short answer that leads, and isn't in all", () => {
  assert.deepEqual(answerGuard(ANSWER), {
    status: 0,
    stdout: "wow-guard answer: the answer is short and leads\n",
    stderr: "",
  });
  const root = project({ "package.json": {}, ".wow/needs-isaac.jsonl": "" });
  assert.doesNotMatch(guard(root, "all").stdout, /answer/);
});

const ANSWER_CASES = [
  [
    "over 2KB",
    ANSWER + "x".repeat(2048),
    answerFails(` is ${Buffer.byteLength(ANSWER) + 2048} bytes; an answer is at most 2048, so link a review page`),
  ],
  ["a heading first", `# Answer\n${ANSWER}`, answerFails(":1: the first line must be the answer, in one sentence")],
  [
    "two sentences first",
    ANSWER.replace(".", ". It landed at noon."),
    answerFails(":1: the first line must be the answer, in one sentence"),
  ],
  [
    "eleven bullets before Isaac-only:",
    ANSWER.replace("- point 10", "- point 10\n- point 11"),
    answerFails(': 11 bullets before "Isaac-only:"; an answer has at most 10'),
  ],
];
for (const [rule, text, expected] of ANSWER_CASES)
  test(`answer fails on ${rule}`, () => assert.deepEqual(answerGuard(text), expected));

test("answer needs a path that exists", () => {
  const root = project({ "package.json": {} });
  assert.deepEqual(guard(root, "answer"), {
    status: 1,
    stdout: "",
    stderr: "wow-guard answer: name the answer file: wow-guard answer <path>\n",
  });
  assert.deepEqual(guard(root, "answer", "nope.md"), {
    status: 1,
    stdout: "",
    stderr: "wow-guard answer: nope.md is missing\n",
  });
});
