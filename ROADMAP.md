# Roadmap

This roadmap separates what is implemented in 0.9.16 from research that is not wired into the runtime.

The key rule:

> Discovery may expand the set of patterns the system can recognize. It must not silently expand the vocabulary the system uses to define itself.

---

## Implemented in 0.9.16

- Persistent internal state with 12 appraisal dimensions and four regulatory quantities.
- Event appraisal through a constrained model prompt, with validation, evidence rules, and a delta budget.
- Elapsed-time decay, residue, holds, and recovery.
- State-aware recall limit (`recallCapOf`).
- Four-quantity updates with bounded, diminishing outward movement.
- Relationship updates for the owner and separate per-person records.
- Conditioned cue learning, exact-match reaction, aging, and a cue cap.
- Solo action selection: `think`, `sleep`, `look`, `write`, `draft`; optional public send.
- Private context injection; reduced group context; no private thoughts in groups.
- Daily digest, weekly review, chronicle, self-model revision, bounded intentions.
- Atomic snapshot persistence with external-change detection.
- Single model request gate with cooldown.
- Privacy-preserving diagnostics and commands.

---

## Research: Discovery shadow layer

**Status: research; not connected to the runtime.**

Implemented in the separate Discovery Research artifact (not in this release):

- trajectory features: state deltas + four-quantity deltas + after-quantities;
- separate `unclear` and `novelty`;
- `occasionId` de-duplication;
- cold-start baseline (`insufficient_baseline`; no novelty claim before enough observations);
- Observation → Candidate → Recognized lifecycle;
- median centroid for candidates; recognized patterns freeze feature ranges;
- `novel.json` independent version and atomic write;
- provisional metrics: novel observations, promoted candidates, unpaired novel rate.

Not yet done:

- call `observe()` from `index.mjs` after appraisal;
- write `novel.json` from the runtime;
- diagnostics UI for observations/candidates/recognized;
- behavior-impact capture (`reply` / `wait` / `silent`);
- long-run false-match and stability evaluation;
- any controlled prompt influence.

**Explicit non-goal for 0.9.16:** Discovery does not add emotion labels, does not alter `emotionOf`, and does not enter the appraisal prompt.

---

## Next research steps

1. **Shadow Mode integration**
   - Appraisal → `observe()` → `novel.json`.
   - No change to emotion/appraisal/prompt/behavior.
2. **Diagnostics**
   - Expose counts and evidence ranges, not raw private text.
3. **Long-term observation**
   - Recurrence rate, false-match rate, candidate stability, cold-start behavior.
4. **Independent evaluation**
   - Compare against held-out trajectories.
   - Decide whether Discovery found a stable pattern or only noise.
5. **Controlled expansion**
   - If justified, allow only limited, reviewed information into the prompt.
   - Keep the core emotion vocabulary fixed; promotion to core vocabulary requires a separate review.

---

## Future research directions

These are directions, not commitments:

- unfamiliar-state pattern discovery;
- automatic clustering of candidate states;
- long-term dynamical plasticity;
- cross-time cognitive accumulation;
- self-model correction from accumulated evidence;
- controlled vocabulary expansion with human review.

---

## Explicitly not implemented

- A learned emotion classifier.
- Autonomous open-world tool use.
- A general multi-agent architecture.
- A claim of consciousness or subjective experience.
- Automatic renaming of states.
- Discovery influencing 0.9.16 behavior.
- A standalone server or CLI.

---

## Version policy

- Runtime behavior changes require tests.
- Core emotion/appraisal/persistence changes require a separate review.
- Research modules stay isolated until an evaluation passes.
- No version number should imply a capability that is not wired.
