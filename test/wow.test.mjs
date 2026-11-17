// wow follows itself: its own guards pass on it, and every "wow N" in its docs names a principle.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { guard, WOW } from "./project.mjs";

test("wow passes every guard it ships (wow 10)", () => {
  assert.deepEqual(guard(WOW, "all"), {
    status: 0,
    stdout: [
      "wow-guard deps: every dependency is in dependencies.json with a reason",
      "wow-guard dashes: the product shows no em dash",
      "wow-guard dag: every node is sound, every dep is a node, and no cycle",
      "wow-guard needs-isaac: every item is sound, and none holds a secret",
      "wow-guard core-flows: every flow is sound, and every gap is a node still open",
      "",
    ].join("\n"),
    stderr: "",
  });
});

test("every wow N in the docs names a principle", () => {
  const read = (file) => readFileSync(join(WOW, file), "utf8");
  const principles = new Set([...read("README.md").matchAll(/^### (\d+)\. /gm)].map((m) => m[1]));
  const docs = ["README.md", ...readdirSync(join(WOW, "docs")).filter((f) => f.endsWith(".md"))];
  const unknown = docs
    .map((file) => (file === "README.md" ? file : `docs/${file}`))
    .flatMap((file) =>
      [...read(file).matchAll(/\bwow (\d+)/g)]
        .filter((m) => !principles.has(m[1]))
        .map((m) => `${file}: wow ${m[1]}`),
    );
  assert.deepEqual(unknown, []);
});
