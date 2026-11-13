# Installation

Emostate 0.9.16 is an **Aurabot module**, not a standalone application.

There is no `npm install` step and no `package.json` in this release. The module is plain ESM and uses only Node built-ins plus the Aurabot plugin API.

---

## 1. Requirements

| Requirement | Notes |
|---|---|
| Aurabot | **1.2.0 or newer**; plugin API 1 |
| Node.js | **20+ recommended**; release tests were run on Node 24.21.0 |
| Model access | Configured in Aurabot; Emostate does not store API keys |
| Memory backend | Aurabot's `memory` module (`api.lazy('memory')`) |
| Filesystem | Writable module data directory |
| QQ transport | Provided by Aurabot / its QQ plugin |

No npm dependencies are declared by Emostate.

---

## 2. Place the module

Copy the **contents of `src/`** into the Aurabot modules directory.

Default DSH desktop location:

```text
%USERPROFILE%\.dsh\plugins-data\aurabot\modules\emostate\
```

Generic layout:

```text
<AURABOT_HOME>/plugins-data/aurabot/modules/emostate/
├── index.mjs
├── module.json
├── lib/
│   ├── agency.mjs
│   ├── appraise.mjs
│   ├── conditioning.mjs
│   ├── diagnostics.mjs
│   ├── emotion.mjs
│   ├── hormones.mjs
│   ├── load.mjs
│   ├── model-gate.mjs
│   ├── people.mjs
│   ├── persistence.mjs
│   ├── reachability.mjs
│   └── relationship.mjs
└── tests/
```

Do **not** copy:

```text
modules-data/
state.json
novel.json
.aurabot-cache/
*.bak-*
tests/experiment/
```

Those are local data or research harnesses, not runtime requirements.

---

## 3. Data directory

Default resolution in `index.mjs`:

```js
const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA = process.env.EMOSTATE_DATA_DIR
  || path.join(HERE, '..', '..', 'modules-data', 'emostate')
```

For the default layout:

```text
<AURABOT_HOME>/plugins-data/aurabot/modules/emostate/   ← module
<AURABOT_HOME>/plugins-data/aurabot/modules-data/emostate/state.json
```

Override:

```bash
EMOSTATE_DATA_DIR=/absolute/path/to/emostate-data
```

The directory is created on first save. The state file is JSON and contains private data.

---

## 4. Configure the host

Emostate does not have its own API key or model configuration.

### Owner QQ

Set the owner QQ in Aurabot's host configuration. The module reads:

```js
api.core.getConfig().ownerQQ
```

Without it:

- owner/non-owner routing may be wrong;
- proactive private delivery cannot resolve a target;
- `/情绪诊断` will show incomplete host context.

### Model

Aurabot must provide a working `api.think` (preferred) or `api.ask`. Emostate passes prompts through `lib/model-gate.mjs`.

If model access is missing, setup can still load, but appraisal/solo calls will fail and be reported in diagnostics.

### Memory

The module uses `api.lazy('memory')` when daily/weekly/chronicle writes or memory recall are needed. If the host has no memory module, those paths are skipped or fail gracefully depending on the call site.

---

## 5. Start and verify

1. Start or reload Aurabot.
2. Confirm the module appears as `emostate` / `内部状态`.
3. Run:

```text
/情绪诊断
```

Expected: numeric state, persistence status, model gate counters, world identity.

4. Run:

```text
/情绪
```

Expected: numeric state facts, not a narrative.

5. Optional: force one solo moment:

```text
/独处
```

This calls the model and may write state. Use only in a test environment.

---

## 6. Run tests

From the `src/` directory:

```bash
node --experimental-vm-modules --test
```

Expected for this release:

```text
tests 149
pass 148
skipped 1
fail 0
```

The skipped test checks the host's command parser. Provide:

```bash
AURABOT_COMMANDS_FILE=/absolute/path/to/dsh-aurabot-qq/src/chat/commands.js
```

to run it. The release deliberately does not hardcode a local path.

Tests use synthetic states and a mocked host; they do not send real QQ messages.

---

## 7. Common errors

### `emostate 状态文件无效；已阻止覆盖`

The state file is not valid JSON or does not match the validated shape. The store blocks writes to avoid destroying data.

- Back up the file.
- Inspect or restore from a known-good snapshot.
- Use `/情绪重载` only after correcting the file.

### `持久化已暂停 code=state_external_change`

The state file changed on disk while the process held an in-memory snapshot. Emostate does not silently reload.

- Stop the process.
- Decide which copy is authoritative.
- Restart, or use `/情绪重载` intentionally.

### `依赖加载失败：lib/...`

A library file is missing or has a syntax error. Re-copy `src/lib/` completely.

### Model calls never complete

Check Aurabot's model/provider configuration and `lib/model-gate.mjs` diagnostics. A timed-out host request keeps its slot until the underlying promise settles; this is a host API limitation documented in the gate.

### `/独处` returns but no public message

That is allowed. `send` is explicit. A solo action may be `think`, `sleep`, `look`, `write`, or `draft`, none of which sends a public message. Delivery failure is reported in diagnostics, not retried silently.

### No private context in group chat

This is intentional. Group context returns `''`; private thoughts/memory notes are not injected into groups.

---

## 8. Upgrade / backup

Before replacing the module:

1. Stop Aurabot.
2. Back up the module directory.
3. Back up `modules-data/emostate/state.json`.
4. Replace only runtime files (`index.mjs`, `module.json`, `lib/`).
5. Start Aurabot.
6. Run `/情绪诊断`.

Do not copy an old `state.json` over a newer one without checking timestamps and backups.

---

## 9. Uninstall

1. Stop Aurabot.
2. Move the module directory out of `modules/`.
3. Keep or remove `modules-data/emostate/` according to your data-retention policy.

Removing the module does not delete the state file.
