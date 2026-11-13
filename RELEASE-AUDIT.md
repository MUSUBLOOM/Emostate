# Release Audit — Emostate 0.9.16 Final

Date: 2026-11-13
Final directory: `Emostate-0.9.16-Final/`
Source archive: `Emostate-0.9.16-Release-20261113.zip`
Source SHA256: `8D50AD825937AB9F5C456938D49078B912B1D3CFAC6A4BEC3B23EEAE0AAD2D07`
Repository: `https://github.com/MUSUBLOOM/Emostate` (private, empty at audit time)
Uploaded: **no**
Visibility changed: **no**

---

## 1. Source provenance

The requested filename `Emostate-0.9.16-Release-20261113(2).zip` was **not present** in the workspace or on the Desktop at audit time. The only readable matching archive was:

```text
<local archive path>
SHA256 8D50AD825937AB9F5C456938D49078B912B1D3CFAC6A4BEC3B23EEAE0AAD2D07
46 entries
```

After confirmation ("应该就是这个"), this archive was used as the sole input. The original ZIP was not modified. The final directory is a new extraction, not an overwrite of the old release folder.

This provenance caveat is the only unresolved packaging ambiguity.

---

## 2. What was checked

### 2.1 Source

```
src/index.mjs
src/module.json
src/lib/agency.mjs
src/lib/appraise.mjs
src/lib/conditioning.mjs
src/lib/diagnostics.mjs
src/lib/emotion.mjs
src/lib/hormones.mjs
src/lib/load.mjs
src/lib/model-gate.mjs
src/lib/people.mjs
src/lib/persistence.mjs
src/lib/reachability.mjs
src/lib/relationship.mjs
```

### 2.2 Tests

16 top-level test files; 149 tests.

### 2.3 Release documents

```
README.md
CHANGELOG.md
ROADMAP.md
CONTRIBUTING.md
SECURITY.md
LICENSE
.gitignore
RELEASE-AUDIT.md
RELEASE-MANIFEST.txt
TEST-REPORT.md
SECURITY-REPORT.md
docs/architecture.md
docs/installation.md
docs/configuration.md
docs/usage.md
examples/README.md
examples/env.example
examples/state.blank.json
```

### 2.4 Host interaction

- Aurabot plugin API version: 1.
- Minimum host: 1.2.0.
- Aurabot module loader reads `capabilities` from `module.json`; it does not require a `license` field.
- `module.json` keeps `id`, `name`, `version`, `api`, `minPluginVersion`, `requires`, and `capabilities`.

---

## 3. Final package changes

Only these changes were made to the extracted source package:

1. `LICENSE`: replaced the placeholder with an **All Rights Reserved** notice.
2. `src/module.json`: removed the MIT license metadata declaration and set `author` to `MUSUBLOOM`.
3. README, CHANGELOG, CONTRIBUTING, SECURITY, docs: reconciled to All Rights Reserved.
4. Added `TEST-REPORT.md` and `SECURITY-REPORT.md`.
5. `src/tests/functional.test.mjs`: replaced a fixed `+08:00` timestamp with a local-time constructor so the waiting-note test is timezone-independent. This is a test-only change.
6. Regenerated `RELEASE-MANIFEST.txt`.

No change to:

```
src/index.mjs
src/lib/agency.mjs
src/lib/appraise.mjs
src/lib/conditioning.mjs
src/lib/diagnostics.mjs
src/lib/emotion.mjs
src/lib/hormones.mjs
src/lib/load.mjs
src/lib/model-gate.mjs
src/lib/people.mjs
src/lib/persistence.mjs
src/lib/reachability.mjs
src/lib/relationship.mjs
```

Source-by-source hashes confirm the core runtime code is unchanged from the input ZIP. Among source/test files, only `src/module.json` (license/author metadata) and `src/tests/functional.test.mjs` (timezone-only test construction) differ.

---

## 4. Feature accuracy

The README describes only features supported by source:

| Claim | Source support |
|---|---|
| Persistent internal state | `state.json`, `persistence.mjs` |
| 12 appraisal dimensions | `appraise.mjs` `DIMS` |
| Four regulatory quantities | `appraise.mjs`, `hormones.mjs` |
| Elapsed-time decay / holds | `index.mjs` `decay()` |
| External stimulus appraisal | `api.on('activity')`, `buildPrompt`, `parse` |
| State-aware recall cap | `emotion.mjs` `recallCapOf`, `load.mjs` |
| Solo action selection | `index.mjs` `soloMoment()` |
| Private thoughts / public send separation | `index.mjs` solo flow, `hub.deliver` |
| Memory writes/reads | `memory.add` / `memory.recall` call sites |
| Daily/weekly/chronicle | `index.mjs` digest functions |
| Self-model / intentions | `agency.mjs`, `index.mjs` |
| Private vs group context | `ownerContext()`, `api.on('prompt')` |
| Diagnostics privacy | `diagnostics.mjs` |
| Commands / `self_state` | `index.mjs` |

