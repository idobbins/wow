# The work graph

Each repo keeps its work in `.wow/dag.jsonl`: one JSON node per line, each a unit of work and the units it waits on (wow 13). The goal of the repo is done, every node done with proof. `wow-guard dag` checks the file, and jq answers what to build next. Every query below runs against [dag.example.jsonl](dag.example.jsonl), with its output shown under it (jq 1.7 or later), except the speed queries, which run on wow's own git history.

## The format

| Field | Needed | What it holds |
| --- | --- | --- |
| `id` | yes | Four digits, the next free number: `"0007"`. Never changed, never reused. |
| `title` | yes | The outcome, in a line (wow 4). |
| `status` | yes | `todo`, `doing`, `blocked` or `done`. |
| `deps` | yes | Ids this unit truly waits on. `[]` for none. Ship order is not a dep. |
| `files` | to be ready | Paths it touches. A folder covers everything under it. |
| `proof` | to be ready | The planted break that proves it (wow 3). Once done, the evidence: the command and its output, or the commit. |
| `waiting` | when blocked | What it waits on outside the graph: an open question for the operator, or another party. |
| `decisions` | no | The operator's answers, verbatim: `[{ "by": "operator", "at": "...", "text": "..." }]`. Append only. |
| `created`, `updated` | yes | UTC ISO 8601 to the second, `2026-11-16T22:04:00Z`, as jq's `now \| todate` writes it, so times sort as text. |

- **Statuses.** `blocked` is for a wait outside the graph; a wait on another node is a dep, and the node stays `todo`. A dropped unit is `done`, with the operator's call in `decisions` and `"proof": "dropped"`, so ids stay unique and the record stays whole.
- **Lines.** Sorted by id. Edit a node by replacing its line, add one at its sorted place, and never delete a line.
- **Recording.** Add the node before the work starts. Change it in the commit that changes its status. Mark it done in the commit that lands the work, with the proof's command and output.

Find the next id, add a node, and edit one with jq, so every line keeps one form:

```sh
jq -rs '(map(.id | tonumber) | max // 0) + 1 | "000\(.)" | .[-4:]' .wow/dag.jsonl
# 0010
NODE='{"id":"0010","title":"Audit sign-ins","status":"todo","deps":["0001"],"created":"2026-11-16T22:30:00Z","updated":"2026-11-16T22:30:00Z"}'
jq -cs --argjson node "$NODE" '. + [$node] | sort_by(.id)[]' \
  .wow/dag.jsonl > .wow/dag.tmp && mv .wow/dag.tmp .wow/dag.jsonl
jq -c --arg id 0003 'if .id == $id then .status = "doing" | .updated = (now | todate) end' \
  .wow/dag.jsonl > .wow/dag.tmp && mv .wow/dag.tmp .wow/dag.jsonl
```

## The check

`wow-guard dag` fails on a line that isn't one JSON object, a missing or malformed field, an unknown field, a status outside the four, a done node without `proof`, a blocked node without `waiting`, a duplicate id, lines out of id order, a dep on a missing id or on itself, and a cycle, which it prints as its path. `wow-guard all` skips a project with no `.wow/dag.jsonl` yet, so a project adopts the file when it's ready (wow 9).

## Merging

Git conflicts on this file even when two branches change neighboring nodes. Add `.wow/dag.jsonl merge=union` to `.gitattributes`: git then keeps both sides' lines without stopping, and `wow-guard dag` fails on each id that now appears twice. That's safe only where `wow-guard dag` runs in the loop; without it, keep git's default and its conflict markers. Either way, resolve with:

```sh
grep -Ev '^(<<<<<<<|\|\|\|\|\|\|\||=======|>>>>>>>)' .wow/dag.jsonl | jq -cs '
  group_by(.id)[]
  | if (map(.created) | unique | length) > 1
    then error("\(.[0].id) is two units: renumber the one not on main") end
  | (map(.decisions // []) | add | unique | sort_by(.at)) as $decisions
  | max_by(.updated) | if $decisions != [] then .decisions = $decisions end' > .wow/dag.tmp \
  && mv .wow/dag.tmp .wow/dag.jsonl
```

For each id it keeps the copy with the later `updated`, plus every decision from both copies. Two branches that each took the same new id made two units; it stops on those and changes nothing. Renumber the one not on main, and its deps, by hand, then run it again. Run `wow-guard dag` before committing the merge.

## Queries

Ready: todo, every dep done, with files and proof.

