# Linting on @nkzw/oxlint-config

Every JavaScript and TypeScript project lints on [`@nkzw/oxlint-config`](https://github.com/nkzw-tech/oxlint-config)'s `with-sorting` preset, with wow's rules and the project's own on top. Every rule in it is an error. It runs its type-aware rules on tsrs, reports unused disable comments, and adds 12 `quality/` rules against the shapes agents get wrong, such as `filter().map()` and chained casts. Switch one repo as one unit, and prove that nothing the old lint caught goes missing (wow 9).

## What the preset changes

Each of these was checked on oxlint 1.94.0 with preset 3.0.0.

- **The config is `oxlint.config.ts`.** A `.oxlintrc.json` can't extend a JS preset: oxlint refuses a package name, and can't parse a path to `index.js`. A folder may hold only one of the two files. `wow-ratchet` finds either one.
- **`extends` and `jsPlugins` share one config.** The project's `plugins` and `jsPlugins` are added to the preset's. The project's own `rules`, `categories` and `overrides` override the preset's, whatever order they appear in.
- **`extends` drops `env`.** Without `env: nkzw.env`, a `.js` file that reads `window` or `process` fails `no-undef`.
- **The preset turns rules off.** It turns off oxlint's `correctness` category and, in TypeScript files, 17 rules such as `no-dupe-keys` and `no-unreachable`. Keep the old `categories`, and turn back on, in a TypeScript override, each of those rules the old lint had on.
- **Flags it replaces.** The preset turns on `typeAware` and `reportUnusedDisableDirectives: "error"`, so `--type-aware` and `--report-unused-disable-directives-severity=error` add nothing. Passing them anyway reports nothing twice.
- **wow's rules.** `require-disable-reason` adds a reason to the unused-disable report, and `no-silent-catch` works beside `no-empty`. `no-double-cast` and `quality/no-chained-type-assertions` both report `as unknown as`, so a disable comment there names both. Keep `no-double-cast` on: only it catches a single `as never`.
- **Install.** With oxlint and tsrs it comes to 126 packages and about 100 MB, including `eslint` and `typescript` 6, which its plugins depend on. Nothing runs ESLint. npm puts `eslint` and `tsc` in `node_modules/.bin`, so scripts call `tsrs`, never `tsc`. npm refuses `tsrs@7.1.0-beta.tsrs2` against the preset's `tsrs >=0.25.0-ts7.1.0-beta` peer range, because semver doesn't match prereleases across versions. `"overrides": { "tsrs": "$tsrs" }` in `package.json` fixes it. pnpm installs it. In a TypeScript 7 repo it warns that the plugins want `typescript` below 6.1, and lint still runs. Where pnpm sets a minimum release age, it adds the preset to `minimumReleaseAgeExclude`; give that entry a reason, and remove it once the version is old enough.

## Sorting is not always behavior-preserving

`oxlint --fix` sorts keys, adds braces and fixes array types. One pass leaves some, so repeat it until the count stops falling. Sorting can change what code does. It did three times on two real repos:

- **Type inference.** Moving `isEqual` ahead of `parse` in a generic call made TypeScript infer `unknown`, and the type check failed (TS2322).
- **Run order.** Sorting wow's guard registry changed the order `wow-guard all` runs its guards, and 5 tests failed.
- **Disable comments.** Adding braces moved a call off the line under its `disable-next-line`, so the comment matched nothing and the rule fired.

So the sort lands as its own commit, and the whole loop must pass on it. Where object key order matters, put a comment line between the keys that says why: `sort-objects` doesn't sort across one. Otherwise, disable the line and give the reason.

## Steps

Use a fresh `mktemp -d` folder for output, never a fixed `/tmp` name, and run on a shared machine with `RAYON_NUM_THREADS=4` and `--threads 4` (wow 11).

1. **Record the old lint** on a clean commit, with the repo's own flags.

   ```sh
   OUT=$(mktemp -d)
   oxlint --threads 4 <the repo's flags> -f unix | grep -E '^[^ ]+:[0-9]+:[0-9]+: ' | sort > "$OUT/old.txt"
   oxlint --print-config > "$OUT/old.json"
   ```

   *Check:* it exits 0, or its findings are the ones already known.
2. **Install** the pinned three, and on npm add the `tsrs` override.

   ```sh
   pnpm add -D --save-exact oxlint@1.94.0 tsrs@7.1.0-beta.tsrs2 @nkzw/oxlint-config@3.0.0
   ```

   *Check:* `oxlint --version` is 1.94.0, and the install exits 0.
3. **Write `oxlint.config.ts`** and delete `.oxlintrc.json`. Move the old config in whole: plugins, rules, overrides, ignores and settings.

   ```ts
   import nkzw from "@nkzw/oxlint-config/with-sorting";
   import { defineConfig } from "oxlint";

   export default defineConfig({
     env: nkzw.env,
     extends: [nkzw],
     jsPlugins: ["wow/oxlint"],
     categories: { correctness: "error" }, // the old config's categories
     overrides: [
       // The old config's overrides, then each rule the preset turns off in TypeScript that the old lint had on.
       { files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"], rules: { "no-dupe-keys": "error" } },
     ],
     rules: { "wow/require-disable-reason": "error" },
   });
   ```

   *Check:* `oxlint --print-config` exits 0.
4. **Prove parity.** Run the new config the same way into `new.txt`, and compare.

   ```sh
   comm -23 "$OUT/old.txt" "$OUT/new.txt"
   ```

   *Check:* the output is empty. Compare the `rules` of `old.json` and the new `--print-config`: every rule on in the old is on in the new, in every override too.
5. **Plant the breaks** (wow 3) in a linted TypeScript file: a `filter().map()`, a floating promise, and a duplicate key.

   *Check:* the new run fails on all three. Restore the file.
6. **Land the sort** in its own commit. Run `oxlint --fix` until the count stops falling, then `oxfmt .`.

   *Check:* lint, type check and tests all pass on that commit. Fix each break by hand, as above.
7. **Seed the rest in the ratchet.** List each rule that still fails, and seed it, so new code is clean from the first day.

   ```sh
   for rule in $(pnpm wow-ratchet 2>&1 | sed -nE 's/^[^ ]+:[0-9]+:[0-9]+: ([^:]+): .*/\1/p' | sort -u); do
     pnpm wow-ratchet --seed="$rule" || break
   done
   ```

   Each seed is one full lint run, so 35 rules take a few minutes. *Check:* `pnpm wow-ratchet` exits 0, and one more planted finding of a seeded rule makes it exit 1.
8. **Drop what's redundant** and land it: remove `--type-aware` and `--report-unused-disable-directives-severity` from the scripts, and put the diff, the planted breaks and the timings in the unit's proof (wow 13).

The preset's own guide turns each newly failing rule `"off"`, then turns them back on one at a time. wow seeds them in the ratchet instead. An `"off"` rule lets new code add the same mistake until someone turns it back on. A seeded rule fails on one more finding the day it lands, and its counts only go down.
