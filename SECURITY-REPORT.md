# Security Report — Emostate 0.9.16

Date: 2026-11-13
Scope: `Emostate-0.9.16-Final`
Source package: `Emostate-0.9.16-Release-20261113.zip`
Source SHA256: `8D50AD825937AB9F5C456938D49078B912B1D3CFAC6A4BEC3B23EEAE0AAD2D07`

---

## 1. Result summary

| Check | Result |
|---|---|
| Real API key / token / password | **None found** |
| Private chat records / diaries / relationship data | **None included** |
| `state.json`, `novel.json`, caches, backups | **None included** |
| Local absolute paths / personal username | **No real path or username found**; documentation uses `<user>` placeholders |
| Third-party bundled dependencies | **None** (Node built-ins only) |
| Debug/experiment files | **Not included** |
| Discovery research files | **Not included** |
| MIT / open-source license claim | **Removed**; All Rights Reserved |
| Core code altered | **No**; only `module.json` license metadata removed and author set |

**Security audit: PASS for the final package, with the residual risks listed in section 6.**

---

## 2. What was scanned

All files in the extracted final tree (48 at final audit), plus the final ZIP after packaging.

Patterns checked:

```text
API-key prefixes     (values omitted)
GitHub token prefixes (values omitted)
chat-service token prefixes (values omitted)
cloud access-key prefixes (values omitted)
private-key markers (pattern intentionally not reproduced)
Bearer <long token>
model-key environment variables (values omitted)
api_key=…
password=…
token=…              (triaged; code variables such as model-gate token are not secrets)
C:/Users/…           local user paths
D:/…                 local host paths
local username       (value omitted)
personal names       (values omitted)
.credentials
```

Files with suspicious names:

```text
state.json
novel.json
*.bak-*
*.log
modules-data/
.aurabot-cache/
.env
credentials
```

Result: **none present** in the final tree.

---

## 3. Source-level findings

### 3.1 No credentials in the module

Emostate calls the Aurabot host's `api.think` / `api.ask`. It does not store a model API key, endpoint credential, cookie, or password.

`src/module.json` was checked: `requires` is empty. The source imports only:

```text
node:assert/strict
node:crypto
node:fs
node:os
node:path
node:test
node:url
node:vm
```

No npm package is bundled and no `package.json` exists.

### 3.2 Private data

The original experiment tree contained a `state.json` of about 48 KB, private cues, thoughts, diaries, and `.aurabot-cache` backups. These were **not copied** into the final package.

The final package contains only:

- synthetic test fixtures (`PRIVATE_SENTINEL` is a test sentinel, not real content);
- a blank example state;
- documentation.

### 3.3 Absolute paths

The original source used a hardcoded missed-message path. The final source uses:

```js
const MISSED = process.env.EMOSTATE_MISSED_FILE || path.join(DATA, 'missed.json')
```

The final tree contains no real `C:/Users/<name>` or `D:/...` host path. Documentation mentions `C:/Users/<user>` only as a placeholder when describing the excluded experiment harness.

### 3.4 Tests that read credentials

The original `tests/experiment/preflight.mjs` and `run-invalid-trap.mjs` read `~/.dsh/.credentials.yaml` and extracted the model key from that file. They are **excluded** from the final package. The final `src/tests/` tree contains no credential reader.

### 3.5 License

- `LICENSE` is All Rights Reserved.
- `src/module.json` no longer declares MIT.
- README states no open-source license is granted.
- Aurabot's module loader reads `capabilities` from `module.json`; it does not require a `license` field, so removing the field does not break module loading. The module keeps `api: 1`, `minPluginVersion: 1.2.0`, and `capabilities: ["filesystem"]`.

---

## 4. Final ZIP verification

The final ZIP is checked after creation:

- no `state.json`, `novel.json`, `modules-data`, `.aurabot-cache`, `*.bak-*`, `.env`, credentials;
- no Discovery files;
- no real API key pattern;
- no real local username;
- entry count and SHA256 recorded in `RELEASE-MANIFEST.txt`.

---

## 5. Secrets that are intentionally not present

There is no `.env`, no `.credentials.yaml`, no QQ account password, no NapCat token, no model key, and no memory database.

The owner QQ is host configuration; it is not embedded in the source or examples.

---

## 6. Residual risks

These are deployment risks, not leaked secrets:

1. `state.json` created at runtime is private. It is ignored by `.gitignore` but must be protected by file permissions and backups.
2. A wrong `ownerQQ` can deliver private proactive messages to the wrong target.
3. Model outputs are validated but are still model-generated; prompt injection can influence appraisal within the allowed budget.
4. The host, model provider, QQ transport, and memory backend are external and have their own security posture.
5. The final package was tested on Node 24.21.0 only.
6. The release has no real QQ/model end-to-end test.
7. All Rights Reserved means the code is visible but not open-source; this is a legal choice, not a security control.

---

## 7. Answers

- **Passed security audit?** Yes for the final package, with the residual deployment risks above.
- **Private data present?** No.
- **Real keys present?** No.
- **MIT completely removed?** Yes: no license field in `module.json`; `LICENSE` is All Rights Reserved; README says so. The only remaining "MIT" text is an explicit statement that the project is **not** MIT-licensed.
- **Core code retained?** Yes.
- **Tests pass?** 148 pass + 1 intentional skip without host; 149 pass with host.
- **Can upload?** The package is ready for upload after the owner's final visibility approval; this task did not push.
- **Unresolved?** No security blocker. Open items are host end-to-end validation, Node matrix, and the absence of the requested `(2)` filename (the confirmed readable package was used).
