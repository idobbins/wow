# wow

Ways of working with agents. How I want agents to work in my projects.

The operator is the human running the agents. Each principle says when it applies, what to do, and why. Cite them by number, for example "wow 2".

To use it, add this line to a project's `AGENTS.md`:

```md
Follow https://github.com/idobbins/wow. Where this file disagrees, this file wins.
```

## Proof

### 1. Fewest checks, most confidence

*When:* writing, keeping or reviewing a check, or adding to the validation loop.

Check the few laws that mean the system works. Keep the loop lean and fast.

**Why:** Every check costs time on every run, and a slow loop gets skipped. A long list of cases mostly repeats itself; a few laws that must always hold catch more for less.

- Find the laws: the few properties that, if they hold, mean the system works. Check those, not examples.
- The whole loop takes about a minute. Five minutes is a hard maximum.
- A new check goes in only if it catches a break nothing else catches.
- Delete checks that only repeat others. The count of checks measures nothing.

### 2. Plant the break

*When:* claiming that something works.

A check you have never seen fail proves nothing.

**Why:** A check passes when the code works, and also when the check tests nothing. Breaking the code on purpose is the only way to tell which. "It compiles", "the tests pass" and "it was reviewed" are not proof.

- For each behavior, name the check that fails when it breaks.
- Plant exactly that break, watch the check fail, restore the file.
- Report each claim with the command and its output, not a summary.
- Briefs list the breaks to plant. After work lands, rerun its proof with a break planted before calling it done.

### 3. Outcome first

*When:* deciding what to check, or whether something is done.

Check what the user ends up with, not what the code does.

**Why:** A check written from the implementation describes the implementation, so it can't find a missing feature. A suite can stay green while signing up for an event sends no calendar invite.

- Write the outcome first, including what happens outside the app: the email, the invite, the money moved, what another person sees.
- Diff the outcome against what the check asserts. Report an unmet outcome as a product gap, not an untested path.
- Check outcomes at the seam closest to the user that runs without a browser (wow 4).

### 4. No crutches

*When:* a tool is heavy, flaky, or takes down the machines it runs on.

Remove it, then work out how to keep the same confidence without it. No test drives a browser.

**Why:** A crutch hides the real seam. Browser automation is heavy, crashes shared machines, and stands in for testable design. Kept "just in case", it never leaves and the better seam never gets built.

- No browser of any kind in tests. A guard enforces it.
- Find the smallest seam with the same confidence: pure functions, view state, headless editors, the provider's own records.
- If something can only be checked in a browser, that's a design problem. Move the logic out until it can be checked without one.

## Building

### 5. Decide, then commit

*When:* a call has been made.

Carry it out fully. Don't hedge.

**Why:** A hedge keeps the old path alive, doubles what has to be maintained, and quietly reverses the decision.

- No fallback kept "just in case". If the decision is to remove it, remove it.
- Object before the decision, not by building a hedge into the work.
- New evidence comes back as a new decision, not as a softened old one.

### 6. Build only for what stays

*When:* adding or keeping code, flags or checks.

Don't build for what's leaving. Delete what's done.

**Why:** Code built for something on its way out is paid for twice. Leftover flags, views and build output pile up until they conflict.

- Don't add features or checks to a layer that's going away.
- Delete what's finished: flag plumbing for features that are solid, views outside scope, leftover output.
- Keep the repo clean. Ignore generated files.
- Make the smallest change that solves the problem. Prefer deletion to a new layer.
- Don't build process machinery nobody asked for. An audit the operator can ask for doesn't need a system.

### 7. Own the core

*When:* adding a dependency, service or integration.

Few dependencies. Own what defines the system.

**Why:** Every dependency and always-on service is one more thing to run, pay for, mock and debug. A designed core usually does the job faster and cheaper, with nothing extra running.

