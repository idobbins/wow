# wow

Ways of working with agents.

Confidence comes from design, not from testing harder. Put logic where it can be proven cheaply, prove it with a few laws in about a minute, and ship to main on that. The rest is subtraction: fewer checks, tools, dependencies, flags and layers. When something stops paying for itself, remove it instead of working around it. Many agents in one codebase add entropy by default, so every change has to leave the code smaller or more coherent, and every read and byte has to be worth it.

The operator is the human running the agents. Cite a principle by number, for example "wow 3".

To use it, add this line to a project's `AGENTS.md`:

```md
Follow https://github.com/idobbins/wow. Where this AGENTS.md disagrees with it, this AGENTS.md wins.
```

## Proof

### 1. Confidence by design

*When:* writing logic that decides anything, or choosing where code lives.

Put each decision in pure, deterministic code with one home, so a few laws can prove it without the app running. If something can only be checked by driving the UI, move the logic out until it can be checked another way.

**Why:** The tempting fix for logic you can't see is to test harder at the edges. That buys a slow, flaky loop that still misses cases. Pure, deterministic logic can be checked across thousands of cases in seconds.

- **One home per decision.** Make each decision in one place and call it from everywhere else. Where two runtimes must agree, prove parity between them.
- **Deterministic.** Pass time, ids and randomness in. Never read them inside the logic.
- **No effects in the UI.** Compute during render, act in event handlers, and keep state in one store.
- **Laws, not cases.** State the few properties that must always hold. Check them with a seeded simulation over many worlds, and pin a trace for every bug you've seen.

### 2. Lean loop, no browsers

*When:* writing, keeping or reviewing a check, or adding to the validation loop.

Keep the fewest checks that give high confidence, and keep the whole loop to about a minute. No test drives a browser, ever.

**Why:** Each extra check feels like more safety. It costs time on every run until the loop is slow enough to skip. Browser automation is the worst case: it's heavy and flaky, it crashes the machines it runs on, and it stands in for logic that should have been testable (wow 1).

- **The browser ban is hard.** No Playwright, Puppeteer, WebDriver, Cypress or any other browser automation, in any project, on any machine. A guard refuses the packages. Don't keep one "just in case".
- **About a minute.** The whole loop takes about a minute, and five minutes is the hard maximum. Adding seconds is fine. Adding minutes needs the operator.
- **Earn the place.** A check goes in only if it catches a break nothing else catches. Delete checks that only repeat others.
- **Remove crutches.** When a tool is heavy or flaky, remove it. Then ask how to keep the same confidence without it, not where it can stay.

### 3. Plant the break

*When:* claiming that something works.

Every claim needs a check that fails when the thing breaks. Break it on purpose, watch the check fail, then restore it.

**Why:** A check passes when the code works, and also when the check tests nothing. Only a planted break tells you which. "It compiles", "the tests pass" and "it was reviewed" are not proof.

- Name the check that fails for each behavior, then plant exactly that break.
- Report each claim with the command and its output, not a summary.
- Briefs list the breaks to plant. After work lands, rerun its proof with a break planted before calling it done.

### 4. Outcome first

*When:* deciding what to check, or whether something is done.

Write down what the user ends up with, then check that. Don't check what the code does.

**Why:** A check written from the implementation describes the implementation, so it can't find a missing feature. A suite can stay green while signing up for an event sends no calendar invite.

- Include what happens outside the app: the email, the invite, the money moved, what another person sees.
- Compare the outcome with what the check asserts. Report an unmet outcome as a product gap, not an untested path.
- Check outcomes at the closest seam that runs without a browser (wow 1, wow 2).

## Building

### 5. Decide, then commit

*When:* a call has been made.

Carry the decision out fully. Follow its intent, not just its words.

**Why:** A hedge feels prudent. It keeps the old path alive, doubles what has to be maintained, and quietly reverses the decision.

- **No fallback.** If the decision is to remove something, remove it.
- **Object first.** Raise objections before the decision, not as a hedge built into the work.
- **New evidence, new decision.** Bring it back to the operator. Don't soften the old call.
- **Follow the intent.** When a rule's words and intent differ, follow the intent. Read where the rule came from.

### 6. Fight entropy

*When:* adding or keeping code, flags, checks, tools, layers or docs.

Many agents working in one codebase make it drift two ways: leftovers pile up, and the parts diverge. Subtract what's done, and converge on one way of doing each thing.

**Why:** Each agent solves its own task locally and correctly, and that's the trap. Adding is easier than removing, and a new helper is easier than finding the old one. Nothing breaks, but flags conflict, three patterns do one job, and the docs stop matching the code until nobody can tell what's live.

