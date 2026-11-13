import assert from "node:assert/strict";
import { test } from "node:test";
import { lint, project } from "./project.mjs";

// Loaded the way a project loads it: "wow/oxlint" through the package's exports.
const OXLINTRC = {
  categories: { correctness: "off" },
  jsPlugins: ["wow/oxlint"],
  rules: { "wow/require-disable-reason": "error" },
};
const MISSING =
  "wow(require-disable-reason) Say why the rule is off: `oxlint-disable-next-line <rule> -- <reason>`.";

test("require-disable-reason: a disable comment without a reason fails", () => {
  const root = project({
    ".oxlintrc.json": OXLINTRC,
    "a.js": [
      "// oxlint-disable-next-line no-console",
      "console.log(1);",
      "/* eslint-disable no-alert */",
      "alert(1); // eslint-disable-line no-alert --",
      "/** oxlint-disable */",
    ].join("\n"),
  });
  assert.deepEqual(lint(root, "a.js"), [
    `1:1 ${MISSING}`,
    `3:1 ${MISSING}`,
    `4:11 ${MISSING}`,
    `5:1 ${MISSING}`,
  ]);
});

test("require-disable-reason: a disable comment with a reason passes", () => {
  const root = project({
    ".oxlintrc.json": OXLINTRC,
    "a.js": [
      "// oxlint-disable-next-line no-console -- the CLI prints its result",
      "console.log(1);",
      "/* eslint-disable no-alert -- the demo is an alert */",
      "// a note about oxlint-disable that disables nothing",
    ].join("\n"),
  });
  assert.deepEqual(lint(root, "a.js"), []);
});
