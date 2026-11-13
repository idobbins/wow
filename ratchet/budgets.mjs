// The lint ratchet's budgets: for each grandfathered rule, how many findings each file has. A file in
// the budgets folder holds one rule's counts ({ rule, counts: { file: n } }); a big rule's are split
// by workspace. Counts only go down: `wow-ratchet --write` lowers them, and nothing raises one or
// adds a file. Ported from fundlaunch-ai (lint/budgets.mjs), published with the owner's OK.
import fs from "node:fs";
import path from "node:path";

// One file stays small enough to review and to pass a commit size cap.
const SPLIT_AT = 16_000;

/** oxlint's `typescript(no-explicit-any)` as the config names it: `typescript/no-explicit-any`. */
export function ruleOf(code) {
  const found = /^([\w@/-]+)\((.+)\)$/.exec(code ?? "");
  if (!found) return code ?? "unused-disable-directive";
  const [, plugin, rule] = found;
  if (plugin === "eslint") return rule;
  if (plugin === "typescript-eslint") return `typescript/${rule}`;
  return `${plugin.replace(/^eslint-plugin-/, "")}/${rule}`;
}

/** rule → (file → the most findings it may have), from the folder `dir`. */
export function loadBudgets(dir) {
  const budgets = new Map();
  if (!fs.existsSync(dir)) return budgets;
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith(".json")) continue;
    const { rule, counts } = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    const files = budgets.get(rule) ?? new Map();
    for (const [file, n] of Object.entries(counts)) files.set(file, n);
    budgets.set(rule, files);
  }
  return budgets;
}

const slug = (s) => s.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
const workspace = (file) => {
  const parts = file.split("/");
  return ["apps", "packages"].includes(parts[0]) ? parts.slice(0, 2).join("-") : parts[0];
};

/** Writes every rule's counts into `dir`, replacing what it held. */
export function writeBudgets(dir, budgets) {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of fs.readdirSync(dir))
    if (name.endsWith(".json")) fs.rmSync(path.join(dir, name));
  for (const [rule, files] of [...budgets].sort(([a], [b]) => a.localeCompare(b))) {
    const entries = [...files].filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b));
    if (!entries.length) continue;
    const text = (list) =>
      `${JSON.stringify({ rule, counts: Object.fromEntries(list) }, null, 2)}\n`;
    if (Buffer.byteLength(text(entries)) <= SPLIT_AT) {
      fs.writeFileSync(path.join(dir, `${slug(rule)}.json`), text(entries));
      continue;
    }
    for (const [shard, list] of Map.groupBy(entries, ([file]) => workspace(file)))
      fs.writeFileSync(path.join(dir, `${slug(rule)}.${slug(shard)}.json`), text(list));
  }
}

/**
 * Splits findings ({ rule, file }) into those the budgets hold and the rest. `over` lists each
 * (rule, file) with more findings than its budget: all of them stay in `rest`, since any one may be
 * the new one. `under` lists each budget of a linted file that its findings came in below.
 */
export function applyBudgets(findings, budgets, linted) {
  const groups = Map.groupBy(findings, (f) => `${f.rule}\n${f.file}`);
  const held = [];
  const rest = [];
  const over = [];
  for (const [key, group] of groups) {
    const [rule, file] = key.split("\n");
    const budget = budgets.get(rule)?.get(file) ?? 0;
    if (group.length <= budget) held.push(...group);
    else {
      rest.push(...group);
      if (budget) over.push({ rule, file, found: group.length, budget });
    }
  }
  const under = [];
  for (const [rule, files] of budgets)
    for (const [file, budget] of files) {
      if (!linted(file)) continue;
      const found = groups.get(`${rule}\n${file}`)?.length ?? 0;
      if (found < budget) under.push({ rule, file, found, budget });
    }
  return { held, rest, over, under };
}
