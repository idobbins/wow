import assert from "node:assert/strict";
import { test } from "node:test";
import { DASH, guard, project } from "./project.mjs";

const config = (dashes) => ({ wow: { dashes } });
const SHOWN = `export const Price = () => <p>Price ${DASH} none</p>;\n`;
const COMMENTED = `// The price ${DASH} or nothing.\n/**\n * ${DASH} a doc line\n */\nexport const a = 1;\n`;

test("passes when only comments and ignored files have an em dash", () => {
  const root = project({
    "package.json": config({ roots: ["src"], ignore: ["**/*.test.ts"] }),
    "src/a.tsx": COMMENTED,
    "src/deep/b.test.ts": `expect(text).toBe("a ${DASH} b");\n`,
    "other/c.ts": SHOWN,
  });
  assert.deepEqual(guard(root, "dashes"), {
    status: 0,
    stdout: "wow-guard dashes: the product shows no em dash\n",
    stderr: "",
  });
});

test("fails on an em dash the product shows, under every root", () => {
  const root = project({
    "package.json": config({ roots: ["apps/web/src", "packages/ui/src"] }),
    "apps/web/src/price.tsx": `import x from "y";\n${SHOWN}`,
    "packages/ui/src/label.ts": `export const label = \`a ${DASH} b\`;\n`,
    "packages/ui/src/notes.md": `${DASH}\n`,
  });
  assert.deepEqual(guard(root, "dashes"), {
    status: 1,
    stdout: "",
    stderr: [
      "wow-guard dashes: apps/web/src/price.tsx:2: shows an em dash, which is banned",
      "wow-guard dashes: packages/ui/src/label.ts:1: shows an em dash, which is banned",
      "",
    ].join("\n"),
  });
});

test("fails without roots, or with a root that doesn't exist", () => {
  assert.deepEqual(guard(project({ "package.json": {} }), "dashes"), {
    status: 1,
    stdout: "",
    stderr:
      'wow-guard dashes: package.json: set "wow": { "dashes": { "roots": [...] } } to what the product ships\n',
  });
  assert.deepEqual(guard(project({ "package.json": config({ roots: ["src"] }) }), "dashes"), {
    status: 1,
    stdout: "",
    stderr: "wow-guard dashes: package.json: wow.dashes.roots has src, which doesn't exist\n",
  });
});

test("all runs every guard and fails if any fails", () => {
  const root = project({
    "package.json": config({ roots: ["src"] }),
    "dependencies.json": { npm: { ".": {} } },
    "src/a.ts": SHOWN,
  });
  assert.deepEqual(guard(root, "all"), {
    status: 1,
    stdout: "wow-guard deps: every dependency is in dependencies.json with a reason\n",
    stderr: "wow-guard dashes: src/a.ts:1: shows an em dash, which is banned\n",
  });
  assert.deepEqual(guard(root, "nope"), {
    status: 2,
    stdout: "",
    stderr: "usage: wow-guard deps|dashes|all\n",
  });
});