```sh
jq -rs '(map({key: .id, value: .status}) | from_entries) as $s | .[]
  | select(.status == "todo" and all(.deps[]; $s[.] == "done") and (.files // []) != [] and .proof)
  | "\(.id) \(.title)"' .wow/dag.jsonl
# 0003 Rate-limit sign-ups
# 0004 Export to CSV
# 0005 Name the CSV headers
# 0006 Document the API
```

Not ready, and why: blocked, waiting on a dep, or missing files or proof. Each line is a question to resolve, ranked by what it unblocks (wow 12).

```sh
jq -rs '(map({key: .id, value: .status}) | from_entries) as $s | .[]
  | select(.status == "blocked" or .status == "todo")
  | [.deps[] | select($s[.] != "done")] as $after
  | (if .status == "blocked" then .waiting
     elif $after != [] then "after \($after | join(", "))"
     elif (.files // []) == [] or .proof == null then "needs files and proof"
     else empty end) as $why
  | "\(.id) \(.title): \($why)"' .wow/dag.jsonl
# 0007 Bill per seat: the operator: the price per seat
# 0008 Remind invitees a day before: after 0002
# 0009 Audit log: needs files and proof
```

In progress:

```sh
jq -r 'select(.status == "doing") | "\(.id) \(.title)"' .wow/dag.jsonl
# 0002 Sign-up sends a calendar invite
```

Waves: the ready nodes that share no files with work in flight, grouped so no two in a wave share a file. Greedy, in id order. 0003 waits, since 0002 has `src/signup.ts`; 0005 is under 0004's folder.

```sh
jq -rs 'def clash($a; $b): any($a[] as $x | $b[] as $y
    | $x == $y or ($x | startswith($y + "/")) or ($y | startswith($x + "/")); .);
  def waves: if . == [] then empty else
    reduce .[] as $n ({wave: [], files: [], rest: []};
      if clash($n.files; .files) then .rest += [$n] else .wave += [$n.id] | .files += $n.files end)
    | .wave, (.rest | waves) end;
  (map({key: .id, value: .status}) | from_entries) as $s
  | [.[] | select(.status == "doing") | .files // [] | .[]] as $busy
  | [.[] | select(.status == "todo" and all(.deps[]; $s[.] == "done") and (.files // []) != [] and .proof)
      | select(clash(.files; $busy) | not)]
  | [waves] | to_entries[] | "wave \(.key + 1): \(.value | join(" "))"' .wow/dag.jsonl
# wave 1: 0004 0006
# wave 2: 0005
```

Done: exits 0 only when every node is done with proof, and otherwise lists what's left and exits 1.

```sh
jq -rs 'map(select(.status != "done" or .proof == null) | "\(.id) \(.status) \(.title)")
  | if . == [] then "done" else (join("\n") + "\n" | halt_error(1)) end' .wow/dag.jsonl
# 0002 doing Sign-up sends a calendar invite
# ... one line for each node not done, then exit 1
```

Decisions, by node or by text:

```sh
jq -r --arg id 0007 'select(.id == $id) | .decisions // [] | .[] | "\(.at) \(.by): \(.text)"' .wow/dag.jsonl
# 2026-11-03T11:00:00Z operator: Bill monthly, not yearly.
jq -r --arg q monthly '.id as $id | .decisions // [] | .[] | select(.text | test($q; "i"))
  | "\($id) \(.at) \(.by): \(.text)"' .wow/dag.jsonl
# 0007 2026-11-03T11:00:00Z operator: Bill monthly, not yearly.
```

## Speed

The speed node (wow 13) takes its numbers from git and the graph, nothing else. These queries run on wow's own main, with their output on 2026-11-17.

- **Reached main** is the committer date of the commit that landed the node, since pushes aren't in git. That's the commit its proof names when the proof starts with `commit`, as a backfilled node's does, and otherwise the first commit on main where the node is done.
- **Ready to main** runs from the node's `created` to that commit. `created` comes before the proof passes, so this is an upper bound on the wait wow 2 budgets. p50 and p90 are by nearest rank.
- **Backfilled** nodes landed before they were added to the graph. Their `created` was copied from the commit, so they read near zero; each number is shown with and without them.
- **`since`** drops units created before a change to the ship path. On wow, bots push without asking from 2026-11-16T21:40:00Z (wow 11).

Collect the graph's history on main, then each landed node:

