# Architecture

This document describes the 0.9.16 source as it exists in `src/`. It is not a design proposal. Where a feature is research-only, it is marked.

---

## 1. Runtime boundary

Emostate is an **Aurabot module**. `src/index.mjs` exports a module object with:

```js
{
  id: 'emostate',
  name: '内部状态',
  version: '0.9.16',
  api: 1,
  async setup(api) { ... }
}
```

The host provides:

- `api.on('activity')` — incoming/outgoing message events;
- `api.on('prompt')` / `api.context()` — context assembly;
- `api.think()` / `api.ask()` — model calls;
- `api.lazy('memory')` — memory backend;
- `api.core.hub.deliver()` — outbound delivery;
- `api.every()` / `api.onDispose()` — timers and lifecycle;
- `api.command()` / `api.tool()` — commands and tools;
- `api.defineTool()` — tool definitions;
- `api.core.getConfig().ownerQQ` — owner identity;
- `api.core.chatLogOf()` — chat log access.

The module does not own the QQ connection, the model key, or the transport.

---

## 2. State model

### 2.1 Persistent state

`state.json` is a single snapshot. The validated core includes:

```
at, lastOwnerAt, ownerMsgsToday, day, digestDay, soloDay
near, density, exclusive, command, corrected, initiative,
existence, identity, bond, residue, residueAt
gaps, gapMin, events, history, thoughts, weeks
cues, people, holds, values, selfModel, intents
diaries, chronicles, loadHistory, hormoneHistory
```

Some fields are legacy or auxiliary. The **appraisal dimensions** are the 12 keys in `lib/appraise.mjs`:

```
near, bond, existence, identity, command, residue,
anger, shame, shy, seek, play, disgust
```

The four **regulatory quantities** are:

```
load, trust, drive, steady
```

They are not additional emotion labels. They are part of the appraisal input and are updated with bounded deltas.

### 2.2 Validation and schema

`lib/persistence.mjs` validates:

- numeric fields are finite numbers;
- `selfModel` matches `lib/agency.mjs` budgets;
- `intents` match `lib/agency.mjs` budgets;
- `people` records have numeric `bond`, `trust`, `disgust`, `lastAt`;
- `events`, `history`, `thoughts`, `weeks` are arrays of records with numeric sampling fields;
- `cues`, `lastMem`, `echo`, `mt`, `soloLine` shapes.

Unknown fields are retained for forward compatibility. Invalid shape blocks writes rather than overwriting.

`SCHEMA_VERSION = 2` is set in `index.mjs`; this is a structural marker, not a full migration engine.

### 2.3 Atomic snapshot store

`createSnapshotStore(file, ...)` in `lib/persistence.mjs`:

1. loads and validates the snapshot;
2. keeps an in-memory copy;
3. detects external edits by comparing the current file to the last snapshot;
4. writes to `state.json.tmp-<uuid>` with `wx` and mode `0600`;
5. `fsync`s;
6. re-checks external edits;
7. renames the temp file into place.

A blocked store stops writes; `onIssue` reports a code. `/情绪重载` is the explicit reload path.

---

## 3. Event flow

```text
Aurabot activity event
  │
  ├─ incoming owner message
  │    ├─ cue aging / cue reaction
  │    ├─ update gap, waiting, lastOwnerAt
  │    ├─ queue appraisal(text, prevText, speaker)
  │    └─ if cue hit: enqueue internal appraisal instead of duplicate appraisal
  │
  ├─ incoming non-owner message
  │    ├─ resolve person ID
  │    ├─ queue appraisal with 【别人】 prefix and person scope
  │    └─ apply result to that person, not owner state
  │
  └─ outgoing message
       ├─ count
       └─ every third outgoing message, run self-check on the text
```

`drainAppraise()` batches up to 6 messages with a character budget, avoiding mixed speakers and mixed learned-safety items. The batch is sent to `lib/appraise.mjs` `buildPrompt()`, then parsed by `parse()`.

If the model is busy or cooling down, the batch is retried; other errors get at most one retry. Empty responses are not written as zero deltas.

---

## 4. Appraisal (`lib/appraise.mjs`)

`buildPrompt(state, text, prevText)` includes:

- the message (and previous message where safe);
- gap facts;
- current four quantities;
- self-authored boundaries (`state.values`);
- allowed dimensions and ranges;
- total absolute delta budget;
- evidence rules for `existence` and `identity`;
- ordinary departure limits;
- owner/non-owner distinction;
- thought length and optional hold/recover fields;
- calibration examples.

`parse(raw, inputText, { learnedSafety })` validates and constrains:

- JSON object shape;
- only allowed dimensions;
- `existence` / `identity` negative deltas require textual evidence unless the queue carries a trusted learned cue;
- ordinary departure caps `near` / `residue` and zeroes other dimensions;
- non-negative dimensions (`anger`, `shame`, `shy`, `seek`, `play`, `disgust`) clamp to 0–10;
- total absolute delta budget of 12, using a largest-remainder allocation;
- four hormone deltas must be complete; all-zero is accepted;
- thought length ≤ 30;
- optional `hold` / `recover` values from fixed sets;
- `why` required for negative existence/identity.

The parser is deliberately conservative: absence of evidence becomes zero, not a guess.

---

## 5. State application (`index.mjs`)

After a valid appraisal:

1. `state = decay(state)` (elapsed-time decay).
2. Apply state deltas:
   - `residue` additive with clamp;
   - `bond` via `relationship.applyBond`;
   - non-negative dimensions clamp 0–100;
   - other dimensions clamp 0–100.
3. Apply four quantity deltas via `hormones.applyHormone`.
4. Optionally store thought, hold/recover, say, disgust-say.
5. Strong safety events can learn a cue from a neutral predecessor and create an echo.
6. A global cue damping rule exists: any dimension delta ≥ 5 multiplies all cue strengths by 0.9. This is documented in code as a blunt global rule; it is not presented as a per-cue mechanism.
7. Save the snapshot.

The emotion label is **not** applied here. It is derived later by `emotionOf()` for context/description.

---

## 6. Emotion and description (`lib/emotion.mjs`)

`emotionOf(state)` computes scores from a fixed set of state fields and returns:

```js
{ name, w, mix }
```

It is a **reading** of the state, not the state itself. The scores use:

- `existence`, `identity`, `bond`, `near`, `command`, `corrected`;
- `residue`, `anger`, `shame`, `seek`, `play`, `disgust`, `shy`;
- fixed multipliers and hand-authored conditions.

There is no learned classifier and no LLM call here.

`describe(state)` builds the private context lines:

- time gap fact;
- recent event facts;
- state-based lines;
- optional trend;
- memory notes filtered by `recallCapOf`;
- optional self-model / intent context is added by `ownerContext()`.

`recallCapOf(state)` returns 1 when load is positive and above the character's own median, otherwise 2. `loadAboveOwnMedian` lives in `lib/load.mjs`.

`intensityOf()` and `soloIntervalMin()` are used for diary weight and scheduling.

---

## 7. Four quantities (`lib/hormones.mjs`)

`applyHormone(value, delta)`:

- clamps to `[-100, 100]`;
- when moving outward toward a boundary, scales the delta by remaining space (`(100 - |current|) / 100`);
- when moving back toward zero, applies the model delta unchanged;
- never amplifies.

The four quantities are written into the appraisal prompt as body state. They also influence:

- `recallCapOf` via `load` (through `load.mjs`);
- `soloTickMinutes` via load percentile (through `load.mjs`);
- description text.

They do not directly select an emotion label in `emotion.mjs`.

---

## 8. Relationship and people

`lib/relationship.mjs`:

- bond is 0–100;
- positive changes diminish near the upper bound;
- negative changes are additive (no extra "hurt" coefficient).

`lib/people.mjs`:

- owner state is the main state;
- non-owner speakers get a separate `people[id]` record with `bond`, `trust`, `disgust`, `lastAt`;
- non-owner appraisal uses a scoped evaluation state and applies only the person fields;
- group context for non-owner speakers uses `personContext` and does not receive owner private context.

This is the source-level basis for "分对象".

---

## 9. Conditioning (`lib/conditioning.mjs`)

Three operations:

```
learn(cues, kind, text, now)
react(cues, text, now)
age(cues, now)
```

