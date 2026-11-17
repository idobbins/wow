// Every dependency in every manifest has a recorded reason in dependencies.json (wow 7), and no
// check drives a browser (wow 2). A headless browser the product runs, such as a PDF renderer, is
// allowed only as a product dependency listed under dependencies.json's "runtime" key.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

// Test runners and WebDriver: they only ever drive a browser for a check, so "runtime" can't allow them.
const BROWSER_TESTS =
  /^(@playwright\/test|jest-puppeteer|selenium-webdriver|webdriverio|webdriver|@wdio\/.*|wdio-.*|cypress|@cypress\/.*|nightwatch|@nightwatch\/.*|testcafe(-.*)?|chromedriver|geckodriver|@vitest\/browser(-.*)?|fantoccini|thirtyfour)$/;
// Headless browsers, which a product may run under "runtime".
const HEADLESS =
  /^(@playwright\/.*|playwright(-.*)?|@puppeteer\/.*|puppeteer(-.*)?|@cloudflare\/(puppeteer|playwright)|@sparticuz\/chromium(-min)?|headless_chrome|chromiumoxide)$/;
const drivesBrowser = (name) => BROWSER_TESTS.test(name) || HEADLESS.test(name);
const isMap = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/** Non-local dependency names of a Cargo.toml, those the product uses, and the tables it can't read. */
export function cargoDependencies(text, file) {
  const names = [];
  const problems = [];
  let section = null;
  let product = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const header = line.match(/^\[(.+)\]$/);
    if (header) {
      const table = header[1];
      const inline = table.match(/^(?:target\.[^.]+\.)?(?:dev-|build-)?dependencies\.([\w-]+)$/);
      section = null;
      product = !/(?:^|\.)(?:dev|build)-dependencies/.test(table);
      if (inline) names.push({ name: inline[1], local: false, product });
      else if (/^(?:target\.[^.]+\.)?(?:dev-|build-)?dependencies$/.test(table)) section = table;
      else if (table.includes("dependencies") && table !== "workspace.dependencies")
        problems.push(`${file}: can't read the [${table}] table`);
      continue;
    }
    const entry = section && line.match(/^([\w-]+)\s*=(.*)$/);
    if (entry) names.push({ name: entry[1], local: /\bpath\s*=/.test(entry[2]), product });
  }
  const remote = names.filter((d) => !d.local);
  return {
    names: remote.map((d) => d.name),
    product: remote.filter((d) => d.product).map((d) => d.name),
    problems,
  };
}

/** Every dependency name of a package.json, those not from the workspace, and the product's. */
export function npmDependencies(text) {
  const pkg = JSON.parse(text);
  const entries = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ].flatMap((key) => Object.entries(pkg[key] ?? {}));
  return {
    all: entries.map(([name]) => name),
    names: entries.filter(([, spec]) => !String(spec).startsWith("workspace:")).map(([n]) => n),
    product: Object.keys(pkg.dependencies ?? {}),
  };
}

/**
 * Problems for `manifests` ({ ecosystem, file, all, names, product }, paths relative to the project
 * root) against `record`, the parsed dependencies.json: { npm: { dir: { name: reason } }, cargo: ...,
 * runtime: { npm: ..., cargo: ... } }. A runtime entry is a headless browser's reason, in place of
 * its plain one.
 */
export function depsProblems(manifests, record) {
  const problems = [];
  const seen = new Set();
  const { runtime = {}, ...plain } = record;
  for (const { ecosystem, file, all, names, product } of manifests) {
    const dir = dirname(file);
    seen.add(`${ecosystem} ${dir}`);
    const reasons = plain[ecosystem]?.[dir];
    const browsers = runtime[ecosystem]?.[dir];
    const allowed = isMap(browsers) ? browsers : {};
    for (const name of new Set(all)) {
      if (!drivesBrowser(name)) continue;
      if (!(name in allowed))
        problems.push(`${file}: ${name} drives a browser, and browser tests are banned (wow 2)`);
      else if (BROWSER_TESTS.test(name))
        problems.push(
          `${file}: ${name} only drives browser tests, so runtime can't allow it (wow 2)`,
        );
      else if (!product.includes(name))
        problems.push(`${file}: ${name} is under runtime, so make it a product dependency (wow 2)`);
    }
    if (!reasons && !browsers) {
      problems.push(`${file}: add "${dir}" to dependencies.json under ${ecosystem}`);
      continue;
    }
    const tables = [
      ["", reasons ?? {}],
      ["runtime ", browsers ?? {}],
    ];
    const malformed = tables.filter(([, table]) => !isMap(table));
    for (const [key] of malformed)
      problems.push(
        `dependencies.json: ${key}${ecosystem} "${dir}" maps each dependency to its reason`,
      );
    if (malformed.length) continue;
    for (const name of new Set(names))
      if (!tables.some(([, table]) => name in table))
        problems.push(`${file}: ${name} is not in dependencies.json`);
    for (const [key, table] of tables)
      for (const [name, reason] of Object.entries(table)) {
        if (!names.includes(name))
          problems.push(`dependencies.json: ${key}${dir} lists ${name}, which ${file} doesn't use`);
        else if (typeof reason !== "string" || reason.trim() === "")
          problems.push(`dependencies.json: ${key}${dir} lists ${name} without a reason`);
        else if (key && !drivesBrowser(name))
          problems.push(
            `dependencies.json: runtime ${dir} lists ${name}, which drives no browser; give its reason under ${ecosystem}`,
          );
      }
  }
  for (const [key, ecosystems] of [
    ["", plain],
    ["runtime ", runtime],
  ])
    for (const [ecosystem, dirs] of Object.entries(ecosystems))
      for (const dir of Object.keys(dirs))
        if (!seen.has(`${ecosystem} ${dir}`))
          problems.push(`dependencies.json: ${key}${ecosystem} "${dir}" has no manifest`);
  return problems;
}

function manifests(root, name) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", "target"].includes(entry.name) || entry.name.startsWith(".")) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name === name) found.push(relative(root, path));
    }
  };
  walk(root);
  return found;
}

/** Problems for the project at `root`; empty when every dependency is recorded. */
export function deps(root) {
  const recordFile = join(root, "dependencies.json");
  if (!existsSync(recordFile))
    return ["dependencies.json is missing: map each manifest's directory to { name: reason }"];
  const record = JSON.parse(readFileSync(recordFile, "utf8"));
  const problems = [];
  const found = [];
  for (const file of manifests(root, "Cargo.toml")) {
    const text = readFileSync(join(root, file), "utf8");
    if (!/^\[package\]$/m.test(text)) continue;
    const { names, product, problems: unread } = cargoDependencies(text, file);
    problems.push(...unread);
    found.push({ ecosystem: "cargo", file, all: names, names, product });
  }
  for (const file of manifests(root, "package.json"))
    found.push({
      ecosystem: "npm",
      file,
      ...npmDependencies(readFileSync(join(root, file), "utf8")),
    });
  return [...problems, ...depsProblems(found, record)];
}