```sh
hist=$(mktemp) landed=$(mktemp)
{ git log main --format='{"sha":"%H","ct":%ct}'
  git log main --reverse --format='%H %ct' -- .wow/dag.jsonl | while read -r sha ct; do
    git show "$sha:.wow/dag.jsonl" | jq -c --arg sha "$sha" --argjson ct "$ct" '{sha: $sha, ct: $ct, node: .}'
  done; } > "$hist"
jq -cs 'map(select(.node == null)) as $commits | map(select(.node)) | group_by(.node.id)[]
  | first as $added | (map(select(.node.status == "done")) | first) as $done | select($done)
  | [$done.node.proof | select(test("^commits? ")) | scan("\\b[0-9a-f]{7,40}\\b") as $s
      | $commits[] | select(.sha | startswith($s))] as $named
  | (if $named == [] then $done else $named | max_by(.ct) end) as $land
  | {id: $done.node.id, created: $done.node.created, landed: ($land.ct | todate), sha: $land.sha[:7],
     seconds: ($land.ct - ($done.node.created | fromdate)), backfilled: ($land.ct < $added.ct)}' "$hist" | tee "$landed"
# {"id":"0001","created":"2026-11-16T20:29:37Z","landed":"2026-11-16T20:29:37Z","sha":"69efa38","seconds":0,"backfilled":true}
# {"id":"0002","created":"2026-11-16T20:34:04Z","landed":"2026-11-16T20:34:04Z","sha":"09159b3","seconds":0,"backfilled":true}
# {"id":"0003","created":"2026-11-16T21:42:37Z","landed":"2026-11-16T21:46:33Z","sha":"035ae1f","seconds":236,"backfilled":true}
# {"id":"0004","created":"2026-11-16T21:43:11Z","landed":"2026-11-16T21:44:18Z","sha":"a720ded","seconds":67,"backfilled":true}
# {"id":"0005","created":"2026-11-16T22:06:16Z","landed":"2026-11-16T22:06:16Z","sha":"2c03cca","seconds":0,"backfilled":true}
# {"id":"0006","created":"2026-11-16T22:04:00Z","landed":"2026-11-16T22:22:40Z","sha":"6a0a750","seconds":1120,"backfilled":false}
# {"id":"0007","created":"2026-11-17T16:44:32Z","landed":"2026-11-17T16:46:12Z","sha":"12d7442","seconds":100,"backfilled":false}
# {"id":"0008","created":"2026-11-17T17:47:00Z","landed":"2026-11-17T17:55:37Z","sha":"57bb158","seconds":517,"backfilled":false}
```

Ready to main:

```sh
jq -rs --arg since 2026-11-16T21:40:00Z 'def pct($p): sort | .[(length * $p / 100 | ceil) - 1];
  def mins: "\(. / 60 | floor)m\(. % 60 | tostring | "0\(.)" | .[-2:])s";
  def line($name): "\($name): n=\(length) p50=\(map(.seconds) | pct(50) | mins) p90=\(map(.seconds) | pct(90) | mins)";
  line("all"), (map(select(.backfilled | not)) | line("not backfilled")),
  (map(select(.created >= $since)) | line("since")),
  (map(select(.created >= $since and (.backfilled | not))) | line("since, not backfilled"))' "$landed"
# all: n=8 p50=1m07s p90=18m40s
# not backfilled: n=3 p50=8m37s p90=18m40s
# since: n=6 p50=1m40s p90=18m40s
# since, not backfilled: n=3 p50=8m37s p90=18m40s
```

How busy main was: the share of each working window with a unit between `created` and landing. A window runs from its first `created` to its last landing, and a gap over 4 hours with nothing in flight starts a new one. wow 11 reads the last window. A window with one unit is 100% busy by this measure.

```sh
jq -rs --arg since 2026-11-16T21:40:00Z 'def windows: map([(.created | fromdate), (.landed | fromdate)]) | sort
  | reduce .[] as [$s, $e] ([]; if . == [] or $s - .[-1].end > 4 * 3600
      then . + [{start: $s, end: $e, busy: ($e - $s)}]
      else .[-1] |= (.busy += ([$e - ([$s, .end] | max), 0] | max) | .end = ([.end, $e] | max)) end)
  | .[] | "  \(.start | todate) to \(.end | todate): \(.busy)s of \(.end - .start)s, \(if .end > .start
      then 100 * .busy / (.end - .start) | round else 0 end)% busy";
  "all", windows, "not backfilled", (map(select(.backfilled | not)) | windows),
  "since", (map(select(.created >= $since)) | windows)' "$landed"
# all
#   2026-11-16T20:29:37Z to 2026-11-16T22:22:40Z: 1356s of 6783s, 20% busy
#   2026-11-17T16:44:32Z to 2026-11-17T17:55:37Z: 617s of 4265s, 14% busy
# not backfilled
#   2026-11-16T22:04:00Z to 2026-11-16T22:22:40Z: 1120s of 1120s, 100% busy
#   2026-11-17T16:44:32Z to 2026-11-17T17:55:37Z: 617s of 4265s, 14% busy
# since
#   2026-11-16T21:42:37Z to 2026-11-16T22:22:40Z: 1356s of 2403s, 56% busy
#   2026-11-17T16:44:32Z to 2026-11-17T17:55:37Z: 617s of 4265s, 14% busy
```