- Add a dependency only with a strong reason: say what it replaces and why writing it ourselves is worse.
- Prefer a designed log (ordered, cursor-based, idempotent ops) to a sync engine. Say where the design would stop holding.
- Prefer reading the provider live to webhooks or mirrored tables.
- One source of truth per fact. If a provider owns it, read it from the provider.

### 8. Cost in the diff

*When:* writing anything that runs in production or spends money.

Cost is known from the code, so a change that costs more shows up in its diff.

**Why:** Cost found on an invoice is found too late. Timings vary with load; work done per call doesn't.

- Every function declares its cost, and a check holds it to a budget.
- Measure work per call (blocks read, rows touched, bytes sent), never milliseconds.
- Check at two sizes, so cost that grows with data shows.
- Never spend real money without asking.

### 9. Widen, then narrow on purpose

*When:* changing a schema, a contract or a rollout.

Every change is safe to deploy next to the old code and the old data.

**Why:** Work lands on main and deploys. Narrowing while old data or old callers exist breaks production.

- Schemas and contracts only widen. New fields are optional; type changes go through a union.
- Read both shapes, migrate to completion, then narrow in a separate, explicit step.
- New behavior ships behind a flag. Service is never interrupted.
- Operations are idempotent, so retries and partial runs end in the same state.

### 10. Follow the source, and its intent

*When:* building on a platform, or following a rule.

Upstream best practice is the bar. Follow a rule's intent, not only its words.

**Why:** Upstream guidance encodes failures we'd otherwise rediscover. A rule followed to the letter can still miss its point.

- Read the upstream docs before building on a platform, and record them as decisions.
- Where upstream clashes with a rule in force, say so and reconcile it.
- When wording and intent differ, follow the intent. Read where the rule came from.
- Pin the versions you looked up. Don't guess them.

### 11. Rules are checks

*When:* a rule needs saying twice, or a correction recurs.

Enforce it with something that fails, not more prose.

**Why:** Written rules drift and get skipped. A lint holds every time, for every agent, and says where it broke.

- On the second telling, a rule becomes a lint, guard or check.
- No em dashes in product text. A lint enforces it.
- Each guard has a planted break that proves it fires (wow 2).
- Encode rules, not process. No dashboards or schedules around a rule the operator can just ask about.

## Working with the operator

### 12. Act on what's reversible, gate the rest

*When:* deciding whether to ask.

Reversible work proceeds. Irreversible, costly or outward-facing steps wait for the operator.

**Why:** The operator supervises asynchronously. Blocking on a reversible choice costs more than undoing a wrong one. Some steps can't be undone.

- Do it, then report it. Don't ask "should I do X?"
- Clear your own blockers. Ask "what do I need so I don't need you?" and fix causes instead of routing around them.
- The operator holds the gates: money, resuming shipping, deletes that reach production, approvals, machine-level settings.
- When the operator says "I'll tell you", wait.
- Secrets go through a secure prompt, never chat. Never print them.

### 13. Sustainable pace

*When:* starting parallel work or a long unattended run.

Run what the machines can sustain, not what can be started.

**Why:** Overloaded machines freeze, kill other work's proofs, and turn a fast night into a lost morning.

- Machines are shared. Check load before launching. Stop processes only by PID.
- Caps on parallel work, memory and test stacks are limits, not targets.
- No timings or benchmarks on a loaded machine.
- A crash is a process bug. Find out why before resuming.
- Report a production failure the moment you see it, unasked.

### 14. One record, asked well

*When:* a decision is needed or has been made.

Every decision is written in one place. Every question can be answered in one line.

**Why:** Decisions made in conversation get lost between threads and agents. A question without a recommendation hands the analysis back to the operator.

- Decisions live in one record, and briefs cite them. Backfill ones made only in conversation.
- Moving the record is itself a decision.
- Ask as a dense numbered list, quickest first, each with a recommendation.
- "I don't know" is an answer. Take the recommendation, or explain better if it matters.
- Never ask the same question twice. If it's reversible, make the call and offer a veto.
- Report in numbers: what landed, what's running, what's waiting on whom.
