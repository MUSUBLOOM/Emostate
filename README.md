# Emostate 0.9.16

**Emostate is an internal-state runtime for an LLM-driven character, implemented as an Aurabot module.**

It is not a chatbot framework, and it is not a prompt that tells a model to "act emotional". It keeps a persistent internal state, updates that state from appraised events, lets the state decay over time, and injects the resulting state into later model calls. The model still produces the words; Emostate produces the condition the words are produced from.

> Status: 0.9.16 final release package.
> License: **All Rights Reserved**. No open-source license is granted. See [License](#license).

---

## What it is

Emostate maintains:

- **12 appraisal dimensions**: `near`, `bond`, `existence`, `identity`, `command`, `residue`, `anger`, `shame`, `shy`, `seek`, `play`, `disgust`.
- **Auxiliary persisted fields**: `density`, `exclusive`, `corrected`, `initiative` (legacy/context fields; not all are active appraisal dimensions).
- **4 regulatory quantities**: `load`, `trust`, `drive`, `steady`.
- **Event history and state history**, used for decay, recall limits, and trend lines.
- **Conditioned cues**: neutral phrases that acquired weight through repeated pairing with strong events.
- **Per-person relationship state** for non-owner speakers.
- **Self-model, intentions, thoughts, diaries, weekly reviews, and a chronicle**.

The important design choice: **the state is not a label attached to a reply**. It persists across turns and across time. The same sentence can be appraised differently depending on what state it lands in.

---

## What problem it addresses

Most "emotional" LLM products do one of three things:

1. Ask the model to role-play an emotion in the prompt.
2. Classify the user's text into an emotion label.
3. Generate an emotional-sounding reply with no persistent internal variable.

Emostate takes a different route:

```text
event
  → appraisal by the model
  → bounded state delta
  → persistent state update
  → time-based decay / residue
  → state injected into later calls
  → model decides what to say
```

The model is used for **appraisal and expression**. It is not asked to be the database, the clock, or the consistency layer.

---

## Difference from a normal LLM or agent

| Normal LLM call | Emostate |
|---|---|
| Prompt in, text out | Event in, state update, state-conditioned prompt out |
| Emotion is described in the prompt | Emotion is a derived reading of persistent state |
| No memory of prior internal change unless in context | State survives restarts in `state.json` |
| Time is absent unless stated | Decay and residue run on a timer |
| Recall is whatever fits in context | Recall quota can shrink when load is high |
| "Autonomy" is usually a scheduled prompt | Solo actions are selected from explicit acts: think / sleep / look / write / draft |
| Self-report is generated ad hoc | Self-model is revised from existing records, with storage budgets |

It is also not a claim of consciousness or subjective experience. The project models **internal state dynamics**; it does not assert that the system feels.

---

## Core mechanisms

### 1. Independent internal-state dynamics

State is stored in `state.json` and changed by bounded deltas. The appraisal prompt constrains:

- allowed dimensions;
- per-dimension range;
- total absolute delta budget;
- evidence requirements for `existence` / `identity` negative changes;
- ordinary-departure limits;
- separation of owner and non-owner speakers.

The model proposes; the module validates and applies.

### 2. Continuous evolution and time decay

`decay()` runs on state access and on a 5-minute host timer. Decay is elapsed-time based, so one large step and many small steps produce the same result. Some values settle toward a non-zero baseline rather than snapping to zero.

`loadHistory` and `hormoneHistory` are sampled on the same gate, capped, and retained for 7 days. They are used for relative comparisons, not absolute "high/low" thresholds.

### 3. External stimuli and state change

Incoming owner messages, messages from other people, reconnect events, delayed messages, and internal events are queued for appraisal. Appraisal returns a JSON object with state deltas, four quantity deltas, an optional thought, and optional hold/recover hints.

### 4. State-aware recall

`recallCapOf()` returns a smaller recall quota when current load is above the character's own historical median. This is a retrieval effect, not a change in wording.

### 5. Solo behavior selection

When due, `soloMoment()` gives the model a constrained action space:

```text
think  — think about something
sleep  — choose to rest; sets a later check
look   — inspect group / private / memory / diary material
write  — write a private note (not sent)
draft  — draft a future message (not sent)
```

The model can also set `send: true` with a separate public message. Delivery goes through the host's `hub.deliver`; failures are recorded, not silently claimed as success.

### 6. Model-driven thought

`state.mt` / `state.thoughts` store a short thought produced by appraisal. Thoughts are private; public replies are generated separately and are not allowed to simply repeat the private thought.

### 7. Long-term memory, reflection, self-model

- Memory writes go through the host's `memory` module (`memory.add`, `memory.recall`).
- Daily digests summarize the previous day from state history and events.
- Weekly reviews summarize up to 7 days.
- A chronicle records longer arcs.
- `selfModel` is revised from existing records, with a bounded number of traits and bounded trait length.
- Intentions are bounded records, not commands.

### 8. Resilience and diagnostics

- Atomic snapshot writes: temp file → fsync → rename.
- External file edits are detected; the in-memory state is not silently reloaded.
- A single model request gate prevents concurrent model calls and applies cooldown after transport errors.
- Diagnostics store fixed paths and counters, not message text, thoughts, or error bodies.
- `/情绪重载` explicitly accepts an on-disk state and drops stale appraisal results.

---

## Architecture at a glance

```text
Aurabot host
  │  activity / prompt / context / timer / commands
  ▼
index.mjs  (module setup, lifecycle, state ownership)
  ├─ lib/appraise.mjs       model appraisal prompt + JSON validation
  ├─ lib/emotion.mjs        state → labels / description / recall cap
  ├─ lib/hormones.mjs       bounded four-quantity updates
  ├─ lib/relationship.mjs   bounded bond updates
  ├─ lib/people.mjs         per-person relationship state
  ├─ lib/conditioning.mjs   cue learning / reaction / aging
  ├─ lib/load.mjs           median / percentile helpers
  ├─ lib/persistence.mjs    snapshot store, atomic save, validation
  ├─ lib/model-gate.mjs     single model request gate
  ├─ lib/agency.mjs         self-model and intention budgets
  ├─ lib/diagnostics.mjs    privacy-preserving counters
  └─ lib/reachability.mjs   branch / schedule conditions
```

Discovery is a **separate research artifact**, not part of this 0.9.16 release. It is not imported by `index.mjs`, is not included in `src/`, and does not affect emotion, appraisal, prompts, or behavior. See [ROADMAP.md](ROADMAP.md).

Detailed module responsibilities and data flow: [docs/architecture.md](docs/architecture.md).

---

## Requirements

- **Aurabot 1.2.0 or newer** with plugin API 1.
- **Node.js 20 or newer recommended.** The test suite in this release was run on Node 24.21.0; older versions are not verified.
- A writable module data directory.
- A configured model/provider in Aurabot. Emostate does not store an API key.

There is no `package.json` and no npm dependency installation step. Emostate is an ESM Aurabot module, not a standalone server.

---

## Installation

The short version:

```text
<AURABOT_HOME>/plugins-data/aurabot/modules/emostate/
  index.mjs
  module.json
  lib/
  tests/
```

Copy the contents of [`src/`](src/) into that directory. On the DSH desktop default this is:

```text
%USERPROFILE%\.dsh\plugins-data\aurabot\modules\emostate
```

Then:

1. Configure the owner QQ in Aurabot's host configuration.
2. Configure the model provider/API in Aurabot, not in Emostate.
3. Start or reload Aurabot.
4. Run `/情绪诊断` to verify state, persistence, and world identity.

Full steps, data-directory behavior, and troubleshooting: [docs/installation.md](docs/installation.md).

---

## Configuration

Emostate has no standalone config file. It reads:

- **owner QQ** from the Aurabot host config;
- **model access** through the host's `api.think` / `api.ask`;
- **data directory** from `EMOSTATE_DATA_DIR`, or the default sibling `modules-data/emostate`;
- **missed-message file** from `EMOSTATE_MISSED_FILE`, or `<data>/missed.json` (release packaging change; see the audit).

Details: [docs/configuration.md](docs/configuration.md).

---

## Usage

Aurabot commands registered by the module:

| Command | Purpose |
|---|---|
| `/情绪` | Numeric state facts |
| `/情绪自检` | Read-only runtime self-check; `dry-run` shows branch conditions without private thoughts |
| `/情绪诊断` | Numeric diagnostics: values, calls, persistence, world |
| `/情绪重载` | Explicitly accept on-disk state and discard stale appraisal results |
| `/编年史` | View chronicle entries |
| `/家` | View recorded locations |
| `/界线` | View self-authored boundaries |
| `/日记` | View recent daily entries |
| `/独处` | Force one solo moment (testing) |
| `/周记` | View weekly entries |

The model also gets a `self_state` tool for reading its current state on demand.

The module injects a private-chat context containing state facts. Group chats receive a reduced context; private thoughts, memory notes, and pending intentions are not injected into group context.

Details: [docs/usage.md](docs/usage.md).

---

## Testing

From `src/`:

```bash
node --experimental-vm-modules --test
```

Expected in this release:

```text
tests 149
pass 148
skipped 1
fail 0
```

The skipped test requires the host's `dsh-aurabot-qq/src/chat/commands.js`. Set:

```bash
AURABOT_COMMANDS_FILE=/path/to/dsh-aurabot-qq/src/chat/commands.js
```

to run it. Without the host source, the routing test is intentionally skipped rather than using a hardcoded local path.

Unit tests use synthetic states and a mocked host. They do not send real messages.

---

## Known limitations

- **Aurabot is required.** This repository does not include the host, QQ transport, model provider, or memory backend.
- **No standalone CLI/server.** `index.mjs` exports a module object; it expects the Aurabot plugin API.
- **No multi-version Node test matrix.** Only Node 24.21.0 was used for the release tests.
- **No real end-to-end test in this repository.** Tests mock the host. Real QQ delivery, real memory backend, and real model behavior are environment-dependent.
- **Chinese-first prompts and commands.** The appraisal prompt and command names are in Chinese.
- **Fixed emotion vocabulary.** `emotion.mjs` uses a fixed label set. Discovery is not integrated; it does not add labels at runtime.
- **Privacy-sensitive state.** `state.json` can contain private text, thoughts, relationship state, cues, diaries, and chronicle entries. Never commit it.
- **All Rights Reserved.** No open-source license is granted. Do not redistribute or create derivative works without permission.
- **Discovery is a separate research artifact, not a 0.9.16 capability.** It is not included in this release, is not called by the runtime, and has no effect on output.

---

## Security and privacy

Do not commit:

```text
state.json
novel.json
modules-data/
logs/
credentials
.env
.aurabot-cache/
*.bak-*
```

`state.json` and any separate Discovery candidate store are personal data. The module's diagnostics are designed not to include message text, thoughts, or error bodies, but the state file itself does.

See [SECURITY.md](SECURITY.md) and [RELEASE-AUDIT.md](RELEASE-AUDIT.md).

---

## Repository layout

```text
.
├── README.md
├── CHANGELOG.md
├── ROADMAP.md
├── CONTRIBUTING.md
├── SECURITY.md
├── LICENSE
├── .gitignore
├── RELEASE-AUDIT.md
├── RELEASE-MANIFEST.txt
├── TEST-REPORT.md
├── SECURITY-REPORT.md
├── docs/
│   ├── architecture.md
│   ├── installation.md
│   ├── configuration.md
│   └── usage.md
├── examples/
│   ├── README.md
│   ├── env.example
│   └── state.blank.json
└── src/
    ├── index.mjs
    ├── module.json
    ├── lib/
    └── tests/
```

---

## License

**Copyright (c) 2026 MUSUBLOOM. All rights reserved.**

No license is currently granted for the use, modification, or distribution of this software. This project is not MIT-, Apache-, or GPL-licensed. Viewing the source does not grant permission to reuse, redistribute, or create derivative works.

GitHub's Terms of Service permit viewing and forking this repository on GitHub. That platform permission is not an open-source license and does not grant rights outside GitHub. See [LICENSE](LICENSE).

---

## Acknowledgments

Emostate is built as an Aurabot module. The host provides the event bus, model calls, memory, transport, and persistence location. The module owns the state model and the appraisal/expression loop.
