import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { mkdir, realpath, stat, writeFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { SubprocessOutputReader } from '@deepseek-ai/dsh-subprocess'

export interface GitConfig {
  readonly command: string
  readonly graceMs: number
  readonly maxOutputBytes: number
}

export interface GitResult {
  readonly stdout: string
  readonly stderr: string
}

/** Structured Git failure used by callers that need to distinguish a missing repository. */
export class GitCommandError extends Error {
  constructor(
    readonly args: readonly string[],
    readonly exitCode: number | null,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    let index = 0
    while (args[index] === '-c') index += 2
    const operation = args[index] ?? '<unknown>'
    const detail = stderr.trim() || stdout.trim() || `exit ${String(exitCode)}`
    super(`git ${operation} failed: ${detail}`)
    this.name = 'GitCommandError'
  }
}

function readAll(reader: SubprocessOutputReader | undefined, stream: string): string {
  if (reader === undefined) throw new Error(`git ${stream} was not collected`)
  const value = reader.readFrom(0)
  if (value.lossy) throw new Error(`git ${stream} exceeded the configured capture limit`)
  return value.text
}

/** Execute Git without a shell and fail with bounded diagnostics. */
export async function runGit(
  ctx: Context,
  cwd: string,
  args: readonly string[],
  signal: AbortSignal | undefined,
  config: GitConfig,
): Promise<GitResult> {
  const git = await ctx.subprocess.resolveExecutable(config.command, undefined, signal)
  const collect = { maxBytes: config.maxOutputBytes }
  const handle = ctx.subprocess.spawn({
    argv: [git, ...args],
    cwd,
    stdio: { stdin: 'ignore', stdout: collect, stderr: collect },
    graceMs: config.graceMs,
    signal,
    env: { LC_ALL: 'C', LANG: 'C' },
  })
  const outcome = await handle.done
  const stdout = readAll(handle.collected.stdout, 'stdout')
  const stderr = readAll(handle.collected.stderr, 'stderr')
  if (outcome.exitCode !== 0) {
    throw new GitCommandError(args, outcome.exitCode, stdout, stderr)
  }
  return { stdout, stderr }
}

/** Resolve and validate the private durable evidence root. */
export async function resolveRunsRoot(configured: string | undefined): Promise<string> {
  const target = configured === undefined ? join(homedir(), '.dsh', 'dual-model-eval') : configured
  if (!isAbsolute(target)) throw new Error('dual-model-eval runsRoot must be an absolute path')
  await mkdir(target, { recursive: true, mode: 0o700 })
  const info = await stat(target)
  if (!info.isDirectory()) throw new Error(`dual-model-eval runsRoot is not a directory: ${target}`)
  return realpath(target)
}

/** Write one UTF-8 evidence file with private permissions. */
export async function writeEvidence(path: string, value: string): Promise<void> {
  const parent = path.slice(0, path.lastIndexOf('/'))
  await mkdir(parent, { recursive: true, mode: 0o700 })
  await writeFile(path, value, { encoding: 'utf8', mode: 0o600 })
}
