// What reaches the operator (wow 12): the ledger of what only they can do, in
// .wow/needs-isaac.jsonl, and the answer file a coordinator writes for a request.
// docs/operator.md has both formats.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readRecords, RECORD, text, texts } from "./dag.mjs";

export const LEDGER = ".wow/needs-isaac.jsonl";
const DOC = "https://github.com/idobbins/wow/blob/main/docs/operator.md";

const KINDS = ["decision", "secret", "action", "review"];
const STATUSES = ["open", "done", "dropped"];
const maybe = (v) => v === null || text(v);
// A token's own prefix, a private key, or 32 or more token characters that mix cases and digits.
const SECRET = [
  /\bsk-[\w-]{16,}/,
  /\bgh[opsur]_\w{20,}/,
  /\bxox[abpors]-[\w-]{10,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /(?=[\w+=-]*[a-z])(?=[\w+=-]*[A-Z])(?=[\w+=-]*\d)[\w+=-]{32,}/,
];

const FIELDS = {
  ...RECORD,
  kind: [true, (v) => KINDS.includes(v), "decision, secret, action or review"],
  title: [true, (v) => text(v) && !/[\r\n]/.test(v), "one line of text"],
  recommended: [true, maybe, "null or one of the options"],
  options: [true, texts, "a list of option labels"],
  detail: [true, (v) => text(v) && [...v].length <= 300, "text of at most 300 characters"],
  link: [true, maybe, "null or the review page's path"],
  status: [true, (v) => STATUSES.includes(v), "open, done or dropped"],
  resolved_by: [false, text, "what closed it, such as the node that records the answer"],
};

/** Problems with `source`, the text of the ledger; empty when it's sound. */
export function ledgerProblems(source) {
  return readRecords(LEDGER, source, FIELDS, (item, problem) => {
    if (text(item.recommended) && texts(item.options) && !item.options.includes(item.recommended))
      problem(`"recommended" must be null or one of the options`);
    if (item.status === "open" && "resolved_by" in item)
      problem(`an open item has no "resolved_by"; close it or drop the field`);
    if ((item.status === "done" || item.status === "dropped") && !("resolved_by" in item))
      problem(`a ${item.status} item needs "resolved_by"`);
    for (const field of Object.keys(FIELDS))
      if (SECRET.some((secret) => secret.test(JSON.stringify(item[field] ?? ""))))
        problem(`"${field}" looks like a secret; store it in the secret store and name where`);
  }).problems;
}

/** Problems for the project at `root`; empty when its ledger is sound. */
export function ledger(root) {
  const file = join(root, LEDGER);
  if (!existsSync(file))
    return [`${LEDGER} is missing: keep what only the operator can do there, even empty (${DOC})`];
  return ledgerProblems(readFileSync(file, "utf8"));
}

const ONLY = "Isaac-only:";
const MAX_BYTES = 2048;
const MAX_BULLETS = 10;

/** Problems with the answer file `path`, whose text is `source`; empty when it's sound. */
export function answerProblems(path, source) {
  const problems = [];
  const bytes = Buffer.byteLength(source);
  if (bytes > MAX_BYTES)
    problems.push(
      `${path} is ${bytes} bytes; an answer is at most ${MAX_BYTES}, so link a review page`,
    );
  const [first, ...rest] = source.split("\n");
  // One sentence: text that ends a sentence once, at the end, and isn't a heading or a bullet.
  if (!/^[^\s#*>-].*[.?!]["')]*$/.test(first) || /[.?!]["')]*\s+[A-Z]/.test(first))
    problems.push(`${path}:1: the first line must be the answer, in one sentence`);
  const end = rest.findIndex((line) => line.startsWith(ONLY));
  const bullets = (end === -1 ? rest : rest.slice(0, end)).filter((l) => /^[-*] /.test(l)).length;
  if (bullets > MAX_BULLETS)
    problems.push(
      `${path}: ${bullets} bullets before "${ONLY}"; an answer has at most ${MAX_BULLETS}`,
    );
  return problems;
}

/** Problems with the answer file at `path`, relative to `root`. */
export function answer(root, path) {
  if (!path) return ["name the answer file: wow-guard answer <path>"];
  const file = resolve(root, path);
  if (!existsSync(file)) return [`${path} is missing`];
  return answerProblems(path, readFileSync(file, "utf8"));
}