- `cueOf` normalizes punctuation/whitespace and rejects lengths outside 2–12.
- `learn` increments count and sets strength to `min(1, n / 3)`.
- `react` uses **exact normalized equality** (`t !== c` skip); it does not use substring matching. This is the 0.9.16 tightening.
- Matched cues decay by 0.97 and never fall below 0.03.
- `age` decays by elapsed time with a 24-hour grace and a 0.03 floor.
- Cue table is capped at 60; oldest `at` entries are removed.

Cues are stored in `state.cues`, keyed by normalized text. That text can be private. Never publish a state file.

---

## 10. Scheduling and solo cognition (`index.mjs`)

`api.every(5 * 60 * 1000, ...)` runs:

- daily digest when the day changes;
- decay/save;
- missed-message pickup;
- chronicle check;
- `soloMoment()`;
- weekly digest if due.

`decay` is also called at the start of activity handling.

`api.every(30 * 60 * 1000, ...)` runs the solo check (the exact interval is host scheduling, not an emotion threshold).

`soloMoment(force)`:

1. applies decay;
2. checks `soloDueAt(state)`;
3. builds a solo prompt with time, gap, wait fact, last owner text, current state, recent events, recent thoughts, drafts, self-model, and intents;
4. asks the model for a JSON action;
5. accepts `think | sleep | look | write | draft`;
6. optionally sends a separate public message via `hub.deliver`;
7. stores thoughts, notes, drafts, intents, next check time;
8. records diagnostics counters.

The module does not claim that every solo action leads to a public message. `send` is explicit and delivery failure is reported.

---

## 11. Memory and long-term narrative

- `memory.add` is used for daily digest, weekly review, chronicle, and optional memory digest.
- `memory.recall` is used by solo `lookAt: memory`.
- `state.diaries` stores up to 30 daily entries.
- `state.weeks` stores up to 12 weekly entries.
- `state.chronicles` stores up to a bounded number of chronicle entries.
- `state.selfModel` stores bounded traits revised from records.
- `state.intents` stores bounded open intentions; `done` only means the character chose to close it, not that the system verified completion.

The built-in memory digest function (`memoryDigest`) is present but its comment states it has no current call path; do not document it as active.

---

## 12. Prompt/context injection

`api.context(({ chat }) => ...)`:

- group chat: returns `''` (no private state context);
- private chat: returns `ownerContext()`.

`ownerContext()` calls `describe(state)` and prepends a factual frame:

```
你现在的状态（事实，不是台词）：
...
```

It also appends intent context for private chats. It does not instruct the model to perform a fixed emotion.

`api.on('prompt', ...)` adds per-speaker context in group chats:

- owner speaker: owner context (group-reduced; no private thoughts/memory notes);
- other speaker: person-specific context.

`self_state` tool returns `publicDescription()` (no thoughts/memory notes).

---

## 13. Diagnostics and commands

`lib/diagnostics.mjs` keeps counters and safe paths. It is designed not to log:

- message text;
- thoughts;
- cue text;
- boundary text;
- error bodies.

Commands are registered in `index.mjs`:

```
/情绪
/情绪自检
/情绪诊断
/情绪重载
/编年史
/家
/界线
/日记
/独处
/周记
```

`/情绪自检` is read-only; `dry-run` shows branch conditions without private thoughts.

---

## 14. Discovery is not part of this release

Discovery is a separate research artifact. It is **not in `src/`**, is not imported by `index.mjs`, and does not change `emotionOf`, appraisal, prompts, or behavior in 0.9.16.

The v0.9.16 release intentionally contains only the stable base system.

---

## 15. Known architecture limits

- State is a single owner snapshot plus a small per-person map. There is no distributed store.
- The emotion vocabulary is fixed in `emotion.mjs`.
- Model calls are serialized by the module gate; this is intentional but can delay batches.
- `memoryDigest()` exists without a call path; do not treat it as active.
- The project is All Rights Reserved; `module.json` no longer declares MIT.
- The release copy changes the missed-message path from a hardcoded host path to `EMOSTATE_MISSED_FILE` / `<data>/missed.json`. This is a packaging portability change, not an algorithm change; see `RELEASE-AUDIT.md`.
