# Changelog

## 0.1.2 — 2026-11-18

- Publish the source changes previously used in local build `0.1.1+local.3`.
- Keep the comparison model list scrollable within the model menu and prevent provider rows from shrinking.
- Give the comparison model selector explicit slot priority so it consistently replaces the standard selector.
- Forward the first user request unchanged, with only a minimal worktree instruction. Later rounds still include accepted conversation history.
- Update English and Chinese installation instructions to use a separate Harness home and the pinned release. Document compatibility and request-disconnect cancellation behavior.

Requires DeepSeek Harness `0.1.0-rc.7`; compatibility with `0.2.2-rc.3` has not been established.

## 0.1.1

- Carry accepted requests, selected model responses, and commits into later rounds.
- Keep unselected candidate responses out of shared follow-up context.
- Add changed-file preview, single-file download, and complete candidate-worktree download.
