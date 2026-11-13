// Every dependency in every manifest has a recorded reason in dependencies.json (wow 7), and no
// manifest names a browser automation package, whatever dependencies.json says (wow 2).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

// No opt-out: this list is checked before dependencies.json is read.
const BROWSER_AUTOMATION =
  /^(@playwright\/.*|playwright(-.*)?|@puppeteer\/.*|puppeteer(-.*)?|jest-puppeteer|selenium-webdriver|webdriverio|webdriver|@wdio\/.*|wdio-.*|cypress|@cypress\/.*|nightwatch|@nightwatch\/.*|testcafe(-.*)?|chromedriver|geckodriver|@vitest\/browser(-.*)?|fantoccini|thirtyfour|headless_chrome|chromiumoxide)$/;

/** Non-local dependency names of a Cargo.toml, and the tables it can't read. */
export function cargoDependencies(text, file) {
  const names = [];
  const problems = [];
  let section = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const header = line.match(/^\[(.+)\]$/);
    if (header) {
      const table = header[1];
      const inline = table.match(/^(?:target\.[^.]+\.)?(?:dev-|build-)?dependencies\.([\w-]+)$/);
      section = null;
      if (inline) names.push({ name: inline[1], local: false });
      else if (/^(?:target\.[^.]+\.)?(?:dev-|build-)?dependencies$/.test(table)) section = table;
      else if (table.includes("dependencies") && table !== "workspace.dependencies")
        problems.push(`${file}: can't read the [${table}] table`);
      continue;
    }
    const entry = section && line.match(/^([\w-]+)\s*=(.*)$/);
    if (entry) names.push({ name: entry[1], local: /\bpath\s*=/.test(entry[2]) });
  }
  return { names: names.filter((d) => !d.local).map((d) => d.name), problems };
}

/** Every dependency name of a package.json, and which of them are workspace packages. */
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
  };
}

/**
 * Problems for `manifests` ({ ecosystem, file, all, names }, paths relative to the project root)
 * against `record`, the parsed dependencies.json: { npm: { dir: { name: reason } }, cargo: ... }.
 */
export function depsProblems(manifests, record) {
  const problems = [];
  const seen = new Set();
  for (const { ecosystem, file, all, names } of manifests) {
    for (const name of new Set(all))
      if (BROWSER_AUTOMATION.test(name))
        problems.push(`${file}: ${name} drives a browser, and browser tests are banned (wow 2)`);
    const dir = dirname(file);
    seen.add(`${ecosystem} ${dir}`);
    const reasons = record[ecosystem]?.[dir];
    if (!reasons) {
      problems.push(`${file}: add "${dir}" to dependencies.json under ${ecosystem}`);
      continue;
    }
    if (typeof reasons !== "object" || Array.isArray(reasons)) {
      problems.push(`dependencies.json: ${ecosystem} "${dir}" maps each dependency to its reason`);
      continue;
    }
    for (const name of new Set(names))
      if (!(name in reasons)) problems.push(`${file}: ${name} is not in dependencies.json`);
    for (const [name, reason] of Object.entries(reasons)) {
      if (!names.includes(name))
        problems.push(`dependencies.json: ${dir} lists ${name}, which ${file} doesn't use`);
      else if (typeof reason !== "string" || reason.trim() === "")
        problems.push(`dependencies.json: ${dir} lists ${name} without a reason`);
    }
  }
  for (const [ecosystem, dirs] of Object.entries(record))
    for (const dir of Object.keys(dirs))
      if (!seen.has(`${ecosystem} ${dir}`))
        problems.push(`dependencies.json: ${ecosystem} "${dir}" has no manifest`);
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
    const cargo = cargoDependencies(text, file);
    problems.push(...cargo.problems);
    found.push({ ecosystem: "cargo", file, all: cargo.names, names: cargo.names });
  }
  for (const file of manifests(root, "package.json"))
    found.push({
      ecosystem: "npm",
      file,
      ...npmDependencies(readFileSync(join(root, file), "utf8")),
    });
  return [...problems, ...depsProblems(found, record)];
}
