// The core user flows in .wow/core-flows.jsonl (wow 4): each marked covered, partly or uncovered
// by scenarios, and each gap a node in .wow/dag.jsonl that isn't done yet. docs/reliability.md has
// the format.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DAG, readRecords, RECORD, text, texts } from "./dag.mjs";

export const FLOWS = ".wow/core-flows.jsonl";
const DOC = "https://github.com/idobbins/wow/blob/main/docs/reliability.md#core-flows";

const STATUSES = ["covered", "partly", "uncovered"];
const an = (status) => (status === "uncovered" ? "an uncovered" : `a ${status}`);
const FIELDS = {
  ...RECORD,
  title: [true, (v) => text(v) && !/[\r\n]/.test(v), "one line of text"],
  status: [true, (v) => STATUSES.includes(v), "covered, partly or uncovered"],
  scenarios: [true, texts, "a list of the checks that drive the flow"],
  node: [false, (v) => typeof v === "string" && /^[0-9a-z-]+$/.test(v), "a node id"],
};

/** Problems with `source`, the flow list's text, given the DAG's text or null; empty when sound. */
export function flowsProblems(source, dagSource) {
  const nodes = dagSource === null ? new Map() : readRecords(DAG, dagSource, {}, () => {}).records;
  return readRecords(FLOWS, source, FIELDS, (flow, problem) => {
    const scenarios = texts(flow.scenarios) ? flow.scenarios.length : 0;
    if (flow.status === "covered" && "node" in flow)
      problem(`a covered flow names no "node"; its gap is closed`);
    if (flow.status !== "uncovered" && texts(flow.scenarios) && scenarios === 0)
      problem(`${an(flow.status)} flow names the scenarios that drive it`);
    if (flow.status === "uncovered" && scenarios > 0)
      problem(`an uncovered flow has no scenarios; mark it partly`);
    if ((flow.status === "partly" || flow.status === "uncovered") && !("node" in flow))
      problem(`${an(flow.status)} flow needs "node", the unit that closes its gap (wow 13)`);
    if (!text(flow.node)) return;
    const node = nodes.get(flow.node)?.record;
    if (!node) problem(`node ${flow.node} isn't in ${DAG}`);
    else if (node.status === "done" && flow.status !== "covered")
      problem(`node ${flow.node} is done, so the flow is covered now, or needs a new node`);
  }).problems;
}

/** Problems for the project at `root`; empty when its flow list is sound. */
export function flows(root) {
  const file = join(root, FLOWS);
  if (!existsSync(file))
    return [`${FLOWS} is missing: list the core user flows there, one per line (${DOC})`];
  const dag = join(root, DAG);
  const dagSource = existsSync(dag) ? readFileSync(dag, "utf8") : null;
  return flowsProblems(readFileSync(file, "utf8"), dagSource);
}
