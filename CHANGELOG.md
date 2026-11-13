# Changelog

All notable changes to this release package.

The project did not keep a complete per-version changelog before 0.9.16. Entries older than 0.9.15 are marked **待补充** rather than reconstructed.

---

## 0.9.16 — release preparation

### Added

- **Discovery research separated:** Discovery is no longer part of the 0.9.16 source tree. It is saved as an independent research artifact; it is not imported by `index.mjs` and does not affect emotion, appraisal, prompts, or behavior.
- Release documentation: README, architecture, installation, configuration, usage, roadmap, security, contributing, audit.
- `.gitignore` covering state, caches, credentials, logs, and backups.
- Sanitized example state and environment file.

### Changed

- **Conditioning cue matching:** exact normalized equality instead of substring matching.
  - A cue learned as `好吧` no longer matches `那好吧`.
  - Trade-off: triggers are stricter; see `docs/architecture.md`.
- **Load helpers extracted:** `loadAboveOwnMedian` and `loadPercentile` now live in `src/lib/load.mjs`, shared by `emotion.mjs` and `index.mjs`. Semantics unchanged.
- **State path:** default is now module-relative (`../../modules-data/emostate`) with `EMOSTATE_DATA_DIR` override. It no longer hardcodes an Aurabot user path.
- **Release packaging path:** the missed-message file uses `EMOSTATE_MISSED_FILE` or `<data>/missed.json` instead of a hardcoded host path. This is a packaging change, not an algorithm change.
- **Cue damping:** the global ×0.9 rule after a strong delta is now explicitly documented in code; behavior is unchanged. A decision to scope it to old cues is still pending.

### Fixed / tightened

- Short cue false positives reduced by exact matching.
- Test suite no longer depends on a hardcoded `C:/Users/<user>/...` path for the command-routing test; it uses `AURABOT_COMMANDS_FILE` or skips.
- Synthetic test owner name sanitized.
- Waiting-note test is no longer timezone-dependent: it now builds its test timestamp with a local-time constructor instead of a fixed `+08:00` offset. Test-only; no runtime behavior changed.

### Tests

```text
tests 149
pass 148
skipped 1
fail 0
```

The skipped test requires the host's command parser source.

### Known issues

- License: All Rights Reserved; no open-source license is granted.
- Discovery is a separate research artifact, not a 0.9.16 runtime capability.
- No real end-to-end test in this repository.
- No multi-version Node test matrix; tested on Node 24.21.0.
- `memoryDigest()` exists without a call path; not active.
- State file contains private data and must never be committed.

---

## 0.9.15 — hormone history

### Added

- `hormoneHistory` records `load`, `trust`, `drive`, `steady` at the same sampling gate as `loadHistory`.
- History cap: 4000 points; retention: 7 days.
- Existing states do not backfill history.

Verified in source (`index.mjs`); no separate release note was kept.

---

## Earlier versions

**待补充.**

The repository does not contain a reliable per-version changelog for versions before 0.9.15. Do not reconstruct dates or claim features without source evidence.

Known lineage from project records and code:

- 0.9.14: catch-up for missed owner messages (comment in module documentation).
- 0.9.13: solo `write` / `draft` actions (comment in module documentation).
- 0.9.12: removal of fixed reply-interval thresholds (comment in module documentation).

These are **project records**, not a complete changelog.
