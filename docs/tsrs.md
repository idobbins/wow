# Moving a TypeScript repo to tsrs

Oxlint runs its type-aware rules on [tsrs](https://github.com/oxc-project/tsrs) in place of tsgolint, and tsrs replaces `tsc` and `tsgo` ([the announcement](https://oxc.rs/blog/2026-11-17-faster-type-aware-linting-with-tsrs)). Switch one repo as one unit: add the new check beside the old one, prove they agree, then remove the old one (wow 9). A repo with no TypeScript, such as a Godot game, has nothing to do.

Run on a shared machine with `RAYON_NUM_THREADS=4`, one heavy job at a time, and note `uptime` beside each timing (wow 11). `/usr/bin/time -v` gives the wall time and the maximum resident set size.

1. **Record the old check** on a clean commit: the lint run and each program's type check, as text.

   ```sh
   oxlint --threads 4 --type-aware --type-check -f unix > /tmp/old-lint.txt
   tsc --noEmit --pretty false -p <dir> >> /tmp/old-tsc.txt   # each tsconfig program
   ```

   *Check:* each exits 0, or its diagnostics are the ones already known.
2. **Move the tsconfig to TypeScript 7** if the repo is on 5 or 6. TypeScript 7 rejects the options it removed, such as `baseUrl`, an ES5 target, and AMD, UMD or System modules.

   *Check:* `tsrs --noEmit -p <dir>` reports no option error for any program.
3. **Install** the pinned pair, and leave `oxlint-tsgolint` in place for now.

   ```sh
   pnpm add -D --save-exact oxlint@1.94.0 tsrs@7.1.0-beta.tsrs2
   ```

   *Check:* `tsrs --version` names `tsrs 7.1.0-beta.tsrs2`.
4. **Run both on the same commit.** `OXLINT_TSGOLINT_PATH=node_modules/.bin/tsgolint` makes oxlint use the old backend.

   ```sh
   OXLINT_TSGOLINT_PATH=node_modules/.bin/tsgolint oxlint --threads 4 --type-aware --type-check -f unix > /tmp/old-lint.txt
   oxlint --threads 4 --type-aware --type-check -f unix > /tmp/new-lint.txt
   tsrs --noEmit --fast --checkers 4 --pretty false -p <dir> >> /tmp/new-tsc.txt   # each program
   diff /tmp/old-lint.txt /tmp/new-lint.txt; diff /tmp/old-tsc.txt /tmp/new-tsc.txt
   ```

   *Check:* both diffs are empty. Every line the old check reports must still appear. A new line has to be a real error. If one goes away with `TSRS_FAST=0` on the lint run or `--fast false` on tsrs, it comes from fast mode; [report it](https://github.com/oxc-project/tsrs/issues) and run without fast mode until it's fixed.
5. **Plant the breaks** (wow 3): a type error and a floating promise in a file oxlint lints, and a type error in a file a program checks but oxlint ignores, such as generated code, if the repo has one.

   *Check:* the new lint run fails on the first two. If it misses the third, as it does by design, the check keeps `tsrs --noEmit` for each program. Restore the files.
6. **Remove the old check.** Swap `tsc` for `tsrs` in the scripts, `tsc -b` for `tsrs -b` in a build, and remove `oxlint-tsgolint`. Remove `typescript` too, unless `pnpm why typescript` shows a tool that imports it.

   *Check:* the check passes, one planted break makes it fail, and `diff -r` of a build's output against the old build's is empty, or each difference is explained.
7. **Land it** with the timings and both diffs in the unit's proof (wow 13).

tsrs lacks `--init`, `--showConfig` and `--generateTrace`, and its `--watch` doesn't run on Windows ([compatibility](https://github.com/oxc-project/tsrs/blob/main/docs/COMPATIBILITY.md)).