Discovery is **not** part of this release. No README or docs claim it is wired.

---

## 5. License decision

Final position:

```
Copyright (c) 2026 MUSUBLOOM.
All rights reserved.
No license is currently granted for use, modification, or distribution outside GitHub. GitHub's Terms of Service permit viewing and forking on GitHub; this is not an open-source license.
```

- `LICENSE` is a rights notice, not an OSI license.
- `src/module.json` no longer declares MIT.
- README does not describe the project as MIT/open source.
- The only remaining occurrences of "MIT" are explicit negative statements ("not MIT-licensed") and historical audit text.
- Third-party components are not bundled. The Aurabot host, model provider, QQ transport, and memory backend remain separate works under their own terms.

---

## 6. Security audit

### 6.1 No real credentials

Scanned for:

```
API-key prefixes, GitHub token prefixes, chat-service token prefixes, cloud access-key prefixes,
PRIVATE KEY, Bearer <long token>,
model-key environment variables, api_key assignments, password assignments
```

No real credential found.

### 6.2 No private data

The final tree contains:

- no `state.json`;
- no `novel.json`;
- no `modules-data/`;
- no `.aurabot-cache/`;
- no `*.bak-*`;
- no logs;
- no diaries or chat transcripts;
- no Discovery research files.

`PRIVATE_SENTINEL` in tests is a synthetic sentinel, not real text.

### 6.3 No real local paths

No real username or host path. Documentation uses `<user>` placeholders when explaining excluded experiment files.

### 6.4 Excluded high-risk material

The original project contained:

```
.aurabot-cache/.../modules-data/emostate/state.json   (private state)
modules-data/emostate/state.json                      (private state)
tests/experiment/preflight.mjs                        (read credentials file)
tests/experiment/run-invalid-trap.mjs                 (read credentials file)
```

These were not copied into the final package. They remain in the original project and were not deleted.

---

## 7. Test result

Without host parser:

```text
tests 149
pass 148
fail 0
skipped 1
```

Skip reason:

```text
set AURABOT_COMMANDS_FILE to dsh-aurabot-qq/src/chat/commands.js
```

With the host parser supplied:

```text
tests 149
pass 149
fail 0
skipped 0
```

Details: `TEST-REPORT.md`.

---

## 8. Missed-message path

Final source:

```js
const MISSED = process.env.EMOSTATE_MISSED_FILE || path.join(DATA, 'missed.json')
```

- Env override: `EMOSTATE_MISSED_FILE`.
- Default: `<data>/missed.json`.
- `<data>`: `EMOSTATE_DATA_DIR` or `<module>/../../modules-data/emostate`.
- No hardcoded `D:/...` remains.
- `path` is imported.

Static verification only; no captured missed-message replay fixture is included. See `TEST-REPORT.md` section 5.

---

## 9. Answers to the release questions

1. **Security audit passed?**
   **Yes**, for the final package. No real credentials or private data were found. Residual deployment risks are documented in `SECURITY-REPORT.md`.

2. **Any private data?**
   **No** in the final package. Runtime `state.json` is still private by design and must never be committed.

3. **Any real keys?**
   **No.**

4. **Completely detached from MIT?**
   **Yes** as a licensing position: `LICENSE` is All Rights Reserved; `module.json` has no license field; README says no open-source license is granted. The word "MIT" appears only in negative/explanatory statements.

5. **Core code retained?**
   **Yes.** All core runtime `.mjs` files are byte-identical to the input ZIP. `module.json` changed only in license/author metadata; `functional.test.mjs` changed only in test timestamp construction.

6. **Tests pass?**
   **Yes.** 148 pass + 1 intentional skip without host; 149 pass with host. Zero failures in both runs.

7. **Can upload to GitHub?**
   **Yes, after the owner's final visibility approval.** This task did not push, did not change visibility, and did not create a public repository.

8. **Unresolved issues?**
   - The requested `Emostate-0.9.16-Release-20261113(2).zip` was absent; the confirmed readable `Emostate-0.9.16-Release-20261113.zip` was used instead.
   - No real QQ/model end-to-end test.
   - Only Node 24.21.0 tested.
   - The skipped routing test needs `AURABOT_COMMANDS_FILE`.
   - Runtime `state.json` privacy depends on deployment.

---

## 10. Upload boundary

Not performed:

```text
git push
gh repo edit --visibility public
```

The final directory and ZIP are staging artifacts. Visibility and upload require explicit owner action.
