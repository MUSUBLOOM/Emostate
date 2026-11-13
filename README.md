# Emostate 0.9.16

**An endogenous-state dynamics module for intelligent agents.**

Emostate is an experimental Aurabot module that maintains persistent internal state, evaluates external events, evolves state over elapsed time, conditions recall, and supports bounded autonomous solo actions. This repository publishes the 0.9.16 release snapshot for technical inspection and feedback.

## Release package

[Download the complete Emostate 0.9.16 package](Emostate-0.9.16-Publication-Candidate-20261113.zip)

The archive contains the source tree, module metadata, tests, examples, installation/configuration/architecture docs, changelog, roadmap, security report, test report, and release audit.

## Verification

- 149 tests total
- 148 passed, 0 failed, 1 skipped when the external Aurabot QQ command parser is not supplied
- The skipped test can run with `AURABOT_COMMANDS_FILE` pointing to the host parser
- Independent check: Node.js 22.16.0 on Linux, 148 passed / 0 failed / 1 skipped; the time-of-day fixture was verified under both Asia/Taipei and UTC
- No real QQ/model end-to-end test is included

## Scope

Discovery is a separate research artifact and is not included in 0.9.16 or connected to runtime behavior. The larger planned scope is reserved for 1.0.

## License and repository terms

Copyright (c) 2026 MUSUBLOOM. All rights reserved. No open-source software license is granted. Because this repository is public, GitHub users may view and fork it within GitHub under GitHub's Terms of Service (Section D.5). This is not a general software license and does not grant broader rights to use, modify, redistribute, or create derivative works outside GitHub's platform functionality. See [LICENSE](LICENSE) and [GitHub's Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service).

## Compatibility

Emostate 0.9.16 is an Aurabot module (plugin API 1; minimum Aurabot 1.2.0). See the full package's README and docs before installation.
