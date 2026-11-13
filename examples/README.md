# Examples

These examples contain **no real state, chat, memory, or credentials**.

## `state.blank.json`

A minimal valid initial state for the snapshot store. It is equivalent in shape to `blank()` in `index.mjs`, with timestamps set to 0.

Do not use it to overwrite an existing state file without a backup.

To use it:

1. create a local data directory;
2. copy `state.blank.json` there as `state.json`;
3. point `EMOSTATE_DATA_DIR` at that directory;
4. start Aurabot;
5. run `/情绪诊断`.

The module will update the file. Never commit the resulting file.

## `env.example`

Optional environment variables. Copy to your shell or service configuration; do not commit a filled `.env`.

```text
EMOSTATE_DATA_DIR=/path/to/emostate-data
EMOSTATE_MISSED_FILE=/path/to/emostate-data/missed.json
```

`EMOSTATE_DATA_DIR` defaults to `<module>/../../modules-data/emostate`.

`EMOSTATE_MISSED_FILE` defaults to `<data>/missed.json` in this release.

## What is not here

- no `state.json` from a real run;
- no `novel.json`;
- no chat logs;
- no diaries;
- no model key;
- no owner QQ.
