import assert from "node:assert/strict";
import { test } from "node:test";
import { guard, project } from "./project.mjs";

const OK = "wow-guard deps: every dependency is in dependencies.json with a reason\n";
const CRATE = '[package]\nname = "a"\n\n[dependencies]\nserde = "1"\nlocal = { path = "../b" }\n';

test("passes when every dependency has a reason", () => {
  const root = project({
    "package.json": { devDependencies: { oxlint: "1.91.0" } },
    "packages/app/package.json": { dependencies: { react: "19", ui: "workspace:*" } },
    "crates/a/Cargo.toml": CRATE,
    "Cargo.toml": '[workspace]\nmembers = ["crates/a"]\n',
    "dependencies.json": {
      npm: { ".": { oxlint: "lint" }, "packages/app": { react: "the UI" } },
      cargo: { "crates/a": { serde: "the wire format" } },
    },
  });
  assert.deepEqual(guard(root, "deps"), { status: 0, stdout: OK, stderr: "" });
});

test("refuses browser automation even when dependencies.json gives a reason", () => {
  const root = project({
    "package.json": {
      devDependencies: { "@playwright/test": "1", "playwright-chromium": "1" },
      dependencies: { puppeteer: "workspace:*" },
    },
    "crates/a/Cargo.toml": '[package]\nname = "a"\n\n[dev-dependencies]\nthirtyfour = "0.35"\n',
    "dependencies.json": {
      npm: { ".": { "@playwright/test": "golden journeys", "playwright-chromium": "the browser" } },
      cargo: { "crates/a": { thirtyfour: "WebDriver" } },
    },
  });
  assert.deepEqual(guard(root, "deps"), {
    status: 1,
    stdout: "",
    stderr: [
      "wow-guard deps: crates/a/Cargo.toml: thirtyfour drives a browser, and browser tests are banned (wow 2)",
      "wow-guard deps: package.json: puppeteer drives a browser, and browser tests are banned (wow 2)",
      "wow-guard deps: package.json: @playwright/test drives a browser, and browser tests are banned (wow 2)",
      "wow-guard deps: package.json: playwright-chromium drives a browser, and browser tests are banned (wow 2)",
      "",
    ].join("\n"),
  });
});

test("every dependency is recorded with a reason, and the record can't go stale", () => {
  const root = project({
    "package.json": { dependencies: { react: "19", zod: "4", vite: "8" } },
    "apps/web/package.json": { dependencies: { lexical: "1" } },
    "crates/a/Cargo.toml": CRATE,
    "dependencies.json": {
      npm: {
        ".": { react: "the UI", zod: " ", gone: "was used" },
        "apps/old": {},
        "apps/web": ["lexical"],
      },
    },
  });
  assert.deepEqual(guard(root, "deps"), {
    status: 1,
    stdout: "",
    stderr: [
      'wow-guard deps: crates/a/Cargo.toml: add "crates/a" to dependencies.json under cargo',
      'wow-guard deps: dependencies.json: npm "apps/web" maps each dependency to its reason',
      "wow-guard deps: package.json: vite is not in dependencies.json",
      "wow-guard deps: dependencies.json: . lists zod without a reason",
      "wow-guard deps: dependencies.json: . lists gone, which package.json doesn't use",
      'wow-guard deps: dependencies.json: npm "apps/old" has no manifest',
      "",
    ].join("\n"),
  });
});

test("fails without dependencies.json", () => {
  const root = project({ "package.json": {} });
  assert.deepEqual(guard(root, "deps"), {
    status: 1,
    stdout: "",
    stderr:
      "wow-guard deps: dependencies.json is missing: map each manifest's directory to { name: reason }\n",
  });
});
