# Security Policy

## Supported version

| Version | Supported |
|---|---|
| 0.9.16 | yes |
| older | not supported |

This is the 0.9.16 release package. No public support commitment is implied until the owner publishes it.

---

## Reporting a vulnerability

Use **GitHub private vulnerability reporting / Security Advisory** on the repository:

```text
https://github.com/MUSUBLOOM/Emostate
```

Do not open a public issue containing:

- API keys, tokens, cookies, or credentials;
- state files or state fragments;
- private chat text, thoughts, cues, boundaries, diaries, or memory records;
- personal paths or usernames;
- screenshots of private data.

If private reporting is unavailable, contact the repository owner directly through the channel used to grant access. Do not publish first.

---

## What counts as a vulnerability

- secret leakage;
- path traversal or unsafe file writes;
- unauthorized delivery to the wrong chat;
- cross-person state contamination (owner data used for a non-owner);
- private thoughts or memory notes leaking into group context;
- prompt injection that bypasses appraisal constraints and causes unbounded state writes;
- denial of service through unbounded state/history growth;
- test or packaging artifacts that expose private data;
- license/legal issues are not security vulnerabilities, but report them to the owner. The project is All Rights Reserved, not open source.

---

## State is personal data

`state.json` can contain:

- private chat-derived cues;
- thoughts;
- boundaries;
- self-model traits;
- intentions;
- diaries and chronicles;
- per-person relationship records;
- memory notes.

Treat it like a private diary.

Do not:

- commit it;
- attach it to an issue;
- paste it into a model prompt outside the host;
- upload it to a public artifact;
- include it in a release ZIP.

`.gitignore` excludes it, but `.gitignore` is not a security boundary. Check staged files before committing.

---

## Credentials

Emostate does not store model API keys. It calls the host's `api.think` / `api.ask`.

However, the **original experiment harness** under `tests/experiment/` contained scripts that read:

```text
C:/Users/<user>/.dsh/.credentials.yaml
```

and extracted the model key from that file. That directory is **excluded from this release**. Do not add it back.

If you add a test that needs a model key, use an environment variable and skip when unset. Never write the key into a fixture.

---

## Prompt injection and model output

Appraisal is model-generated JSON and is validated. The parser:

- limits dimensions;
- limits total delta;
- requires evidence for identity/existence negatives;
- caps ordinary departures;
- limits thought length;
- ignores unknown fields.

This reduces, but does not eliminate, prompt-injection risk. A malicious message can still influence appraisal within the allowed budget.

Do not treat the model output as trusted instructions. The module treats it as data.

---

## Delivery

Proactive delivery uses `hub.deliver('private:' + ownerQQ, message)`. A failed delivery is reported, not retried silently. Verify the owner QQ configuration before enabling proactive behavior.

A wrong `ownerQQ` can send private content to the wrong target. This is a configuration risk, not a module exploit, but it is high impact.

---

## Logging

`lib/diagnostics.mjs` is intended to avoid message text, thoughts, cues, boundaries, and error bodies. It stores counters and safe paths.

Do not add logging of raw model prompts or state in production. If you need to debug, use a local, access-controlled file and delete it afterward.

---

## Dependency surface

Emostate uses Node built-ins only. There is no `package.json` and no third-party runtime dependency in this release.

The host (Aurabot) and its model/QQ/memory plugins are outside this repository and have their own security posture.

---

## Release checklist

Before any public release:

- [x] All Rights Reserved confirmed;
- [ ] no `state.json`, `novel.json`, `modules-data/`, `.aurabot-cache/`, `*.bak-*`;
- [ ] no credentials or `.env`;
- [ ] no personal absolute paths;
- [ ] no real chat/diary/memory data;
- [ ] tests pass or skips are documented;
- [x] `module.json` no longer declares MIT;
- [ ] repository visibility is an explicit owner decision.
