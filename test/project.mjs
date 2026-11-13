// A throwaway project on disk, and the commands a project runs against it.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after } from "node:test";

const WOW = join(import.meta.dirname, "..");
export const DASH = "\u2014";

/** Writes `files` ({ path: text or JSON value }) into a new directory, with wow installed. */
export function project(files) {
  const root = mkdtempSync(join(tmpdir(), "wow-"));
  after(() => rmSync(root, { recursive: true }));
  mkdirSync(join(root, "node_modules"));
  symlinkSync(WOW, join(root, "node_modules/wow"));
  mkdirSync(join(root, "node_modules/.bin"));
  symlinkSync(join(WOW, "node_modules/oxlint/bin/oxlint"), join(root, "node_modules/.bin/oxlint"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    const text = typeof content === "string" ? content : JSON.stringify(content);
    writeFileSync(join(root, path), text);
  }
  return root;
}

const run = (root, command, args) => {
  const { status, stdout, stderr } = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  return { status, stdout, stderr };
};

/** `wow-guard <command>` in `root`. */
export const guard = (root, command) =>
  run(root, process.execPath, [join(WOW, "bin/wow-guard.mjs"), command]);

/** `wow-ratchet <args>` in `root`. */
export const ratchet = (root, ...args) =>
  run(root, process.execPath, [join(WOW, "bin/wow-ratchet.mjs"), ...args]);

/** oxlint's diagnostics for `file` in `root`, as "line:column code message". */
export function lint(root, file) {
  const { stdout } = run(root, join(root, "node_modules/.bin/oxlint"), ["--format", "json", file]);
  return JSON.parse(stdout).diagnostics.map(
    (d) => `${d.labels[0].span.line}:${d.labels[0].span.column} ${d.code} ${d.message}`,
  );
}
