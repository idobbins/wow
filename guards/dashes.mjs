// No em dash in what the product shows. A line whose code starts with a comment marker is skipped,
// since comments aren't shown; anything else, like tests, is left out through `ignore`.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, matchesGlob, relative } from "node:path";

const DASH = "\u2014";
const SOURCE = /\.[cm]?[jt]sx?$/;

/** Every line of `text` that shows an em dash, 1-based. */
export function dashLines(text) {
  return text.split("\n").flatMap((line, n) => {
    const code = line.trimStart();
    const comment = code.startsWith("//") || code.startsWith("*") || code.startsWith("/*");
    return !comment && line.includes(DASH) ? [n + 1] : [];
  });
}

function* files(root, dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(root, path);
    else if (SOURCE.test(entry.name)) yield relative(root, path);
  }
}

/** Problems for the project at `root` under `config` ({ roots, ignore }, globs relative to root). */
export function dashes(root, config) {
  if (!Array.isArray(config?.roots) || config.roots.length === 0)
    return ['package.json: set "wow": { "dashes": { "roots": [...] } } to what the product ships'];
  const missing = config.roots.filter((dir) => !existsSync(join(root, dir)));
  if (missing.length)
    return missing.map((dir) => `package.json: wow.dashes.roots has ${dir}, which doesn't exist`);
  const ignore = config.ignore ?? [];
  return config.roots.flatMap((dir) =>
    [...files(root, join(root, dir))]
      .filter((file) => !ignore.some((glob) => matchesGlob(file, glob)))
      .flatMap((file) =>
        dashLines(readFileSync(join(root, file), "utf8")).map(
          (n) => `${file}:${n}: shows an em dash, which is banned`,
        ),
      ),
  );
}
