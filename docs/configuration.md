# Configuration

Emostate has no standalone `config.json`. Configuration is split between the Aurabot host and two optional environment variables.

---

## 1. Host configuration

### Owner QQ

Used for:

- owner/non-owner routing;
- private-chat context;
- proactive private delivery;
- memory metadata.

Read in `index.mjs`:

```js
api.core.getConfig().ownerQQ
```

Set it in Aurabot. Emostate does not store it in `module.json`.

### Model

Emostate calls:

```js
api.think(prompt, { title, timeoutMs, maxTokens })
```

or falls back to `api.ask()` if `api.think` is absent.

Configure the model/provider in Aurabot. The module stores no API key, token, or endpoint.

### Memory

Emostate uses:

```js
api.lazy('memory')
```

and calls `memory.add()` / `memory.recall()` where applicable. The memory backend is host-owned.

### Transport

Proactive delivery uses:

```js
api.core.hub.deliver('private:' + ownerQQ, publicMessage)
```

A failed delivery is reported; the module does not claim it was sent.

---

## 2. Environment variables

### `EMOSTATE_DATA_DIR`

Overrides the state directory.

Default:

```text
<module>/../../modules-data/emostate
```

Example:

```bash
EMOSTATE_DATA_DIR=/srv/aurabot/data/emostate
```

The directory is created on first save.

### `EMOSTATE_MISSED_FILE`

Overrides the missed-message JSON file used by the 5-minute maintenance loop.

Default in the release copy:

```text
<data>/missed.json
```

Example:

```bash
EMOSTATE_MISSED_FILE=/srv/aurabot/cache/missed.json
```

The original local source used a hardcoded host path. The release copy changes the default to a data-relative path and adds the environment override; see `RELEASE-AUDIT.md`.

### `AURABOT_COMMANDS_FILE`

Test-only. Points to the host's command parser source for one routing test:

```bash
AURABOT_COMMANDS_FILE=/path/to/dsh-aurabot-qq/src/chat/commands.js
```

If unset, that test is skipped. It is not used at runtime.

---

## 3. `module.json`

```json
{
  "id": "emostate",
  "name": "内部状态",
  "version": "0.9.16",
  "api": 1,
  "minPluginVersion": "1.2.0",
  "capabilities": ["filesystem"]
}
```

Important:

- `api: 1` is the plugin API version, not the model API.
- `minPluginVersion` is Aurabot's plugin host version.
- `capabilities: ["filesystem"]` is required for the state file.
- The `license` metadata field was removed. The project is **All Rights Reserved**; see `LICENSE`.

---

## 4. State file

Default path:

```text
<data>/state.json
```

It is a JSON snapshot. It can contain:

- numeric state and four quantities;
- history samples;
- events;
- conditioned cue text;
- private thoughts;
- relationship records for other people;
- self-authored boundaries;
- self-model traits;
- intentions;
- diaries, weekly entries, chronicle entries;
- memory notes.

Treat it as personal data. It is ignored by `.gitignore` and must never be committed.

### Load behavior

`lib/persistence.mjs`:

- missing file → starts from `blank()`;
- existing file → JSON parse + shape validation;
- invalid shape → blocks writes, reports an issue;
- external edit → blocks writes until reload.

### Reload

`/情绪重载` explicitly accepts the on-disk state and discards stale appraisal results. It is intentional, not automatic.

### Schema

`SCHEMA_VERSION = 2` is written by `index.mjs`. This release does not include a general migration framework; older states are merged with `blank()` and validated.

---

## 5. Model gate

`lib/model-gate.mjs` serializes module-owned model calls:

- one in-flight request;
- shared state across hot reloads via `Symbol.for('aurabot.emostate.model-gate.v1')`;
- timeout and cooldown;
- transport/rate-limit classification;
- no request-content logging.

The host `api.ask` has no cancellation contract; a timed-out request keeps its slot until the underlying promise settles. This can delay later batches.

---

## 6. Scheduling constants

These are engineering constants, not emotion thresholds:

| Constant | Location | Meaning |
|---|---|---|
| `SOLO_TICK_MIN` | `index.mjs` | base solo check interval |
| 5 minutes | `index.mjs` | maintenance timer |
| 30 minutes | `index.mjs` | solo check timer |
| 7 days | `index.mjs` | load/hormone history retention |
| 4000 | `index.mjs` | history point cap |
| 60 | `lib/conditioning.mjs` | cue table cap |
| 12 | `lib/appraise.mjs` | total absolute state delta budget |
| 30 days | `emotion.mjs` memory note window | memory note filter |

Some values are not exposed as configuration. Do not change them without tests.

---

---

## 7. Discovery

Discovery is a separate research artifact and is **not included in this release**. It has no runtime configuration in 0.9.16.
