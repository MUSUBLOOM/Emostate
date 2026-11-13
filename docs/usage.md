# Usage

Emostate is normally used through an Aurabot-hosted character. There is no standalone UI.

This document describes the commands, context injection, and behavior that the source actually implements.

---

## 1. Commands

| Command | What it returns | Read-only? |
|---|---|---|
| `/情绪` | Numeric state facts (`describe` without private thoughts) | yes |
| `/情绪自检` | Runtime self-check; `dry-run` shows branch conditions without private thoughts | yes |
| `/情绪诊断` | Numeric diagnostics: values, call counters, persistence, world identity | yes |
| `/情绪重载` | Explicitly reload state from disk and discard stale appraisals | **no** |
| `/编年史` | Chronicle entries | yes |
| `/家` | Recorded locations | yes |
| `/界线` | Self-authored boundaries | yes |
| `/日记` | Recent daily entries | yes |
| `/独处` | Force one solo moment | **no** |
| `/周记` | Weekly entries | yes |

`/情绪重载` and `/独处` can change state or trigger model calls. Do not use them casually in production.

Command descriptions are in Chinese in the source. Renaming a command is a breaking change.

---

## 2. `self_state` tool

`index.mjs` registers:

```text
self_state
```

Description: read the character's current internal state when it wants to know "what is wrong with me right now".

It returns `publicDescription()`:

- state facts;
- no private thoughts;
- no memory notes.

The tool is optional; failed registration is logged, not fatal.

---

## 3. Context injection

### Private chat

`api.context()` calls `ownerContext()`:

```text
你现在的状态（事实，不是台词）：
<describe(state)>
```

`describe()` may include:

- gap since last owner message;
- recent event facts;
- state-based lines;
- trend lines;
- memory notes filtered by `recallCapOf`.

The module does not append "act sad" or "reply angrily". It appends facts and state readings.

### Group chat

Group chat receives **no** private state context from `api.context()`.

`api.on('prompt')` adds per-speaker context:

- owner in a group: reduced owner context (no private thoughts/memory notes);
- other speaker: `people.personContext(state, id)`.

This is the source-level reason private thoughts do not leak into groups.

---

## 4. Incoming messages

### Owner

- cue aging/reaction runs first;
- if a cue hits, an internal appraisal is queued instead of appraising the same message twice;
- gap, waiting, last-owner time update;
- normal messages are queued for appraisal.

### Other people

- person ID is validated;
- appraisal receives `【别人】` prefix and a scoped relationship state;
- result is applied to `state.people[id]`, not the owner state;
- owner private context is not used for that person.

### Outgoing

Every third outgoing message (up to 6 per day) can trigger a self-check on the character's own text. This is a bounded self-review, not a general reflection loop.

---

## 5. Appraisal output

The model is asked for JSON like:

```json
{
  "d": { "near": 2, "bond": -1 },
  "h": { "load": 3, "trust": 0, "drive": 0, "steady": -1 },
  "t": "……算了",
  "hold": "短",
  "recover": "正常"
}
```

Constraints enforced by `lib/appraise.mjs`:

- dimensions limited to the allowed set;
- total absolute state delta ≤ 12;
- `existence`/`identity` negative changes need evidence and `why`;
- ordinary departures are limited;
- four quantity deltas must be complete (−10…+10 each);
- thought ≤ 30 characters;
- unknown fields are ignored.

A model output can be valid with empty `d` and empty `t` (no impact). Empty model responses are not written as zero.

---

## 6. Decay and time

`decay(state)` runs on access and on the 5-minute timer.

Properties:

- elapsed-time based;
- one large interval and many small intervals are consistent;
- some values settle toward non-zero baselines;
- hold/recover modify the decay rate for a bounded TTL.

Do not expect an emotion to disappear immediately after a reply. That is intentional.

---

## 7. Solo moment

When due, `soloMoment()` asks for one of:

```text
think
sleep
look   (group | private | memory | diary)
write  (private note, not sent)
draft  (future message, not sent)
```

It may also set:

```json
{ "send": true, "message": "..." }
```

The public message is generated separately from the private thought. If `send` is false, no public message is sent.

A `sleep` action sets a later check time. A `wait` field sets `nextSoloAt`.

Solo actions can update:

- thoughts;
- notes;
- drafts;
- intents;
- waiting state (after a successful proactive send);
- next check time.

They cannot guarantee a reply. A solo moment can legitimately produce no public output.

---

## 8. Memory and narrative

Daily digest:

- runs when the local day changes;
- summarizes previous-day history/events;
- writes to `state.diaries` (bounded) and host memory.

Weekly review:

- runs when due and at least two distinct days exist;
- writes to `state.weeks` (bounded) and host memory.

Chronicle:

- records longer arcs;
- writes to `state.chronicles` and host memory;
- calls `reflectSelfModel`.

Self-model:

- revised from existing records only;
- bounded traits;
- not a personality quiz and not a fixed label.

Intentions:

- bounded records;
- `done` means the character chose to close it, not that the system verified completion.

---

## 9. Diagnostics

`/情绪诊断` and `/情绪自检` are designed to expose:

- numeric state;
- model gate status/counters;
- persistence status;
- world identity;
- branch conditions in dry-run.

They are not designed to expose:

- message text;
- private thoughts;
- cue text;
- boundary text;
- memory content.

If you need deeper debugging, use the state file locally; do not paste it into a public issue.

---

## 10. What the module does not guarantee

- It does not guarantee a human-like emotional response.
- It does not guarantee that a state change produces a visible reply change.
- It does not guarantee that `send: true` results in delivery; delivery can fail.
- It does not add new emotion labels at runtime. Discovery is research-only.
- It does not make the model consistent across providers. Appraisal quality depends on the configured model.

---

## 11. Minimal usage checklist

1. Aurabot 1.2.0+, owner QQ configured.
2. Module copied to `modules/emostate`.
3. Model provider configured in Aurabot.
4. `/情绪诊断` returns numeric state and persistence `ok`.
5. Send a private message; check `/情绪` for a state change.
6. Wait for a solo check or run `/独处` in a test environment.
7. Back up `state.json` before experiments.
