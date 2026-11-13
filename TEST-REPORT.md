# Test Report — Emostate 0.9.16

Date: 2026-11-13
Release: `Emostate-0.9.16-Final`
Test environment: Windows, Node.js **v24.21.0**
Test runner: built-in `node:test` with `--experimental-vm-modules`

---

## 1. Command

From `src/`:

```bash
node --experimental-vm-modules --test
```

The release has **16 top-level test files**.

---

## 2. Result without host source

```text
tests 149
suites 0
pass 148
fail 0
cancelled 0
skipped 1
todo 0
duration_ms 725.8334
```

### Skipped test

```text
new commands route through the installed plugin parser without prefix capture
# set AURABOT_COMMANDS_FILE to dsh-aurabot-qq/src/chat/commands.js
```

Reason: the test verifies command routing against the installed Aurabot QQ plugin parser. The release intentionally does not hardcode a developer's absolute path. It skips when `AURABOT_COMMANDS_FILE` is unset.

No test failed.

---

## 3. Result with host source

Host parser used:

```text
<AURABOT_HOME>/node_modules/dsh-aurabot-qq/src/chat/commands.js
```

Command:

```bash
AURABOT_COMMANDS_FILE=/path/to/dsh-aurabot-qq/src/chat/commands.js \
  node --experimental-vm-modules --test
```

Result:

```text
tests 149
suites 0
pass 149
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 739.1776
```

**All 149 tests pass when the host parser is supplied.**

---

## 3.1 Timezone regression check

The user reported a failure on Node.js 22.16.0 under `TZ=UTC`:

```text
tests 149
pass 147
fail 1
skipped 1
```

The failing test was:

```text
functional.test.mjs
调节：等待提示只在两小时后的白天出现
```

Cause: the test built `NOW` with a fixed `+08:00` timestamp, while `waitingNote()` checks the **runtime machine's local hour**. Under UTC the local hour became 02:00, which is the night branch.

Test-only fix:

```js
// waitingNote 按运行机器本地小时判断白天/夜晚，测试时间也要用本地时间构造。
const NOW = new Date(2027, 0, 1, 10, 0, 0, 0).getTime()
```

No runtime code changed.

Full-suite verification after the fix:

| `TZ` | Tests | Pass | Fail | Skip |
|---|---:|---:|---:|---:|
| `UTC` | 149 | 148 | 0 | 1 |
| `Asia/Taipei` | 149 | 148 | 0 | 1 |
| `Asia/Shanghai` | 149 | 148 | 0 | 1 |

`functional.test.mjs` alone: 8/8 pass in all three timezones.

The timezone tests were run on Node.js 24.21.0. The user's Node.js 22.16.0 failure was reproduced at the same UTC offset before the fix; the fix is test-only and does not depend on the Node version.

---

## 4. What the tests cover

| Area | Test file(s) |
|---|---|
| Appraisal parse, budget, evidence rules | `appraise.test.mjs` |
| Emotion/readout helpers | `functional.test.mjs`, `feedback.test.mjs` |
| Conditioning cue matching and aging | `conditioning.test.mjs` |
| Hormone/bond update curves | `hormones.test.mjs`, `relationship.test.mjs` |
| Load median/percentile helpers | `load.test.mjs` |
| Per-person relationship state | `people.test.mjs` |
| Snapshot store, validation, atomic writes | `persistence.test.mjs` |
| Model gate, cooldown, concurrency | `model-gate.test.mjs` |
| Diagnostics privacy | `diagnostics.test.mjs` |
| Module lifecycle, context, commands, solo | `module.test.mjs`, `review.test.mjs` |
| Waiting/chat-log notes | `waiting.test.mjs`, `waiting-log.test.mjs` |
| Self-model / agency budgets | `agency.test.mjs` |

---

## 5. Missed-message path verification

Final source contains:

```js
const MISSED = process.env.EMOSTATE_MISSED_FILE || path.join(DATA, 'missed.json')
```

Verified:

- `EMOSTATE_MISSED_FILE` is read at the maintenance callback.
- Without the environment variable, the path is `<data>/missed.json`.
- `<data>` is `EMOSTATE_DATA_DIR` or `<module>/../../modules-data/emostate`.
- `path` is imported at the top of `index.mjs`.
- The old hardcoded `D:/...` path is absent.

This is a **static/source verification**, not an end-to-end missed-message replay test. The release has no captured missed-message fixture, and no real chat data is included.

---

## 6. Core code preservation

Compared with the source ZIP:

- `src/index.mjs`: unchanged.
- `src/lib/agency.mjs`: unchanged.
- `src/lib/appraise.mjs`: unchanged.
- `src/lib/conditioning.mjs`: unchanged.
- `src/lib/diagnostics.mjs`: unchanged.
- `src/lib/emotion.mjs`: unchanged.
- `src/lib/hormones.mjs`: unchanged.
- `src/lib/load.mjs`: unchanged.
- `src/lib/model-gate.mjs`: unchanged.
- `src/lib/people.mjs`: unchanged.
- `src/lib/persistence.mjs`: unchanged.
- `src/lib/reachability.mjs`: unchanged.
- `src/lib/relationship.mjs`: unchanged.
- `src/tests/*`: unchanged except `functional.test.mjs` (timezone-only test timestamp construction).

Only `src/module.json` changed among runtime source files (license metadata removal; author set to `MUSUBLOOM`). `src/tests/functional.test.mjs` changed only in test timestamp construction. No core algorithm was refactored.

---

## 7. Limits of this test run

- Unit tests mock the Aurabot host; they do not connect to QQ or a real model provider.
- No clean-machine installation test.
- No Node.js version matrix; only v24.21.0.
- No long-duration decay or scheduler test beyond unit coverage.
- The missed-message branch is statically verified, not replayed with a real captured file.
- Discovery is not in this release and is not part of these tests.

---

## 8. Conclusion

**Pass.** The release test suite is green. One routing test is skipped by default because it needs the host parser; supplying `AURABOT_COMMANDS_FILE` makes it pass, giving 149/149.
