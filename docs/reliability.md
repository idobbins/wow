# Reliability

What keeps a failure in production from going unseen: types that come from the validator, failures that land where someone reads them, checks that run against production after each deploy, a list of the flows that matter and how well they're covered, and a postmortem for every incident. Each section says what applies to which stack; [Stacks](#stacks) sums it up, with the steps to adopt it.

The incident behind it: an assistant feature failed silently in production for 18 hours. The failures wrote no error rows, raised no alert, and 22 deploys went out green, because every check rendered pages and none called the server path that was failing.

## Validator types

For TypeScript on Convex, or anything with a runtime validator (wow 1: one home per decision).

- **The validator is the type.** Derive types from it: `Infer<typeof validator>`, `Doc<"table">`, `FunctionReturnType<typeof api.x.y>`. A hand-written type that repeats a validator is a twin, and twins drift. No lint finds a twin reliably, so delete them when you see them, and let the rules below make drift a type error.
- **Every function declares `returns`.** Convex then checks the handler's return type against the validator at compile time, and the value at run time, so drift fails the type check instead of reaching a caller. `wow/no-any-returns` fails on a query, mutation or action from `_generated/server` (or a wrapper named in its `builders` option) with no `returns`, on `returns: v.any()`, and on `queryGeneric` and the other `*Generic` builders from `convex/server`, which skip the generated data model.
- **No casts or `any` around it.** `wow/no-double-cast` fails on `as unknown as` and `as never`. Turn on oxlint's own `typescript/no-explicit-any`, and with type-aware lint, `typescript/no-unsafe-assignment`, `no-unsafe-return` and `no-unsafe-member-access`; wow adds no rule for what oxlint has.
- **`v.any()` only goes down.** `wow/no-v-any` fails on each `v.any()` outside `returns` (where `no-any-returns` owns it, so nothing counts twice). In a repo that has some, record them as it lands and fix them over time: `wow-ratchet --seed=wow/no-v-any`.

## Failures are never silent

Every background job, scheduled function or action that fails writes a row to the app's error log, the one someone reads, and the user it acted for sees a failure state: an error, a retry, a "this didn't work". Never a spinner that stops, and never nothing.

- **Lint what's precise.** `wow/no-silent-catch` fails on a catch that drops the error. Where console output lands somewhere nobody reads, as a Convex function's log does, set `{ "consoleHandles": false }` for that code, so a `console.error` alone doesn't count as handling it. A failure with no catch at all, such as a scheduled function that throws, no lint can see.
- **A scenario per path.** For each background path, a scenario makes it fail (its outside call errors, its input is bad) and checks the outcome (wow 4): one error row with the job's name, and the failure state the user sees. Remove the error-log write and the scenario goes red (wow 3).
- **Read the log.** The error log is a watched check: new rows after a deploy are red (wow 11).

## Production checks

wow 4 makes production the last check. After each deploy, it fetches the key pages and their assets, compares client errors with the last release, and also:

- **Calls the server.** It signs in as a production test account and calls each critical server path once: the query a key page loads, each mutation a core flow makes, each action that calls an outside service. Any failure is red. A page that renders proves the bundle, not the server.
- **Owns the account.** The test account is real and separate: no billing, marked so analytics and emails skip it, and its data cleaned by the calls themselves. Its credentials are a secret, so the project opens a `secret` item on its ledger (wow 12) naming where they will live, and never puts them in the repo.
- **Watches the traffic.** Each hour, a watch counts each key event (a sign-up, a message sent, a job finished) and compares it with the same hour a week before. A drop to zero where last week had some is red, sent to a staff address. Setting that address up is a send outside the team, so it's an `action` item on the ledger.
- **Reports, never rolls back.** A red goes to the operator at once (wow 11), and rolling back stays the operator's call.

## Core flows

Each project lists the flows its users can't do without in `.wow/core-flows.jsonl`, one per line, each marked by how well scenarios cover it. Refresh it from user feedback, incidents and production errors: a flow that broke in production gets a line, or its line drops a status. Every gap is a node in the graph (wow 13), so it gets planned like any other work.

| Field | What it holds |
| --- | --- |
| `id` | Four digits, the next free number, as in the graph. Never changed, never reused. |
| `created`, `updated` | UTC to the second, `2026-11-17T19:50:00Z`. |
| `title` | The flow, as the user would say it, in one line. |
| `status` | `covered`, `partly` or `uncovered`. |
| `scenarios` | The checks that drive it, as paths or test names. `[]` when uncovered. |
| `node` | For `partly` and `uncovered`, the id of the open node that closes the gap. No `node` when covered. |

```sh
jq -r 'select(.status != "covered") | "\(.id) \(.status) \(.title) -> node \(.node)"' .wow/core-flows.jsonl
```

