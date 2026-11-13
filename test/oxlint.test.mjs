import assert from "node:assert/strict";
import { test } from "node:test";
import { lint, project } from "./project.mjs";

/** The rule alone, loaded the way a project loads it: "wow/oxlint" through the package's exports. */
const oxlintrc = (rule, options) => ({
  categories: { correctness: "off" },
  jsPlugins: ["wow/oxlint"],
  rules: { [`wow/${rule}`]: options ? ["error", options] : "error" },
});
const lines = (...list) => list.join("\n");

// Each rule: a fixture that must fail with these exact findings, and one that must pass.
const CASES = [
  {
    rule: "require-disable-reason",
    file: "a.js",
    fails: lines(
      "// oxlint-disable-next-line no-console",
      "console.log(1);",
      "/* eslint-disable no-alert */",
      "alert(1); // eslint-disable-line no-alert --",
      "/** oxlint-disable */",
    ),
    found: ["1:1", "3:1", "4:11", "5:1"].map(
      (at) => `${at} Say why the rule is off: \`oxlint-disable-next-line <rule> -- <reason>\`.`,
    ),
    passes: lines(
      "// oxlint-disable-next-line no-console -- the CLI prints its result",
      "console.log(1);",
      "/* eslint-disable no-alert -- the demo is an alert */",
      "// a note about oxlint-disable that disables nothing",
    ),
  },
  {
    rule: "no-low-value-comments",
    file: "a.ts",
    fails: lines(
      "// ----- Setup -----",
      "const a = 1;",
      "// arrange",
      "const b = 2;",
      "// TODO make this faster",
      "const c = 3;",
      "/** @param {string} name */",
      "function d(name: string) { return name; }",
      "/** @returns */",
      "function e() { return 1; }",
      "// const x = load();",
      "const f = 4;",
      "// Get the user name",
      'export const getUserName = () => a + b + c + f + d("x") + e();',
    ),
    found: [
      "1:1 Drop the section divider; split the file or let the code's structure show the grouping.",
      "3:1 Drop the test step label.",
      "5:1 Link the issue that tracks this, or drop the marker.",
      "7:1 Drop the JSDoc type; TypeScript already has it.",
      "9:1 Drop the JSDoc tag that has no description.",
      "11:1 Delete commented-out code; git keeps the history.",
      "13:1 Drop the comment; it only repeats the name below it. Say why, or say nothing.",
    ],
    passes: lines(
      "// TODO(#123) make this faster",
      "const a = 1;",
      "// Retries once, since the first call warms the cache.",
      "export const getUserName = () => a;",
      "/** @param name the user's handle, without the @ */",
      "export const greet = (name: string) => name;",
    ),
  },
  {
    rule: "no-silent-catch",
    file: "a.js",
    fails: lines(
      "try { a(); b(); } catch (error) {}",
      "try { a(); b(); } catch {}",
      "p.catch(() => {});",
      "useMutation({ onError: (error) => {} });",
    ),
    found: ["1:19", "2:19", "3:9", "4:24"].map(
      (at) =>
        `${at} This drops the error. Rethrow it, report it or show it; narrow the try to the one call that may fail on bad input.`,
    ),
    passes: lines(
      "try { JSON.parse(s); } catch {}",
      "try { a(); b(); } catch (error) { report(error); }",
      "try { a(); b(); } catch (error) { throw error; }",
      "p.catch((error) => show(error));",
      "try { a(); b(); } catch (error) { console.error(error); }",
    ),
  },
  {
    rule: "no-silent-catch",
    options: { throwers: ["fail"], consoleHandles: false },
    file: "a.js",
    fails: "try { a(); b(); } catch (error) { console.error(error); }",
    found: [
      "1:19 This drops the error. Rethrow it, report it or show it; narrow the try to the one call that may fail on bad input.",
    ],
    passes: 'try { a(); b(); } catch { fail("bad input"); }',
  },
  {
    rule: "no-catch-around-own-writes",
    file: "a.ts",
    fails: lines(
      "export async function f(ctx) {",
      "  try {",
      "    await ctx.runMutation(api.x, {});",
      "  } catch {",
      "    return null;",
      "  }",
      "}",
    ),
    found: [
      "2:7 This try covers ctx.runMutation, our own code, and its catch doesn't rethrow: a bug in it reads as the failure the catch was written for. Narrow the try to the call that can fail.",
    ],
    passes: lines(
      "export async function f(ctx) {",
      "  try {",
      "    await ctx.runQuery(api.y, {});",
      "  } catch (error) {",
      "    throw error;",
      "  }",
      "  try { await fetch(u); } catch { return null; }",
      "}",
    ),
  },
  {
    rule: "no-double-cast",
    file: "a.ts",
    fails: lines("export const a = x as unknown as string;", "export const b = y as never;"),
    found: [
      "1:18 `as unknown as` turns off the type check. Move it into a named function at the boundary that says why the value is that type, or disable this line with the reason.",
      "2:18 `as never` fits anything, so nothing is checked. Type the value, or disable this line with the reason.",
    ],
    passes: lines("export const a = x as string;", "export const b = y as unknown;"),
  },
  {
    rule: "no-any-returns",
    file: "a.ts",
    fails: lines(
      "export const f = query({ returns: v.any(), handler: () => 1 });",
      "export const g = query({ returns: v.union(v.string(), v.any()), handler: () => 1 });",
    ),
    found: ["1:35", "2:35"].map(
      (at) =>
        `${at} \`returns: v.any()\` leaves callers to cast the result to a type nobody checks. Write the validator (or reuse the table's), so the return is checked and typed.`,
    ),
    passes: lines(
      "export const f = query({ returns: v.string(), handler: () => 1 });",
      "export const g = query({ returns: v.union(v.string(), v.null()), handler: () => 1 });",
    ),
  },
];

for (const { rule, options, file, fails, found, passes } of CASES) {
  const named = options ? `${rule} ${JSON.stringify(options)}` : rule;
  test(`${named}: the planted break fails`, () => {
    const root = project({ ".oxlintrc.json": oxlintrc(rule, options), [file]: fails });
    const code = `wow(${rule}) `;
    assert.deepEqual(
      lint(root, file),
      found.map((f) => f.replace(" ", ` ${code}`)),
    );
  });
  test(`${named}: the fixed code passes`, () => {
    const root = project({ ".oxlintrc.json": oxlintrc(rule, options), [file]: passes });
    assert.deepEqual(lint(root, file), []);
  });
}