**Subtract**
- **Nothing for what's leaving.** Don't add features or checks to a layer that's going away.
- **Delete what's done.** Remove flag plumbing once a feature is solid. Remove views outside scope, and any output that shouldn't be in the repo.
- **Prefer deletion to a new layer.** The best diff is the smallest one that solves the problem.
- **No process machinery.** Don't build systems, dashboards or schedules the operator didn't ask for. An audit the operator can ask for doesn't need a system.

**Converge**
- **One way to do each thing.** When there's a way, use it. When there are two, pick one, migrate to it, and lint the other out (wow 10).
- **Reuse before writing.** Look for the existing helper, type or pattern before adding a new one.
- **Docs can't go stale.** Generate them from the code, or check them in the loop so they fail when they drift.
- **Touch only what the task needs.** Format and stage only the files you changed. File unrelated fixes instead of folding them in.
- **Leave it more coherent.** Every change leaves its area at least as consistent as it found it.

### 7. Use platforms on your own terms

*When:* adding a dependency, platform, service or integration.

Keep dependencies few. When you adopt a platform, use it the way its authors say, and wrap it in your own checks.

**Why:** A dependency is cheap to add and expensive to own, because it's one more thing to run, pay for, mock and debug. A platform's own guidance encodes failures you'd otherwise rediscover.

- **Earn the dependency.** Say what it replaces and why writing it yourself is worse, and record that.
- **Follow upstream.** Read the platform's best practices before building on it, and record them as decisions. Pin the versions you looked up.
- **Wrap it.** Every call to the platform goes through one wrapper that declares what it reads, writes and costs (wow 8).
- **One source of truth.** If a provider owns a fact, read it from the provider. Prefer reading it live to webhooks or mirrored tables.

### 8. Respect data and compute

*When:* writing anything that reads, writes, sends or runs in production.

Treat every read, write and byte as something you have to justify. Declare what each operation touches, measure the work it does, and fail the check when it does more.

**Why:** Over-reading is invisible on a small dataset and on a fast machine, so it ships. It shows up later as a slow screen, a large invoice, or one action doing ten times the reads it needs. Timings feel like a measure of this, but they vary with load, and work done per call doesn't.

- **Declare it.** Every operation declares what it reads and writes, and how many bytes it reads, writes and returns per call. Touching anything undeclared fails the check.
- **Measure work, not time.** Gate on reads, blocks, rows and bytes per call, never milliseconds, so the number is the same on every run.
- **Check at two sizes.** Run at a small size and at ten times that size. Fail when work per call grows with the data, or when a large table is scanned.
- **Read only what's used.** Fetch what the screen or the caller needs, and no more. Make the read count of a common action a gate.
- **Cost in the diff.** Turn the measured work into money and hold it to a budget, so a change that costs more shows up before it ships.
- **Never spend real money without asking.**

### 9. Widen, then narrow

*When:* changing a schema, a contract or a rollout.

Every change must be safe to deploy next to the old code and the old data.

**Why:** Work lands on main and deploys. A narrowing that works on a fresh database breaks production while old data or old callers still exist.

- Schemas and contracts only widen. New fields are optional, and type changes go through a union.
- Read both shapes, migrate to completion, then narrow in a separate, explicit step.
- New behavior ships behind a flag, and service is never interrupted.
- Make operations idempotent, so retries and partial runs end in the same state.

### 10. Rules are checks

*When:* a rule has to be said twice, or a correction keeps coming back.

Enforce the rule with something that fails, not with more prose.

**Why:** Writing the rule down again feels like fixing it. Written rules drift and get skipped. A lint holds every time, for every agent, and points to where the rule was broken.

- The second time a rule has to be said, make it a lint, guard or check.
- Examples: no em dashes in product text, no browser automation packages (wow 2), and no dependency without a recorded reason (wow 7).
- Every guard has a planted break that proves it fires (wow 3).
- Encode rules, not process (wow 6).

## Working with the operator

### 11. Confidence before velocity

*When:* deciding whether to ask, whether to ship, or whether to start more work.

Act on reversible work without asking. When confidence or the machines are at risk, stop the line. The operator decides when it restarts.

**Why:** Pushing on while the loop is broken feels like progress. It ships work nobody can vouch for, and it turns a fast night into a lost morning.