`wow-guard core-flows` checks each line as `wow-guard dag` does (one JSON object, known fields, ids unique and sorted, UTC times), plus the status, scenarios that match it, a node on every gap and none on a covered flow, and that each node is in `.wow/dag.jsonl` and isn't done yet: a done node means the flow is covered now, or needs a new one. `wow-guard all` skips a repo without the file.

## Postmortems

Every incident in production gets a postmortem, written once it's stable, as one self-contained HTML page (wow 12) under `~/research/review/`, named `postmortem-<project>-<YYYY-MM-DD>.html`. Keep it short:

1. **What happened.** What users saw, from when to when, and how many were hit, in numbers.
2. **Root cause.** The chain from the change to the failure, with the commit.
3. **Why the checks missed it.** Each check that could have caught it, and why it didn't: not run, wrong seam, rendered instead of called, error swallowed.
4. **How it was found.** By a check, a user or by chance, and how long after it started.
5. **Prevention.** Each fix as a node id in the graph, with its planted break. A flow it touched gets its line in `.wow/core-flows.jsonl` updated.
6. **Timeline.** UTC times, one line each.

The page is a report, not a decision: link it from the nodes it creates, and from the ledger only if one of them needs the operator.

## Stacks

| | TypeScript and Convex web app | Godot game |
| --- | --- | --- |
| Validator types | Yes | No: no runtime validator |
| Failures never silent | Error-log rows and a failure state, `wow/no-silent-catch` | Errors captured and read, a failure state |
| Server smoke after deploy | Yes, as a test account | No server |
| Traffic alarm | Yes, to a staff address | No, unless it has a server |
| Core flows | Yes | Yes |
| Postmortems | Yes | Yes |

**A Godot game** covers its core loop with scenarios that run headless (`godot --headless`), driving the game's own scene and logic code and asserting the outcome: the save written, the level finished, the score kept. The project picks its test runner, such as GUT or GdUnit4, pins it, and records why in `dependencies.json`; wow names none. It also decides, and writes in its `AGENTS.md`, where crashes and script errors land and who reads them: Godot writes script errors to its log file (`user://logs/` on desktop by default) and carries on, so the scenario run must fail on any script error it logs, and a crash on a player's machine needs a reporter the project chooses.

### Adopting it

Each step has a check; steps marked *ledger* open an item on the project's `.wow/needs-isaac.jsonl`.

TypeScript and Convex web app:

1. Pin the wow commit that ships these rules. *Check:* `pnpm wow-guard all` passes, and prints the core-flows skip line.
2. Turn on `wow/no-any-returns` (with `builders` for any wrapper), `wow/no-double-cast` and `typescript/no-explicit-any`. *Check:* plant a query with no `returns` and a `returns: v.any()`; lint fails on both.
3. Turn on `wow/no-v-any` and run `wow-ratchet --seed=wow/no-v-any`. *Check:* add one `v.any()`; the ratchet fails on that file.
4. Delete each hand-written twin of a validator, deriving the type instead. *Check:* change a field in the validator; the type check fails where the old twin was used.
5. Set `consoleHandles: false` for `no-silent-catch` on server code, and add a scenario per background path that fails it and checks the error row and the failure state. *Check:* remove the error-log write; its scenario goes red.
6. Write `.wow/core-flows.jsonl`, with a node for each gap. *Check:* `wow-guard core-flows` passes; point a gap at a done node and it fails.
7. Add the server smoke to the post-deploy check. *Ledger:* `secret`, the test account's credentials. *Check:* point one call at a path that throws; the post-deploy check goes red.
8. Add the traffic watch. *Ledger:* `action`, the staff address it sends to. *Check:* feed it an hour with zero of one event; it goes red and sends.
9. Write a postmortem for the last incident, if any, from the template. *Check:* each prevention item is a node in the graph.

Godot game:

1. Pin the wow commit and run `wow-guard all` if the repo has a `package.json`, or `node <wow>/bin/wow-guard.mjs core-flows` from its root. *Check:* it passes on the flow list.
2. Choose a test runner and pin it, with its reason in `dependencies.json`. *Ledger:* only if it costs money. *Check:* a test written to fail makes the headless run exit nonzero.
3. Add a headless scenario for each step of the core loop. *Check:* break one step's logic; its scenario fails.
4. Make script errors fail a headless run, and decide where players' crashes and errors land and who reads them. *Ledger:* `decision` or `action` if that needs an outside service. *Check:* a planted script error turns the run red.
5. Write `.wow/core-flows.jsonl`, with a node for each gap. *Check:* `wow-guard core-flows` passes; point a gap at a done node and it fails.
6. Write a postmortem for each incident, from the template. *Check:* each prevention item is a node.
