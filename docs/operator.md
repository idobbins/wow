# What reaches the operator

The operator mostly hears from agents through a bot of their own, which relays requests to coordinators and wakes the operator only when it must (wow 12). This page is the contract between them: the answer file, the ledger of what only the operator can do, the wake line, and the daily digest. Paths under `~/research` are this setup's defaults, in the home of the server user running the coordinator.

## Answer files

A message from the operator's bot or a project bot that carries a request id (`clientRequestId`) gets its answer in `~/research/answers/<request-id>.md`, and the chat reply is one line: `answered: ~/research/answers/<request-id>.md`.

- Plain markdown, at most 2KB.
- Line 1 is the answer, in one sentence.
- Then at most ten short bullets. Every question in the message is answered, or marked `deferred: <reason>`.
- Then `Isaac-only:` and its bullets, if the operator has to do something. Each is also an open item on the ledger.
- Longer detail goes in one HTML review page under `~/research/review/` (wow 12), linked from a bullet.

`wow-guard answer <path>` checks the size, the first line, and the bullet count before `Isaac-only:`. It can't tell whether every question was answered, since it never sees the message; that stays the coordinator's job.

## The ledger

Each repo lists what only the operator can do in `.wow/needs-isaac.jsonl`: the gates listed in wow 11, and nothing else. It holds what's open, not what was decided. When the operator answers, the answer goes verbatim in the `decisions` of the node it decides (wow 13), and the item closes with `resolved_by` naming that node. A blocked node's `waiting` names the item it waits on, as `needs-isaac 0003: the price per seat`.

| Field | What it holds |
| --- | --- |
| `id` | Four digits, the next free number, as in the graph: `"0003"`. Never changed, never reused. |
| `created`, `updated` | UTC to the second, `2026-11-17T19:44:00Z`, as jq's `now \| todate` writes it. |
| `kind` | `decision`, `secret`, `action` or `review`. |
| `title` | One line. |
| `recommended` | One of `options`, or `null`. |
| `options` | The labels to pick from. `[]` when there's no choice, as for a secret. |
| `detail` | At most 300 characters. More goes in the review page. |
| `link` | The review page's path, or `null`. |
| `status` | `open`, `done` or `dropped`. |
| `resolved_by` | Only once closed: what closed it, such as `"node 0012"` or a commit. |

Every field but `resolved_by` is on every line. Lines are sorted by id; edit an item by replacing its line, and never delete one. Never write a secret's value here: a `secret` item names what's needed and where it will live. An empty file means nothing is open.

```sh
jq -rs '(map(.id | tonumber) | max // 0) + 1 | "000\(.)" | .[-4:]' .wow/needs-isaac.jsonl
# 0001
ITEM='{"id":"0001","created":"2026-11-17T19:44:00Z","updated":"2026-11-17T19:44:00Z","kind":"decision","title":"Price per seat","recommended":"$8","options":["$8","$12"],"detail":"Seat billing (node 0007) needs a price.","link":null,"status":"open"}'
jq -cs --argjson item "$ITEM" '. + [$item] | sort_by(.id)[]' \
  .wow/needs-isaac.jsonl > .wow/needs.tmp && mv .wow/needs.tmp .wow/needs-isaac.jsonl
jq -r 'select(.status == "open") | "\(.id) \(.kind) \(.title) [\(.recommended // "no pick")]"' .wow/needs-isaac.jsonl
# 0001 decision Price per seat [$8]
jq -c --arg id 0001 'if .id == $id then .status = "done" | .resolved_by = "node 0007" | .updated = (now | todate) end' \
  .wow/needs-isaac.jsonl > .wow/needs.tmp && mv .wow/needs.tmp .wow/needs-isaac.jsonl
```

`wow-guard needs-isaac` checks each line as `wow-guard dag` does (one JSON object, known fields, ids unique and sorted, UTC times), plus the kind and status, a one-line title, the 300 characters, `recommended` among the options, `resolved_by` on every closed item and on no open one, and values shaped like a secret: a known token prefix (`sk-`, `ghp_`, `xoxb-`, `AKIA`), a private key, or a run of 32 or more letters and digits that mixes cases. `wow-guard all` skips a repo without the file. Merging works as in [the graph](dag.md#merging).

## Waking the operator

The bot posts a finished turn to the operator only when that turn failed or is blocked, added or changed an open ledger item, or put something live in production. The coordinator marks such a turn by ending its final message with one line, the first that applies:

```
notify: failure
notify: needs-isaac
notify: live
```

A turn without the line wakes no one. The hook that reads it lives with the bot, not in wow.

## The daily digest

At the end of each working session, the coordinator writes or refreshes `~/research/answers/digest-<project>-<YYYY-MM-DD>.md`, dated in the operator's time zone (Mountain Time here), at most 1.5KB:

- **Landed today,** each with the time it went live.
- **Running.**
- **Blocked,** with what each waits on.
- **Open for the operator:** the count of open ledger items.

No check reads the digest: it's rewritten every session and only the bot reads it.
