// The work graph in .wow/dag.jsonl (wow 13): one node per line, sorted by id, every dep a node,
// and no cycle. docs/dag.md has the format; projects query it with jq, but this check needs none.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DAG = ".wow/dag.jsonl";
const DOC = "https://github.com/idobbins/wow/blob/main/docs/dag.md";

// UTC to the second, as jq's `now | todate` writes it, so times sort as text.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const text = (v) => typeof v === "string" && v.trim() !== "";
const texts = (v) => Array.isArray(v) && v.every(text);
const STATUSES = ["todo", "doing", "blocked", "done"];
const time = (v) => typeof v === "string" && ISO.test(v) && !Number.isNaN(Date.parse(v));
const TIME = "a UTC ISO 8601 time, like 2026-11-16T22:04:00Z";

// Each field: whether a node must have it, the test its value passes, and what the test asks for.
const FIELDS = {
  id: [
    true,
    (v) => typeof v === "string" && /^[0-9a-z-]+$/.test(v),
    "lowercase letters, digits and hyphens",
  ],
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
  created: [true, time, TIME],
  updated: [true, time, TIME],
};

/** Problems with `source`, the text of the DAG file; empty when it's sound. */
export function dagProblems(source) {
  const problems = [];
  const nodes = new Map();
  let previous = null;
  const lines = source.split("\n");
  if (lines.at(-1) === "") lines.pop();
  lines.forEach((line, i) => {
    const at = `${DAG}:${i + 1}:`;
    let node;
    try {
      node = JSON.parse(line);
    } catch {}
    if (typeof node !== "object" || node === null || Array.isArray(node))
      return problems.push(`${at} isn't one JSON object`);
    let sound = true;
    for (const [field, [required, ok, shape]] of Object.entries(FIELDS)) {
      if (!(field in node)) {
        if (required) problems.push(`${at} missing "${field}"`);
        sound &&= !required;
      } else if (!ok(node[field])) {
        problems.push(`${at} "${field}" must be ${shape}`);
        sound = false;
      }
    }
    for (const field of Object.keys(node))
      if (!(field in FIELDS)) problems.push(`${at} unknown field "${field}"`);
    if (node.status === "done" && !("proof" in node))
      problems.push(`${at} a done node needs "proof"`);
    if (node.status === "blocked" && !("waiting" in node))
      problems.push(`${at} a blocked node needs "waiting"`);
    if (!FIELDS.id[1](node.id)) return;
    if (nodes.has(node.id))
      return problems.push(`${at} id ${node.id} is on line ${nodes.get(node.id).line} already`);
    if (previous !== null && node.id < previous)
      problems.push(`${at} id ${node.id} comes after ${previous}; sort the lines by id`);
    previous = node.id;
    nodes.set(node.id, { line: i + 1, deps: sound ? node.deps : [] });
  });

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

/** Why `wow-guard all` skips the project at `root`, or null when it has a DAG to check. */
export const dagSkip = (root) =>
  existsSync(join(root, DAG)) ? null : `no ${DAG} yet, skipped; \`wow-guard dag\` requires it`;

/** Problems for the project at `root`; empty when its DAG is sound. */
export function dag(root) {
  const file = join(root, DAG);
  if (!existsSync(file))
    return [`${DAG} is missing: record the work there, one node per line (${DOC})`];
  return dagProblems(readFileSync(file, "utf8"));
}
