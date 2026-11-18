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

- **One home per decision.** Make each decision in one place and call it from everywhere else. Where two runtimes must agree, prove parity between them. A type comes from its runtime validator, never a twin written by hand ([reliability](docs/reliability.md)).
- **Deterministic.** Pass time, ids and randomness in. Never read them inside the logic.
- **No effects in the UI.** Compute during render, act in event handlers, and keep state in one store.
- **Laws, not cases.** State the few properties that must always hold. Check them with a seeded simulation over many worlds, and pin a trace for every bug you've seen.

### 2. Lean loop, no browsers

*When:* writing, keeping or reviewing a check, or adding to the validation loop.

Keep the fewest checks that give high confidence, and keep the whole loop to about a minute. No test drives a browser, ever.

**Why:** Each extra check feels like more safety. It costs time on every run until the loop is slow enough to skip. Browser automation is the worst case: it's heavy and flaky, it crashes the machines it runs on, and it stands in for logic that should have been testable (wow 1).

- **The browser ban is hard.** No check drives a browser: no Playwright, Puppeteer, WebDriver, Cypress or any other browser automation, in any project, on any machine. A guard refuses the packages. Don't keep one "just in case".
- **Product code is not a check.** A feature that runs a headless browser, such as a PDF renderer, may depend on one, with its reason under `runtime` in `dependencies.json`.
- **About a minute.** The whole loop takes about a minute, and five minutes is the hard maximum. Adding seconds is fine. Adding minutes needs the operator. A check too slow for that runs once per batch, after it lands on main, never per change. A red one is bisected (wow 13).
- **The ship path has a budget too.** A unit reaches main about 15 minutes, at p50, after its proof passes. The wait counts, not just the run.
- **Earn the place.** A check goes in only if it catches a break nothing else catches. Delete checks that only repeat others.
- **Remove crutches.** When a tool is heavy or flaky, remove it. Then ask how to keep the same confidence without it, not where it can stay.

### 3. Plant the break

*When:* claiming that something works.

Every claim needs a check that fails when the thing breaks. Break it on purpose, watch the check fail, then restore it.

**Why:** A check passes when the code works, and also when the check tests nothing. Only a planted break tells you which. "It compiles", "the tests pass" and "it was reviewed" are not proof.

- Name the check that fails for each behavior, then plant exactly that break.
- Report each claim with the command and its output, not a summary. For a UI change, also attach a before and an after screenshot, taken once with your own screenshot tool. A layout read taken the same way, such as an element's box at a given width, counts as one. That's evidence, not a test, so it adds no browser script, dependency or test setup to the repo (wow 2).
- Briefs list the breaks to plant. After work lands, rerun its proof with a break planted before calling it done.

### 4. Outcome first

*When:* deciding what to check, or whether something is done.

Write down what the user ends up with, then check that. Don't check what the code does.

**Why:** A check written from the implementation describes the implementation, so it can't find a missing feature. A suite can stay green while signing up for an event sends no calendar invite.

- Include what happens outside the app: the email, the invite, the money moved, what another person sees. Include failure: a job that fails writes an error row and shows the user a failure state, never nothing.
- Compare the outcome with what the check asserts. Report an unmet outcome as a product gap, not an untested path. List the core flows in `.wow/core-flows.jsonl`, each covered, partly or uncovered, and make each gap a node (wow 13).
- Check outcomes at the closest seam that runs without a browser (wow 1, wow 2). Where an outcome crosses an outside service, such as payments, sign-in or a render service, prove our side with their recorded fixtures: their webhook replayed into our handler, our request checked against their schema, our routes against the deployed config. Never call the live service from a check.
- Production is the last check. After each deploy, and each flag or config change users see, fetch the key pages and every asset they name over HTTP, call each critical server path once as a production test account, then compare the release's client errors with the last release's for 15 minutes. Report a rise or a failed call as red (wow 11); rolling back stays the operator's call. A watch compares key events with the same hours last week and alerts a staff address on a drop to zero ([details](docs/reliability.md#production-checks)). Real users' browsers are the end-to-end check, so watch them.

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
- Examples: no em dashes in product text, no browser automation in checks (wow 2), and no dependency without a recorded reason (wow 7).
- Every guard has a planted break that proves it fires (wow 3), and runs in the loop of every project that follows the rule. A project that can't run one yet says why in its `AGENTS.md`, naming the node that ends the exception (wow 13).
- Encode rules, not process (wow 6).