Red batches: each landing commit is a batch. Git shows a red one as a revert, a fixup commit, or a node marked done and later reopened. A node whose proof names more than one commit landed in pieces; count it as a possible fix-up.

```sh
git log main --oneline -i -E --grep '^(revert|fixup!|squash!)' | wc -l
jq -rs '"batches: \(map(.sha) | unique | length), nodes: \(length)"' "$landed"
jq -rs 'map(.node // empty) | group_by(.id)
  | (map(map(.status) as $s | ($s | index("done")) as $i | select($i != null and ($s[$i:] | any(. != "done")))
      | .[0].id) | "reopened: \(length) [\(join(" "))]"),
    (map(last | select(.proof // "" | test("^commits? [0-9a-f]{7,}.* [0-9a-f]{7,}")) | .id)
      | "landed in more than one commit: \(length) [\(join(" "))]")' "$hist"
# 0
# batches: 8, nodes: 8
# reopened: 0 []
# landed in more than one commit: 1 [0003]
```

The loop at p50, three runs, with the load (wow 11):

```sh
uptime; for i in 1 2 3; do s=$(date +%s%N); npm test > /dev/null 2>&1; echo $(( ($(date +%s%N) - s) / 1000000 )); done \
  | jq -cs 'sort | {runs_ms: ., p50_ms: .[length / 2 | floor]}'
#  11:05:15 up 2 days, 13:24,  1 user,  load average: 3.09, 5.43, 6.67
# {"runs_ms":[2315,2339,2341],"p50_ms":2339}
```

On the machine that pushed, the remote ref's reflog has the push times, so it checks how long commits waited to reach main. It isn't in clones.

```sh
git reflog show --date=unix --format='%H %gd' origin/main | jq -Rrs --argjson c "$(git log main --format='{"%H":%ct}' | jq -s add)" '
  [split("\n")[] | select(. != "") | capture("^(?<sha>\\S+) .*@\\{(?<at>[0-9]+)\\}") | (.at | tonumber) - $c[.sha]]
  | "pushes: \(length), commit to push: max \(max)s, p50 \(sort | .[length / 2 | floor])s"'
# pushes: 9, commit to push: max 153s, p50 74s
```

## Moving a tracker in

Moving the record is the operator's decision (wow 12). Once it's made, build the file, check it, then point the old tracker at the file and stop writing there.

- **GitHub issues.** The issue number becomes the id, so old references still read. Deps come from "depends on #N" or "blocked by #N" in the body, and a `blocked` label becomes `blocked`:

  ```sh
  mkdir -p .wow && gh issue list --state all --limit 1000 --json number,title,state,body,labels,createdAt,updatedAt | jq -c '
    def id: tostring | "000\(.)" | .[-4:];
    sort_by(.number)[] | {
      id: (.number | id), title,
      status: (if .state == "CLOSED" then "done"
               elif any(.labels[]; .name == "blocked") then "blocked" else "todo" end),
      deps: [.body // "" | scan("(?i)(?:depends on|blocked by) #([0-9]+)")[0] | tonumber | id],
      created: .createdAt, updated: .updatedAt }
    | if .status == "done" then .proof = "closed as issue #\(.id | tonumber)" else . end
    | if .status == "blocked" then .waiting = "see issue #\(.id | tonumber)" else . end' > .wow/dag.jsonl
  ```

  Over 9999 issues, widen the id. Then copy the operator's answers from each open issue's comments into `decisions`, verbatim (`gh issue view N --json comments`), and replace each `waiting` with the actual question.
- **Another tracker.** Export it as JSON and map it the same way: its own ids if they're numbers, its links as deps, closed as done.
- **A tracker.md.** One node per item, by hand or by an agent: `- [x]` is done, with the commit that landed it as proof.

Then run `wow-guard dag` and fix what it finds: a dep on an item that never existed, or a cycle the old tracker hid. Add `files` and `proof` to the open nodes, and the ready query shows where to start.