- **Do it, then report it.** Don't ask "should I do X?" about reversible work. Clear your own blockers, and fix causes instead of routing around them.
- **The operator holds the gates:** money, shipping and resuming it, deletes that reach production, approvals, and machine-level settings. When the operator says "I'll tell you", wait.
- **Stop the line.** When the loop can't be trusted, no new features ship until it's fixed.
- **Keep a sustainable pace.** Machines are shared, so check the load before launching and treat caps as limits. Stop processes only by PID, and don't trust timings taken under load. A crash is a process bug: find out why before resuming.
- **Report red right away.** Report a failure in production the moment you see it, without being asked.
- **Secrets go through a secure prompt,** never chat. Never print them.

### 12. One record, asked well

*When:* a decision is needed or has been made.

Write every decision down in one place, and put every question so it can be answered in one line.

**Why:** Deciding in conversation feels done. Those decisions get lost between threads and agents, and a question without a recommendation hands the analysis back to the operator.

- **One record.** Briefs cite decisions by number. Backfill any decision made only in conversation. Moving the record somewhere else is itself a decision.
- **Dense, numbered and recommended.** List the quickest calls first, each with a recommendation.
- **"I don't know" is an answer.** Take the recommendation, or explain the item better if it matters.
- **Never ask twice.** If it's reversible, make the call and offer a veto.
- **Report in numbers:** what landed, what's running, and what's waiting on whom.

## Toolchain

For JavaScript and TypeScript, use the [Oxc](https://oxc.rs) tools: one fast toolchain with little config, which gives the same result on every run (wow 2, wow 8). Pin exact versions and upgrade them together.

- **Lint:** oxlint. No ESLint. Move a config over with `oxlint-migrate`, and write a rule oxlint lacks as a JS plugin (`wow/oxlint` is one).
- **Format:** oxfmt. No Prettier or Biome. The loop runs `oxfmt --check .`, and `oxfmt .` fixes it.
- **Type check:** [tsrs](https://github.com/oxc-project/tsrs), the Rust port of the TypeScript 7 checker. Pin its exact version, since it ships as prereleases. No `tsc` or `tsgo`.
- **Type-aware lint:** with oxlint 1.92 or later and tsrs installed, oxlint uses tsrs in place of tsgolint. `oxlint --type-aware --type-check` lints and type-checks in one run, parsing and checking each program once, and fails on a type error. Drop the separate type-check step (wow 2).
- **Cap the threads on a shared machine** (wow 11): `RAYON_NUM_THREADS=4` for the lint run, and `--checkers 4` for `tsrs --noEmit --fast`.
- **Code that reads code:** `oxc-parser`, `oxc-resolver` and `oxc-transform`, not Babel, acorn or enhanced-resolve.
- **Running TypeScript:** `node script.ts`, with Node 24's own type stripping. Add no runner (wow 7).

## Shared checks

The rules a check can hold (wow 10) ship from this repo, so projects install them instead of copying. Pin a commit as a dev dependency: `"wow": "github:idobbins/wow#<sha>"`. Config is one `wow` key in the root `package.json`.

- **Guards.** `pnpm wow-guard all` runs each guard from the project root, or name one: `deps` or `dashes`.
- **deps.** Refuses browser automation packages in any manifest, with no opt-out (wow 2). Every other dependency needs a reason in `dependencies.json`: `{ "npm": { "apps/web": { "react": "the UI" } }, "cargo": { ... } }`, keyed by the manifest's folder (wow 7).
- **dashes.** Fails on an em dash in shipped code, outside comments: `"dashes": { "roots": ["apps/web/src"], "ignore": ["**/*.test.ts"] }`.
- **Lint.** Add `"jsPlugins": ["wow/oxlint"]` to `.oxlintrc.json` and turn rules on by name, as `"wow/no-silent-catch": "error"`. The rules: `require-disable-reason`, `no-low-value-comments`, `no-silent-catch`, `no-double-cast`, and for Convex, `no-catch-around-own-writes` and `no-any-returns`. The two catch rules take `{ "throwers": [...] }`, the calls that rethrow.
- **Ratchet.** `pnpm wow-ratchet [paths]` runs the project's own oxlint in place of a bare one. Each (rule, file) keeps exactly its budgeted count, so one more fails and one fewer fails until `wow-ratchet --write` lowers it. `--seed=<rule>` records a new rule's counts as it lands, and nothing raises one. Config: `"ratchet": { "budgets": "lint/grandfathered", "args": [...], "groups": [...], "concurrency": 1 }`. Groups are folders linted apart, and concurrency caps how many oxlint runs at once. It defaults to 1, since each run can take gigabytes on a shared machine (wow 11).
- **Proof.** `npm test` plants a break for every guard, rule and ratchet step (wow 3).