## Working with the operator

### 11. Confidence before velocity

*When:* deciding whether to ask, whether to ship, or whether to start more work.

Act on reversible work without asking. When confidence or the machines are at risk, stop the line. The operator decides when it restarts.

**Why:** Pushing on while the loop is broken feels like progress. It ships work nobody can vouch for, and it turns a fast night into a lost morning.

- **Do it, then report it.** Don't ask "should I do X?" about reversible work. Clear your own blockers, and fix causes instead of routing around them.
- **The operator holds the gates:** money, secrets, one-way product decisions, sends outside the team, other changes to running services, deletes that reach production, resuming after a stop, and machine-level settings. These, and only these, go on the ledger (wow 12). Once the loop passes with proof attached (wow 3), push to main yourself; the pipeline deploys it. When the operator says "I'll tell you", wait.
- **Stop the line.** When the loop can't be trusted, no new features ship until it's fixed.
- **Keep a sustainable pace.** Machines are shared, so check the load before launching and treat caps as limits. Stop processes only by PID, and don't trust timings taken under load. A crash is a process bug: find out why before resuming.
- **Earn the cap.** Raise the cap on units in flight only while main was busy under 60% of the last working window. Past that, batch bigger or make the loop faster first (wow 13).
- **Report red right away.** Report a failure in production the moment you see it, without being asked. A scheduled check that goes red, such as a nightly or a watch, gets a node that day (wow 13). A check red three runs in a row is fixed or deleted, never left. Each incident gets a short postmortem: root cause, why the checks missed it, and its fixes as nodes ([template](docs/reliability.md#postmortems)).
- **Secrets go through a secure prompt,** never chat or a record. Never print them.

### 12. One record, asked well

*When:* a decision is needed or has been made, or anything goes to the operator.

Write every decision down in one place, and put every question so it can be answered in one line.

**Why:** Deciding in conversation feels done. Those decisions get lost between threads and agents, and a question without a recommendation hands the analysis back to the operator.

- **One record.** Decisions go in the work graph, on the node they decide (wow 13), and briefs cite them by node id. Backfill any decision made only in conversation. Moving the record somewhere else is itself a decision.
- **One ledger of what's open.** What waits on the operator's gates (wow 11) goes in `.wow/needs-isaac.jsonl`, one item per line, with a recommendation. It never holds the decision: the answer goes on the node it decides, and the item closes naming that node.
- **Answer in a file.** A request from the operator's bot gets a short answer file that leads with the answer and answers or defers every question, and the chat reply is one line naming it. Only a turn that failed, changed the ledger or went live wakes the operator, marked by its last line ([formats, paths and the digest](docs/operator.md)).
- **Dense, numbered and recommended.** List the quickest calls first, each with a recommendation.
- **Review in the thread.** T3 is the review plane. Put findings, drafts and decisions in the chat reply itself, as concise markdown. Ask decisions in question cards that stand on their own: the question, the options and the recommendation, with no links to files the card can't show. Make an HTML page only for something visual (a chart, a mockup, a diagram) or when the operator asks, and still put the substance in the reply.
- **"I don't know" is an answer.** Take the recommendation, or explain the item better if it matters.
- **Never ask twice.** If it's reversible, make the call and offer a veto.
- **Report in numbers:** what landed, what's running, and what's waiting on whom, in a daily digest the operator's bot reads.

### 13. Plan from the graph

*When:* starting, finishing or choosing work.

Each repo keeps its work as a graph in `.wow/dag.jsonl`, and its goal is done: every node done, with proof. Record a unit before it starts, and update it whenever its status changes. Plan by querying the graph with jq ([format and queries](docs/dag.md)), and build only what's ready, in waves that share no files.

**Why:** A plan kept in chat or in a separate tracker drifts from the code: links go stale, blockers hide in item text, and two agents on one file undo each other. A graph in the repo changes in the same commit as the work, and a guard checks it on every run.

- **The file is the record (wow 12).** A node lists only its true deps; ship order is a queue, not a dep. The operator's answers go in its `decisions`, verbatim, with who and when.
- **Keep it current.** Change a node in the commit that changes its status. Mark it done in the commit that lands the work, with the proof's command and output (wow 3).
- **Read, then propose.** Make a blocker named only in text a dep. Changing deps you didn't add waits for the operator's yes.
- **Ready means** todo, every dep done, a clear outcome (wow 4), known files, a planted break (wow 3), no open decision and nothing external. A node missing one of these becomes a question, ranked by what its answer unblocks (wow 12). Plan nothing else.
- **Waves build, batches ship.** Count work in flight against the cap (wow 11), and share no files with it. Start the longest piece on each goal's critical path first. Everything reaches main through one queue, usually the bottleneck, and its wait grows as 1/(1 - busy). Ship in batches: when one lands, the next takes everything waiting that shares no files and proves it once. A red batch is bisected.
- **Re-plan on events:** a unit lands or fails, an answer arrives, work comes in. Rerun the ready query. A failed unit goes back to building, never ahead.
- **One speed node.** Each graph keeps one node that owns how fast work reaches main, measured from the repo's logs: ready to main at p50 and p90, the loop at p50, the share of red batches, and how busy main is. It's done, with the latest numbers as proof, while the ship path keeps its budget (wow 2) and main stays under its busy limit (wow 11). When either breaks, it goes back to todo.

## Toolchain

For JavaScript and TypeScript, use the [Oxc](https://oxc.rs) tools: one fast toolchain with little config, which gives the same result on every run (wow 2, wow 8). Pin exact versions and upgrade them together. A repo in another language, such as a Godot game, keeps its own tools.

- **Lint:** oxlint, on the [`@nkzw/oxlint-config/with-sorting`](https://github.com/nkzw-tech/oxlint-config) preset in `oxlint.config.ts`, pinned as `@nkzw/oxlint-config@3.0.0`. Every rule in it is an error, and it runs the type-aware rules too. Rules it newly fails are seeded in the ratchet, not turned off, and the sort lands as its own commit ([steps](docs/lint.md)). No ESLint: the preset installs the package, but nothing runs it. Move a config over with `oxlint-migrate`, and write a rule oxlint lacks as a JS plugin (`wow/oxlint` is one).
- **Format:** oxfmt. No Prettier or Biome. The loop runs `oxfmt --check .`, and `oxfmt .` fixes it.
- **Type check:** [tsrs](https://github.com/oxc-project/tsrs), the Rust port of the TypeScript 7 compiler: `tsrs --noEmit` per tsconfig program, or `tsrs -b` with project references. It emits too, so builds use it. No `tsc` or `tsgo`; keep the `typescript` package only for a tool that imports it. Pin it exactly, as `tsrs@7.1.0-beta.tsrs2`: it ships only prereleases, and npm's `latest` is older.
- **Type-aware lint:** oxlint 1.92 or later finds tsrs and uses it in place of tsgolint, with the same 61 rules and options, so remove `oxlint-tsgolint`. `oxlint --type-aware --type-check` lints and type-checks in one pass, but only the files oxlint lints: not ignored or generated files, declaration files, or errors with no location. Where a program has such files, keep `tsrs --noEmit` beside it. Plant a type error in one to see (wow 3).
- **Cap the threads on a shared machine** (wow 11): `RAYON_NUM_THREADS=4`, which caps tsrs in the lint run but not oxlint itself, plus `oxlint --threads 4` and `tsrs --noEmit --fast --checkers 4`.
- **Switch on proof** (wow 9): run the old check and the new one on the same commit, and nothing the old one reports may go missing. Plant a type error and a type-aware lint violation, see the new check catch both, then remove the old one ([steps](docs/tsrs.md)).
- **Code that reads code:** `oxc-parser`, `oxc-resolver` and `oxc-transform`, not Babel, acorn or enhanced-resolve.
- **Running TypeScript:** `node script.ts`, with Node 24's own type stripping. Add no runner (wow 7).

## Shared checks

The rules a check can hold (wow 10) ship from this repo, so projects install them instead of copying. Pin a commit as a dev dependency: `"wow": "github:idobbins/wow#<sha>"`. Config is one `wow` key in the root `package.json`.

- **Guards.** `pnpm wow-guard all` runs each guard from the project root, and belongs in the loop (wow 10). Or name one: `deps`, `dashes`, `dag`, `needs-isaac` or `core-flows`.
- **deps.** Every dependency needs a reason in `dependencies.json`: `{ "npm": { "apps/web": { "react": "the UI" } }, "cargo": { ... } }`, keyed by the manifest's folder (wow 7). Browser automation fails in any manifest, whatever its reason (wow 2), except a headless browser the product runs: a product dependency, not a dev one, with its reason under `"runtime": { "npm": { "apps/pdf": { "playwright-core": "renders PDFs" } } }` in place of the plain entry. Test runners and WebDriver never pass.
- **dashes.** Fails on an em dash in shipped code, outside comments: `"dashes": { "roots": ["apps/web/src"], "ignore": ["**/*.test.ts"] }`.
- **dag.** Checks `.wow/dag.jsonl` (wow 13): one node per line with known fields and status, ids unique and sorted, every dep a node, and no cycle. `all` skips a project that has no file yet; `wow-guard dag` requires one.
- **needs-isaac.** Checks `.wow/needs-isaac.jsonl` (wow 12) the same way, plus each item's kind and status, closing, and no value shaped like a secret. `wow-guard answer <path>` checks one answer file, outside `all` ([rules](docs/operator.md)).
- **core-flows.** Checks `.wow/core-flows.jsonl` (wow 4) the same way, plus that each gap names a graph node not yet done ([format](docs/reliability.md#core-flows)).
- **Lint.** Add `jsPlugins: ["wow/oxlint"]` beside the preset in `oxlint.config.ts` and turn rules on by name, as `"wow/no-silent-catch": "error"`. The rules: `require-disable-reason`, `no-low-value-comments`, `no-silent-catch`, `no-double-cast`, and for Convex, `no-catch-around-own-writes`, `no-any-returns` (every function declares a real `returns`) and `no-v-any`, for the ratchet. The two catch rules take `{ "throwers": [...] }`, the calls that rethrow. `no-double-cast` and the preset's `quality/no-chained-type-assertions` both report `as unknown as`, so a disable there names both.
- **Ratchet.** `pnpm wow-ratchet [paths]` runs the project's own oxlint in place of a bare one. Each (rule, file) keeps exactly its budgeted count, so one more fails and one fewer fails until `wow-ratchet --write` lowers it. `--seed=<rule>` records a new rule's counts as it lands, and nothing raises one. Config: `"ratchet": { "budgets": "lint/grandfathered", "args": [...], "groups": [...], "concurrency": 1 }`. Groups are folders linted apart, and concurrency caps how many oxlint runs at once. It defaults to 1, since each run can take gigabytes on a shared machine (wow 11).
- **Proof.** After `npm ci`, `npm test` plants a break for every guard, rule and ratchet step (wow 3).
