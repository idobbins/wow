// The work graph in .wow/dag.jsonl (wow 13): one node per line, sorted by id, every dep a node,
// and no cycle. docs/dag.md has the format; projects query it with jq, but this check needs none.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DAG = ".wow/dag.jsonl";
const DOC = "https://github.com/idobbins/wow/blob/main/docs/dag.md";

// UTC to the second, as jq's `now | todate` writes it, so times sort as text.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
export const text = (v) => typeof v === "string" && v.trim() !== "";
export const texts = (v) => Array.isArray(v) && v.every(text);
const STATUSES = ["todo", "doing", "blocked", "done"];
const time = (v) => typeof v === "string" && ISO.test(v) && !Number.isNaN(Date.parse(v));
const TIME = "a UTC ISO 8601 time, like 2026-11-16T22:04:00Z";
const ID = [
  true,
  (v) => typeof v === "string" && /^[0-9a-z-]+$/.test(v),
  "lowercase letters, digits and hyphens",
];
// Every .wow record has these: an id that never changes, and when it was made and last changed.
export const RECORD = { id: ID, created: [true, time, TIME], updated: [true, time, TIME] };

// Each field: whether a node must have it, the test its value passes, and what the test asks for.
const FIELDS = {
  id: ID,
  title: [true, text, "non-empty text"],
  status: [true, (v) => STATUSES.includes(v), "todo, doing, blocked or done"],
  deps: [true, texts, "a list of ids"],
  files: [false, texts, "a list of paths"],
  proof: [false, text, "non-empty text"],
  waiting: [false, text, "non-empty text"],
  decisions: [
    false,
    (v) => Array.isArray(v) && v.every((d) => text(d?.by) && time(d?.at) && text(d?.text)),
    `a list of { "by", "at", "text" }, with "at" ${TIME}`,
  ],
  ...RECORD,
};

/**
 * Reads `source`, the text of `file`: one JSON object per line, sorted by unique id, each field
 * as `fields` says. `check(record, problem)` adds the file's own rules. Returns its problems and
 * its records by id, each with its line and whether every field passed.
 */
export function readRecords(file, source, fields, check) {
  const problems = [];
  const records = new Map();
  let previous = null;
  const lines = source.split("\n");
  if (lines.at(-1) === "") lines.pop();
  lines.forEach((line, i) => {
    const at = `${file}:${i + 1}:`;
    let record;
    try {
      record = JSON.parse(line);
    } catch {}
    if (typeof record !== "object" || record === null || Array.isArray(record))
      return problems.push(`${at} isn't one JSON object`);
    let sound = true;
    for (const [field, [required, ok, shape]] of Object.entries(fields)) {
      if (!(field in record)) {
        if (required) problems.push(`${at} missing "${field}"`);
        sound &&= !required;
      } else if (!ok(record[field])) {
        problems.push(`${at} "${field}" must be ${shape}`);
        sound = false;
      }
    }
    for (const field of Object.keys(record))
      if (!(field in fields)) problems.push(`${at} unknown field "${field}"`);
    check(record, (problem) => problems.push(`${at} ${problem}`));
    if (!ID[1](record.id)) return;
    if (records.has(record.id))
      return problems.push(
        `${at} id ${record.id} is on line ${records.get(record.id).line} already`,
      );
    if (previous !== null && record.id < previous)
      problems.push(`${at} id ${record.id} comes after ${previous}; sort the lines by id`);
    previous = record.id;
    records.set(record.id, { line: i + 1, record, sound });
  });
  return { problems, records };
}

/** Problems with `source`, the text of the DAG file; empty when it's sound. */
export function dagProblems(source) {
  const { problems, records } = readRecords(DAG, source, FIELDS, (node, problem) => {
    if (node.status === "done" && !("proof" in node)) problem(`a done node needs "proof"`);
    if (node.status === "blocked" && !("waiting" in node))
      problem(`a blocked node needs "waiting"`);
  });

  const nodes = new Map();
  for (const [id, { line, record, sound }] of records)
    nodes.set(id, { line, deps: sound ? record.deps : [] });
  const graph = new Map();
  for (const [id, { line, deps }] of nodes) {
    for (const dep of deps)
      if (dep === id) problems.push(`${DAG}:${line}: ${id} depends on itself`);
      else if (!nodes.has(dep))
        problems.push(`${DAG}:${line}: ${id} depends on ${dep}, which isn't a node`);
    graph.set(id, deps.filter((dep) => dep !== id && nodes.has(dep)));
  }

  // Depth first; reaching a node still on the stack closes a cycle.
  const state = new Map();
  const stack = [];
  const visit = (id) => {
    state.set(id, "open");
    stack.push(id);
    for (const dep of graph.get(id))
      if (state.get(dep) === "open")
        problems.push(`${DAG}: cycle ${[...stack.slice(stack.indexOf(dep)), dep].join(" -> ")}`);
      else if (!state.has(dep)) visit(dep);
    stack.pop();
    state.set(id, "closed");
  };
  for (const id of graph.keys()) if (!state.has(id)) visit(id);
  return problems;
}

/** `wow-guard all` skips a project without `file` yet: why, or null when it has one to check. */
export const skipWithout = (file, guard) => (root) =>
  existsSync(join(root, file))
    ? null
    : `no ${file} yet, skipped; \`wow-guard ${guard}\` requires it`;

/** Problems for the project at `root`; empty when its DAG is sound. */
export function dag(root) {
  const file = join(root, DAG);
  if (!existsSync(file))
    return [`${DAG} is missing: record the work there, one node per line (${DOC})`];
  return dagProblems(readFileSync(file, "utf8"));
}
