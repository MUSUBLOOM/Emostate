# Contributing

This is a pre-publication release repository. Before contributing, note two constraints:

1. **All Rights Reserved.** No open-source license is granted. Do not assume contributions will be accepted or distributed under an open-source license.
2. **Research code is isolated.** Discovery files must not be wired into runtime behavior without a separate review.

---

## What is welcome

- Bug reports with a minimal reproduction.
- Tests for existing behavior.
- Documentation corrections where the current code contradicts the docs.
- Privacy/security fixes.
- Packaging and portability fixes that do not change runtime semantics.
- Research proposals for Discovery, kept behind the shadow boundary.

---

## What requires prior discussion

Open an issue before changing:

- `emotion.mjs` scoring or labels;
- `appraise.mjs` prompt rules or budgets;
- `persistence.mjs` validation or write behavior;
- the four-quantity update curve;
- condition cue matching or decay;
- any behavior that changes what the model sees;
- the Discovery lifecycle or promotion criteria.

---

## Development setup

Emostate is an Aurabot module, not a standalone app.

You need:

- Aurabot 1.2.0+ for integration testing;
- Node.js 20+ (tests were run on 24.21.0);
- a module data directory with no real personal state for tests.

Run from `src/`:

```bash
node --experimental-vm-modules --test
```

Expected for 0.9.16:

```text
tests 149
pass 148
skipped 1
fail 0
```

The skipped test needs:

```bash
AURABOT_COMMANDS_FILE=/path/to/dsh-aurabot-qq/src/chat/commands.js
```

Unit tests use synthetic states and a mocked host. They do not send real messages.

---

## Test requirements

A change should include:

- a failing test that demonstrates the bug, when practical;
- a passing test after the fix;
- no real chat text, state file, diary, memory database, or credentials in fixtures;
- deterministic timestamps where time matters;
- no dependency on a developer's home directory.

Do not use `PRIVATE_SENTINEL` as evidence that a test covers real privacy behavior. It is only a test sentinel.

---

## Privacy rules for contributions

Never include:

```text
state.json
novel.json
modules-data/
logs/
.aurabot-cache/
*.bak-*
.env
credentials
real chat logs
real diaries
memory.sqlite
```

If a bug requires a state sample, reduce it to the minimum synthetic fields. Do not paste private thoughts, cues, boundaries, or relationship records into an issue.

---

## Code style

- ESM only.
- No new runtime dependency without discussion.
- Keep the module host-agnostic; do not hardcode a user path.
- Prefer explicit validation over silent coercion.
- Keep diagnostics free of message text, thoughts, cue text, and error bodies.
- Do not add a fixed numeric threshold where a relative/historical comparison is intended.
- Comments should state whether a behavior is a mechanism or an empirical claim.

---

## Pull requests

Include:

- what changed;
- why;
- tests run;
- confirmation that no private data is included;
- confirmation that Discovery was not wired into runtime behavior (unless the PR is specifically about that review).

Do not:

- reformat unrelated files;
- rename commands without a migration note;
- change the All Rights Reserved policy without owner approval;
- make the repository public;
- upload state or model credentials.

---

## License of contributions

Copyright (c) 2026 MUSUBLOOM. All rights reserved. No license is granted for contributions or redistribution. Contact the owner before submitting code intended for redistribution.
