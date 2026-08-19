# DeepSeek Harness Multi-Model Evaluation (`dsh-dual-model-eval`)

English | [简体中文](README.zh-CN.md)

Compare multiple coding models side by side inside [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). `dsh-dual-model-eval` is an installable multi-model and coding-agent evaluation plugin: one prompt runs concurrently across selected LLM routes, every model works in an isolated Git worktree, and the normal **Chat** tab streams tool trajectories and renders comparable, adoptable results.

> Compatibility: the first release targets DeepSeek Harness `0.1.0-rc.7`. DeepSeek Harness is currently a developer preview, so plugin APIs may change between release candidates.

## Install

Install the pinned release into the built-in `web` profile:

```sh
npx @deepseek-ai/dsh@0.1.0-rc.7 plugin --profile web add github:huangdaxianer/dsh-dual-model-eval#v0.1.1
```

Restart the Harness web process after installation:

```sh
npx @deepseek-ai/dsh@0.1.0-rc.7 web
```

The repository contains committed, prebuilt `lib/` artifacts. Installing from GitHub therefore does **not** require authorizing a dependency `prepare` script.

## What it adds

- A **Comparison test** switch inside the existing model selector.
- Multi-select for two to four configured model routes.
- Concurrent execution from one shared Git commit in isolated worktrees.
- Live, independently expandable tool-call trajectories for every model.
- Compact elapsed-time and tool-count summaries, with token, cache, TTFT, decoding, and tool details inside the expanded view.
- Side-by-side final replies and line-change statistics (`+added`, `-deleted`, percentages, and changed-file count).
- Changed-file preview with downloads for one edited file or the complete candidate worktree.
- An **Adopt this result** action that commits the chosen patch locally and advances the shared baseline for later rounds.
- Later rounds inherit the accepted requests, final responses, and commits, while unselected candidate responses stay out of the shared context.
- A composer gate that prevents the next round until one completed candidate has been adopted.

## Use

1. Open the standard model menu and enable **Comparison test**.
2. Select at least two model routes that are already configured in Harness.
3. Submit one coding request. Result cards appear immediately and stream progress while both agents run.
4. Inspect each answer and its expandable tool trajectory.
5. Choose **Adopt this result** under the preferred candidate. The next comparison starts from that committed code baseline and receives the accepted conversation context.

## Git and workspace behavior

- Every candidate gets a new detached worktree created from the same base commit.
- Existing Git repositories must be clean before a comparison starts.
- A non-Git workspace is initialized automatically by default. The plugin stages files not ignored by `.gitignore` and creates a local baseline commit.
- Adoption reconstructs the selected full patch, creates a local commit with command-scoped identity, and fast-forwards the source workspace.
- The plugin never pushes to a remote and does not modify global Git identity.
- Temporary worktrees are removed after a run by default. Bounded private evidence remains under `~/.dsh/dual-model-eval/`.

Review generated commits and patches before publishing them. A completed orchestration run is evidence that execution settled, not a model-quality score.

## Update or remove

Update to a newer tagged release:

```sh
npx @deepseek-ai/dsh@0.1.0-rc.7 plugin --profile web add github:huangdaxianer/dsh-dual-model-eval#v0.1.1
```

Remove the bundle:

```sh
npx @deepseek-ai/dsh@0.1.0-rc.7 plugin --profile web remove dsh-dual-model-eval
```

Restart the `web` profile after either operation.

## Development

Requirements: Node.js `22.19+` (or `24+`), pnpm, and Git.

```sh
pnpm install
pnpm run check
pnpm run pack:release
```

To validate a local checkout without changing your normal Harness home:

```sh
export DSH_PLUGIN_TEST_HOME="$(mktemp -d)"
DSH_HOME="$DSH_PLUGIN_TEST_HOME" npx @deepseek-ai/dsh@0.1.0-rc.7 plugin --profile web add ./dsh-dual-model-eval
DSH_HOME="$DSH_PLUGIN_TEST_HOME" npx @deepseek-ai/dsh@0.1.0-rc.7 --profile web --dump-config
```

## Security

DeepSeek Harness plugins execute with the permissions of the local user. Inspect the source and pin a release tag or commit before installing any third-party plugin. This plugin can create Git worktrees and local commits inside the selected workspace; it does not push those commits.

## License

MIT. This standalone package includes code derived from the MIT-licensed DeepSeek Harness project; see [NOTICE](NOTICE).
