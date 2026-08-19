/** Multi-model coding comparison over isolated detached Git worktrees. */
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'
import { mkdir, readFile, realpath } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { foldConsumedWork, type Agent } from '@deepseek-ai/dsh-agent'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { createUserMessage, type ContentBlock } from '@deepseek-ai/dsh-llm'
import { KNOWN_SESSION_EVENT_TYPES } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { SubagentResult, SubagentRun } from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { registerCandidateFileRoutes } from './files.ts'
import {
  GitCommandError, runGit, resolveRunsRoot, writeEvidence, type GitConfig,
} from './git.ts'
import { IsolatedWorktreeProvider } from './isolated-provider.ts'
import type {
  DualEvalChangeStats, DualEvalModelRoute, DualEvalRunStatus, DualEvalToolEvidence,
  DualEvalWorkerEvidence, DualEvalWorkerMetrics, DualEvalWorkerProgress,
} from './types.ts'

export const name = 'client-ui-dual-model-eval'
export const inject = ['commands', 'subagents', 'subprocess']

const COMMAND_NAME = 'compare-models'
const ADOPT_COMMAND_NAME = 'compare-models-adopt'
const PROVIDER_NAME = 'dual-eval-worktree-ui'
const MAX_WIRE_BYTES = 256 * 1024
const MAX_TASK_CHARS = 50_000
const MAX_CAPTURED_TOOLS = 100
const MAX_TOOL_TEXT_CHARS = 12_000
const EVENT_TYPES = [
  'dual-eval/adopted',
  'dual-eval/run-end',
  'dual-eval/run-start',
  'dual-eval/worker-end',
  'dual-eval/worker-progress',
  'dual-eval/worker-start',
] as const
const CHILD_PERSONA = 'You are one candidate in a controlled coding evaluation. '
  + 'Work directly in the current Git worktree and implement the requested change. '
  + 'Inspect the repository before editing, make concrete file changes, and run relevant tests when possible. '
  + 'Do not create Git commits, branches, or additional worktrees. '
  + 'Finish with a concise summary of changed files, verification performed, and any remaining blocker.'

export interface Config {
  runsRoot?: string
  initializeNonGitWorkspace?: boolean
  requireCleanWorktree?: boolean
  keepWorktrees?: boolean
  timeoutMs?: number
  maxModels?: number
  maxResponseChars?: number
  maxStatusChars?: number
  maxPatchPreviewChars?: number
  maxAcceptedHistoryChars?: number
  gitCommand?: string
  gitGraceMs?: number
  gitMaxOutputBytes?: number
}

export const Config: z<Config> = z.object({
  runsRoot: z.string(),
  initializeNonGitWorkspace: z.boolean().default(true),
  requireCleanWorktree: z.boolean().default(true),
  keepWorktrees: z.boolean().default(false),
  timeoutMs: z.number().step(1).min(1).default(1_800_000),
  maxModels: z.number().step(1).min(2).max(8).default(4),
  maxResponseChars: z.number().step(1).min(1_000).default(60_000),
  maxStatusChars: z.number().step(1).min(1_000).default(20_000),
  maxPatchPreviewChars: z.number().step(1).min(1_000).default(40_000),
  maxAcceptedHistoryChars: z.number().step(1).min(1_000).default(80_000),
  gitCommand: z.string().default('git'),
  gitGraceMs: z.number().step(1).min(1).default(5_000),
  gitMaxOutputBytes: z.number().step(1).min(1_024).default(8 * 1_024 * 1_024),
})

interface ResolvedConfig extends Required<Omit<Config, 'runsRoot'>> {
  readonly runsRoot?: string
}

interface ComparisonPayload {
  readonly version: 1
  readonly runId: string
  readonly task: string
  readonly baseRef?: string
  readonly models: readonly DualEvalModelRoute[]
}

interface AdoptionPayload {
  readonly version: 1
  readonly runId: string
  readonly index: number
}

interface SettledChild {
  readonly result: SubagentResult
  readonly terminalDetail?: string
  readonly events: readonly SessionEvent[]
}

interface CappedText {
  readonly value: string
  readonly truncated: boolean
}

interface ResolvedRepository {
  readonly path: string
  readonly initialized: boolean
}

interface TraceObservation {
  readonly emit: boolean
  readonly tool?: DualEvalToolEvidence
}

interface AcceptedRoundContext {
  readonly sequence: number
  readonly task: string
  readonly modelLabel: string
  readonly response: string
  readonly commit: string
}

export interface AcceptedHistoryProjection {
  readonly text: string
  readonly totalRounds: number
  readonly includedRounds: number
  readonly truncated: boolean
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function contentText(content: readonly ContentBlock[]): string {
  return content
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('')
}

function cap(value: string, limit: number): CappedText {
  if (value.length <= limit) return { value, truncated: false }
  return { value: `${value.slice(0, limit)}\n… [已截断 ${String(value.length - limit)} 个字符]`, truncated: true }
}

type MutableMetrics = { -readonly [Key in keyof DualEvalWorkerMetrics]: DualEvalWorkerMetrics[Key] }

function zeroMetrics(): MutableMetrics {
  return {
    steps: 0,
    llmMs: 0,
    toolMs: 0,
    ttftMs: 0,
    ttftSteps: 0,
    decodeMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    toolCalls: 0,
  }
}

function stepKey(turn: number, step: number): string {
  return `${String(turn)}:${String(step)}`
}

function boundedToolContent(content: readonly ContentBlock[]): readonly ContentBlock[] {
  return content.flatMap((block): ContentBlock[] => {
    if (block.type !== 'text') return []
    return [{ ...block, text: cap(block.text, MAX_TOOL_TEXT_CHARS).value }]
  })
}

function cloneTool(tool: DualEvalToolEvidence): DualEvalToolEvidence {
  return { ...tool, content: [...tool.content] }
}

/** O(1)-per-event projector shared by durable final capture and live progress. */
class ChildTraceTracker {
  private readonly metrics = zeroMetrics()
  private readonly starts = new Map<string, number>()
  private readonly firstTokens = new Map<string, number>()
  private readonly toolStarts = new Map<string, Extract<SessionEvent, { type: 'tool/call' }>>()
  private readonly toolIndexes = new Map<string, number>()
  private readonly tools: DualEvalToolEvidence[] = []

  observe(event: SessionEvent): TraceObservation {
    if (event.type === 'step/start') {
      this.starts.set(stepKey(event.data.turn, event.data.step), event.time)
      return { emit: true }
    }
    if (event.type === 'assistant/chunk') {
      const key = stepKey(event.data.turn, event.data.step)
      const chunk = event.data.chunk
      if (!this.firstTokens.has(key) && (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta')) {
        this.firstTokens.set(key, event.time)
      }
      return { emit: false }
    }
    if (event.type === 'assistant/message') {
      const key = stepKey(event.data.turn, event.data.step)
      const startedAt = this.starts.get(key)
      const firstTokenAt = this.firstTokens.get(key)
      this.metrics.steps += 1
      if (startedAt !== undefined) this.metrics.llmMs += Math.max(0, event.time - startedAt)
      if (startedAt !== undefined && firstTokenAt !== undefined) {
        this.metrics.ttftMs += Math.max(0, firstTokenAt - startedAt)
        this.metrics.ttftSteps += 1
        this.metrics.decodeMs += Math.max(0, event.time - firstTokenAt)
      }
      const usage = event.data.usage
      if (usage !== undefined) {
        this.metrics.inputTokens += usage.inputTokens
        this.metrics.outputTokens += usage.outputTokens
        this.metrics.cacheReadTokens += usage.cacheReadTokens ?? 0
        this.metrics.cacheWriteTokens += usage.cacheWriteTokens ?? 0
        this.metrics.reasoningTokens += usage.reasoningTokens ?? 0
      }
      return { emit: true }
    }
    if (event.type === 'tool/call') {
      const callId = String(event.data.callId)
      this.metrics.toolCalls += 1
      this.toolStarts.set(callId, event)
      if (this.tools.length >= MAX_CAPTURED_TOOLS) return { emit: true }
      const tool: DualEvalToolEvidence = {
        seq: event.seq,
        callId,
        name: event.data.name,
        argsRaw: event.data.arguments,
        startedAt: event.time,
        content: [],
        isError: false,
      }
      this.toolIndexes.set(callId, this.tools.length)
      this.tools.push(tool)
      return { emit: true, tool: cloneTool(tool) }
    }
    if (event.type !== 'tool/result') return { emit: false }
    const callId = String(event.data.message.source.callId)
    const start = this.toolStarts.get(callId)
    const result = event.data.message.content[0]
    if (start !== undefined) this.metrics.toolMs += Math.max(0, event.time - start.time)
    const index = this.toolIndexes.get(callId)
    if (index === undefined) return { emit: true }
    const previous = this.tools[index]
    if (previous === undefined) return { emit: true }
    const tool: DualEvalToolEvidence = {
      ...previous,
      seq: event.seq,
      endedAt: event.time,
      content: boundedToolContent(result.content),
      isError: result.isError ?? false,
      ...(event.data.error === undefined ? {} : { error: event.data.error }),
      ...(event.data.meta === undefined ? {} : { meta: event.data.meta }),
    }
    this.tools[index] = tool
    return { emit: true, tool: cloneTool(tool) }
  }

  snapshot(): {
    readonly metrics: DualEvalWorkerMetrics
    readonly tools: readonly DualEvalToolEvidence[]
    readonly toolsTruncated: boolean
  } {
    return {
      metrics: { ...this.metrics },
      tools: this.tools.map(cloneTool),
      toolsTruncated: this.metrics.toolCalls > this.tools.length,
    }
  }
}

/** Fold actual child Session events into bounded native Tool rows and provider metrics. */
export function projectChildTrace(events: readonly SessionEvent[]): ReturnType<ChildTraceTracker['snapshot']> {
  const tracker = new ChildTraceTracker()
  for (const event of events) tracker.observe(event)
  return tracker.snapshot()
}

interface LiveTraceHandle {
  readonly snapshot: () => ReturnType<ChildTraceTracker['snapshot']>
  readonly dispose: () => void
}

/** Mirror semantic child lifecycle boundaries into one bounded parent projection. */
function streamChildTrace(
  ctx: Context,
  parent: Agent,
  child: Agent,
  runId: string,
  index: number,
  childSessionId: string,
  startedAt: number,
): LiveTraceHandle {
  const tracker = new ChildTraceTracker()
  const queued: SessionEvent[] = []
  let seeding = true
  const publish = (observation: TraceObservation) => {
    if (!observation.emit) return
    const snapshot = tracker.snapshot()
    const progress: DualEvalWorkerProgress = {
      index,
      childSessionId,
      elapsedMs: Date.now() - startedAt,
      metrics: snapshot.metrics,
      ...(observation.tool === undefined ? {} : { tool: observation.tool }),
      toolsTruncated: snapshot.toolsTruncated,
    }
    parent.session.append('dual-eval/worker-progress', { runId, progress })
  }
  const consume = (event: SessionEvent) => { publish(tracker.observe(event)) }
  const dispose = ctx.on('session/event', (session, event) => {
    if (session !== child.session) return
    if (seeding) queued.push(event)
    else consume(event)
  })

  const initial = [...child.session.events]
  for (const event of initial) tracker.observe(event)
  const initialLastSeq = initial.at(-1)?.seq ?? -1
  const snapshot = tracker.snapshot()
  parent.session.append('dual-eval/worker-progress', {
    runId,
    progress: {
      index,
      childSessionId,
      elapsedMs: Date.now() - startedAt,
      metrics: snapshot.metrics,
      tools: snapshot.tools,
      toolsTruncated: snapshot.toolsTruncated,
    },
  })
  seeding = false
  queued
    .filter(event => event.seq > initialLastSeq)
    .sort((left, right) => left.seq - right.seq)
    .forEach(consume)
  return { snapshot: () => tracker.snapshot(), dispose }
}

/** Parse Git --numstat output without deriving line counts from rendered patches. */
export function parseNumstat(output: string): DualEvalChangeStats {
  let additions = 0
  let deletions = 0
  let filesChanged = 0
  let binaryFiles = 0
  const files: string[] = []
  for (const line of output.split('\n')) {
    if (line === '') continue
    const [added, deleted, ...pathParts] = line.split('\t')
    if (added === undefined || deleted === undefined) continue
    filesChanged += 1
    const path = pathParts.join('\t')
    if (path !== '') files.push(path)
    if (added === '-' || deleted === '-') {
      binaryFiles += 1
      continue
    }
    additions += Number.parseInt(added, 10) || 0
    deletions += Number.parseInt(deleted, 10) || 0
  }
  return { additions, deletions, filesChanged, binaryFiles, files }
}

function requiredString(value: unknown, field: string, max = 512): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  const normalized = value.trim()
  if (normalized === '') throw new Error(`${field} must be non-empty`)
  if (normalized.length > max) throw new Error(`${field} exceeds ${String(max)} characters`)
  return normalized
}

function isMissingRepository(cause: unknown): boolean {
  return cause instanceof GitCommandError && cause.stderr.includes('not a git repository')
}

async function resolveRepository(
  ctx: Context,
  cwd: string,
  signal: AbortSignal,
  git: GitConfig,
  initializeNonGitWorkspace: boolean,
): Promise<ResolvedRepository> {
  try {
    const path = (await runGit(ctx, cwd, ['rev-parse', '--show-toplevel'], signal, git)).stdout.trim()
    return { path: await realpath(path), initialized: false }
  } catch (cause: unknown) {
    if (!initializeNonGitWorkspace || !isMissingRepository(cause)) throw cause
  }

  try {
    await runGit(ctx, cwd, ['init', '--quiet'], signal, git)
    await runGit(ctx, cwd, ['add', '-A', '--', '.'], signal, git)
    await runGit(ctx, cwd, [
      '-c', 'user.name=DeepSeek Harness',
      '-c', 'user.email=deepseek-harness@localhost',
      '-c', 'commit.gpgsign=false',
      'commit', '--allow-empty', '--no-verify', '--quiet',
      '-m', 'Initialize DeepSeek Harness comparison baseline',
    ], signal, git)
    const path = (await runGit(ctx, cwd, ['rev-parse', '--show-toplevel'], signal, git)).stdout.trim()
    return { path: await realpath(path), initialized: true }
  } catch (cause: unknown) {
    throw new Error(`compare-models could not initialize a Git baseline in ${cwd}: ${errorText(cause)}`)
  }
}

function parsePayload(rawInput: string, maxModels: number): ComparisonPayload {
  const encoded = rawInput.trim()
  if (encoded === '') throw new Error('compare-models requires an encoded request')
  if (encoded.length > MAX_WIRE_BYTES) throw new Error('compare-models request is too large')
  let wire: unknown
  try {
    wire = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    throw new Error('compare-models request is not valid base64url JSON')
  }
  if (typeof wire !== 'object' || wire === null) throw new Error('compare-models request must be an object')
  const value = wire as Record<string, unknown>
  if (value.version !== 1) throw new Error('compare-models request version is unsupported')
  const runId = requiredString(value.runId, 'runId', 64)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(runId)) {
    throw new Error('compare-models runId must be a UUID')
  }
  const task = requiredString(value.task, 'task', MAX_TASK_CHARS)
  const baseRef = value.baseRef === undefined ? undefined : requiredString(value.baseRef, 'baseRef', 256)
  if (baseRef?.startsWith('-') === true) throw new Error('compare-models baseRef must not start with "-"')
  if (!Array.isArray(value.models) || value.models.length < 2 || value.models.length > maxModels) {
    throw new Error(`compare-models requires between 2 and ${String(maxModels)} models`)
  }
  const seen = new Set<string>()
  const models = value.models.map((candidate, index): DualEvalModelRoute => {
    if (typeof candidate !== 'object' || candidate === null) throw new Error(`models[${String(index)}] must be an object`)
    const row = candidate as Record<string, unknown>
    const provider = requiredString(row.provider, `models[${String(index)}].provider`, 256)
    const model = requiredString(row.model, `models[${String(index)}].model`, 256)
    const reasoningEffort = row.reasoningEffort === undefined
      ? undefined
      : requiredString(row.reasoningEffort, `models[${String(index)}].reasoningEffort`, 128)
    const identity = `${provider}\u0000${model}\u0000${reasoningEffort ?? ''}`
    if (seen.has(identity)) throw new Error(`models[${String(index)}] duplicates an earlier route`)
    seen.add(identity)
    return {
      index,
      label: requiredString(row.label, `models[${String(index)}].label`, 256),
      providerLabel: requiredString(row.providerLabel, `models[${String(index)}].providerLabel`, 256),
      provider,
      model,
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    }
  })
  return { version: 1, runId, task, models, ...(baseRef === undefined ? {} : { baseRef }) }
}

function parseAdoptionPayload(rawInput: string): AdoptionPayload {
  const encoded = rawInput.trim()
  if (encoded === '' || encoded.length > MAX_WIRE_BYTES) throw new Error('compare-models-adopt request is invalid')
  let wire: unknown
  try {
    wire = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    throw new Error('compare-models-adopt request is not valid base64url JSON')
  }
  if (typeof wire !== 'object' || wire === null) throw new Error('compare-models-adopt request must be an object')
  const value = wire as Record<string, unknown>
  if (value.version !== 1) throw new Error('compare-models-adopt request version is unsupported')
  const runId = requiredString(value.runId, 'runId', 64)
  if (!Number.isSafeInteger(value.index) || (value.index as number) < 0) {
    throw new Error('compare-models-adopt index must be a non-negative safe integer')
  }
  return { version: 1, runId, index: value.index as number }
}

function acceptedRoundBlock(round: AcceptedRoundContext): string {
  return [
    `## Accepted round ${String(round.sequence)}`,
    `User request:\n${round.task}`,
    `Accepted candidate: ${round.modelLabel}`,
    `Accepted commit: ${round.commit}`,
    `Accepted final response:\n${round.response === '' ? '(The accepted candidate returned no text.)' : round.response}`,
  ].join('\n\n')
}

/** Project only adopted rounds into bounded shared context for fresh child Sessions. */
export function projectAcceptedHistory(
  events: readonly SessionEvent[],
  maxChars: number,
): AcceptedHistoryProjection {
  const starts = new Map<string, Extract<SessionEvent, { type: 'dual-eval/run-start' }>>()
  const workers = new Map<string, Extract<SessionEvent, { type: 'dual-eval/worker-end' }>>()
  const rounds: AcceptedRoundContext[] = []
  for (const event of events) {
    if (event.type === 'dual-eval/run-start') {
      starts.set(event.data.runId, event)
      continue
    }
    if (event.type === 'dual-eval/worker-end') {
      workers.set(`${event.data.runId}\u0000${String(event.data.evidence.index)}`, event)
      continue
    }
    if (event.type !== 'dual-eval/adopted') continue
    const start = starts.get(event.data.runId)
    const worker = workers.get(`${event.data.runId}\u0000${String(event.data.index)}`)
    if (start === undefined || worker === undefined) continue
    rounds.push({
      sequence: rounds.length + 1,
      task: start.data.task,
      modelLabel: event.data.model.label,
      response: worker.data.evidence.response,
      commit: event.data.commit,
    })
  }

  const selected: string[] = []
  let remaining = maxChars
  let truncated = false
  for (let index = rounds.length - 1; index >= 0; index -= 1) {
    const round = rounds[index]
    if (round === undefined) continue
    const block = acceptedRoundBlock(round)
    const separatorChars = selected.length === 0 ? 0 : 2
    if (block.length + separatorChars <= remaining) {
      selected.unshift(block)
      remaining -= block.length + separatorChars
      continue
    }
    truncated = true
    if (selected.length === 0 && remaining > 80) {
      const marker = '\n\n… [older accepted response truncated]'
      selected.unshift(`${block.slice(0, Math.max(0, remaining - marker.length))}${marker}`)
    }
    break
  }
  if (selected.length < rounds.length) truncated = true
  return {
    text: selected.join('\n\n'),
    totalRounds: rounds.length,
    includedRounds: selected.length,
    truncated,
  }
}

function childPrompt(task: string, baseCommit: string, acceptedHistory: string): string {
  const history = acceptedHistory === ''
    ? ''
    : [
      'Accepted conversation history from earlier rounds follows.',
      'It is inherited project context: use it to resolve references in the current request.',
      'The current request is authoritative if it conflicts with older text.',
      'Do not claim that you cannot see previous rounds when this section is present.',
      '',
      acceptedHistory,
      '',
      '--- End accepted conversation history ---',
      '',
    ].join('\n')
  return `${history}Current evaluation task:\n${task}\n\nThe worktree starts from Git commit ${baseCommit}, which includes the adopted code baseline. Inspect it and continue development only in this worktree.`
}

async function settle(run: SubagentRun): Promise<SettledChild> {
  try {
    const result = await run.result
    const reason = run.localAgent === undefined
      ? undefined
      : foldConsumedWork(run.localAgent.session.events).end?.data.reason
    const terminalDetail = reason?.kind === 'error'
      ? reason.error.message
      : reason === undefined || reason.kind === 'completed'
        ? undefined
        : reason.kind
    const events = run.localAgent === undefined ? [] : [...run.localAgent.session.events]
    return { result, events, ...(terminalDetail === undefined ? {} : { terminalDetail }) }
  } finally {
    await run.dispose()
  }
}

async function captureWorker(
  ctx: Context,
  runId: string,
  route: DualEvalModelRoute,
  task: string,
  baseCommit: string,
  acceptedHistory: string,
  worktree: string,
  artifactDirectory: string,
  parent: Agent,
  signal: AbortSignal,
  git: GitConfig,
  config: ResolvedConfig,
): Promise<DualEvalWorkerEvidence> {
  const startedAt = Date.now()
  const directory = join(artifactDirectory, `candidate-${String(route.index + 1).padStart(2, '0')}`)
  const responsePath = join(directory, 'response.json')
  const statusPath = join(directory, 'status.txt')
  const patchPath = join(directory, 'changes.patch')
  let childSessionId: string | undefined
  let stopReason = 'error'
  let response = ''
  let error: string | undefined
  let trace = { metrics: zeroMetrics(), tools: [] as readonly DualEvalToolEvidence[], toolsTruncated: false }
  let changes: DualEvalChangeStats = {
    additions: 0,
    deletions: 0,
    filesChanged: 0,
    binaryFiles: 0,
    files: [],
  }
  parent.session.append('dual-eval/worker-start', { runId, model: route })

  try {
    const run = await ctx.subagents.start(PROVIDER_NAME, {
      label: `${route.label} isolated comparison`,
      prompt: [{ type: 'text', text: childPrompt(task, baseCommit, acceptedHistory) }],
      parent,
      signal,
      maxDepth: 1,
      persona: CHILD_PERSONA,
      agentOptions: {
        provider: route.provider,
        model: route.model,
        ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }),
        dualEvalWorktreeCwd: worktree,
      },
    })
    childSessionId = run.id
    const live = run.localAgent === undefined
      ? undefined
      : streamChildTrace(ctx, parent, run.localAgent, runId, route.index, run.id, startedAt)
    const settled = await (async () => {
      try {
        return await settle(run)
      } finally {
        live?.dispose()
        if (live !== undefined) trace = live.snapshot()
      }
    })()
    if (live === undefined) trace = projectChildTrace(settled.events)
    stopReason = settled.result.stopReason
    response = contentText(settled.result.output)
    if (settled.terminalDetail !== undefined && stopReason !== 'completed') error = settled.terminalDetail
    await writeEvidence(responsePath, `${JSON.stringify({
      childSessionId,
      stopReason,
      output: settled.result.output,
      ...(settled.terminalDetail === undefined ? {} : { terminalDetail: settled.terminalDetail }),
    }, null, 2)}\n`)
  } catch (cause: unknown) {
    error = errorText(cause)
    await writeEvidence(responsePath, `${JSON.stringify({ childSessionId, stopReason, error }, null, 2)}\n`)
  }

  let status = ''
  let patch = ''
  try {
    await runGit(ctx, worktree, ['add', '-N', '--', '.'], undefined, git)
    const [statusResult, patchResult, numstatResult] = await Promise.all([
      runGit(ctx, worktree, ['status', '--short', '--untracked-files=all'], undefined, git),
      runGit(ctx, worktree, ['diff', '--binary', '--no-ext-diff', '--full-index', baseCommit, '--', '.'], undefined, git),
      runGit(ctx, worktree, ['diff', '--numstat', '--no-ext-diff', baseCommit, '--', '.'], undefined, git),
    ])
    status = statusResult.stdout
    patch = patchResult.stdout
    changes = parseNumstat(numstatResult.stdout)
    await Promise.all([writeEvidence(statusPath, status), writeEvidence(patchPath, patch)])
  } catch (cause: unknown) {
    const detail = `artifact capture failed: ${errorText(cause)}`
    error = error === undefined ? detail : `${error}; ${detail}`
  }
  const renderedResponse = cap(response, config.maxResponseChars)
  const renderedStatus = cap(status, config.maxStatusChars)
  const renderedPatch = cap(patch, config.maxPatchPreviewChars)
  const evidence: DualEvalWorkerEvidence = {
    ...route,
    ...(childSessionId === undefined ? {} : { childSessionId }),
    stopReason,
    elapsedMs: Date.now() - startedAt,
    response: renderedResponse.value,
    status: renderedStatus.value,
    patchPreview: renderedPatch.value,
    responsePath,
    statusPath,
    patchPath,
    changes,
    metrics: trace.metrics,
    tools: trace.tools,
    toolsTruncated: trace.toolsTruncated,
    ...(config.keepWorktrees ? { worktreePath: worktree } : {}),
    responseTruncated: renderedResponse.truncated,
    statusTruncated: renderedStatus.truncated,
    patchTruncated: renderedPatch.truncated,
    ...(error === undefined ? {} : { error }),
  }
  parent.session.append('dual-eval/worker-end', {
    runId,
    evidence,
  })
  return evidence
}

async function runComparison(
  ctx: Context,
  payload: ComparisonPayload,
  invocation: CommandInvocation,
  config: ResolvedConfig,
): Promise<void> {
  const startedAt = Date.now()
  const parent = invocation.agent
  const latestEnd = parent.session.events.findLast(event => event.type === 'dual-eval/run-end')
  if (latestEnd !== undefined && latestEnd.data.status === 'completed') {
    const adopted = parent.session.events.some(event =>
      event.type === 'dual-eval/adopted' && event.data.runId === latestEnd.data.runId)
    if (!adopted) throw new Error('需要先采纳上一轮的一个模型结果，才能开始新的对比')
  }
  const acceptedHistory = projectAcceptedHistory(parent.session.events, config.maxAcceptedHistoryChars)
  const cwd = parent.session.header.cwd
  if (cwd === undefined) throw new Error('compare-models requires a session workspace')
  const git: GitConfig = {
    command: config.gitCommand,
    graceMs: config.gitGraceMs,
    maxOutputBytes: config.gitMaxOutputBytes,
  }
  const repository = await resolveRepository(
    ctx, cwd, invocation.signal, git, config.initializeNonGitWorkspace,
  )
  const canonicalRepository = repository.path
  if (config.requireCleanWorktree) {
    const dirty = (await runGit(ctx, canonicalRepository, [
      'status', '--porcelain=v1', '--untracked-files=normal',
    ], invocation.signal, git)).stdout
    if (dirty.length > 0) throw new Error('compare-models requires a clean working tree; commit or stash local changes first')
  }
  const baseCommit = (await runGit(ctx, canonicalRepository, [
    'rev-parse', '--verify', `${payload.baseRef ?? 'HEAD'}^{commit}`,
  ], invocation.signal, git)).stdout.trim()
  const root = await resolveRunsRoot(config.runsRoot)
  const runDirectory = join(root, `${basename(canonicalRepository)}-${payload.runId}`)
  const worktreesDirectory = join(runDirectory, 'worktrees')
  const artifactDirectory = join(runDirectory, 'artifacts')
  await Promise.all([
    mkdir(worktreesDirectory, { recursive: true, mode: 0o700 }),
    mkdir(artifactDirectory, { recursive: true, mode: 0o700 }),
  ])
  await writeEvidence(join(artifactDirectory, 'request.json'), `${JSON.stringify({
    ...payload,
    repository: canonicalRepository,
    repositoryInitialized: repository.initialized,
    baseCommit,
    acceptedContext: acceptedHistory,
  }, null, 2)}\n`)
  const turn = (parent.session.events.findLast(event => event.type === 'turn/start')?.data.turn ?? 0) + 1
  parent.session.append('turn/start', { turn })
  parent.session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: payload.task }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  parent.session.append('dual-eval/run-start', {
    runId: payload.runId,
    task: payload.task,
    repository: canonicalRepository,
    baseCommit,
    artifactDirectory,
    models: payload.models,
  })

  const created: string[] = []
  const cleanupErrors: string[] = []
  let models: readonly DualEvalWorkerEvidence[] = []
  let failure: string | undefined
  try {
    const worktrees: string[] = []
    for (const route of payload.models) {
      const path = join(worktreesDirectory, `candidate-${String(route.index + 1).padStart(2, '0')}`)
      await runGit(ctx, canonicalRepository, ['worktree', 'add', '--detach', path, baseCommit], invocation.signal, git)
      created.push(path)
      worktrees.push(path)
    }
    const timeoutSignal = AbortSignal.timeout(config.timeoutMs)
    const signal = AbortSignal.any([invocation.signal, timeoutSignal])
    models = await Promise.all(payload.models.map((route, index) => captureWorker(
      ctx,
      payload.runId,
      route,
      payload.task,
      baseCommit,
      acceptedHistory.text,
      worktrees[index] as string,
      artifactDirectory,
      parent,
      signal,
      git,
      config,
    )))
    if (signal.aborted) failure = errorText(signal.reason ?? new Error('comparison run cancelled'))
  } catch (cause: unknown) {
    failure = errorText(cause)
  } finally {
    if (!config.keepWorktrees) {
      for (const path of created.reverse()) {
        try {
          await runGit(ctx, canonicalRepository, ['worktree', 'remove', '--force', path], undefined, git)
        } catch (cause: unknown) {
          cleanupErrors.push(`${path}: ${errorText(cause)}`)
        }
      }
      try {
        await runGit(ctx, canonicalRepository, ['worktree', 'prune'], undefined, git)
      } catch (cause: unknown) {
        cleanupErrors.push(`prune: ${errorText(cause)}`)
      }
    }
  }
  const status: DualEvalRunStatus = failure === undefined
    ? 'completed'
    : invocation.signal.aborted ? 'cancelled' : 'error'
  const result = {
    runId: payload.runId,
    repository: canonicalRepository,
    repositoryInitialized: repository.initialized,
    baseCommit,
    artifactDirectory,
    status,
    elapsedMs: Date.now() - startedAt,
    worktreesKept: config.keepWorktrees || cleanupErrors.length > 0,
    cleanupErrors,
    models,
    ...(failure === undefined ? {} : { error: failure }),
  }
  try {
    await writeEvidence(join(artifactDirectory, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
  } catch (cause: unknown) {
    failure = failure === undefined ? errorText(cause) : `${failure}; ${errorText(cause)}`
  }
  parent.session.append('dual-eval/run-end', {
    runId: payload.runId,
    status: failure === undefined ? status : invocation.signal.aborted ? 'cancelled' : 'error',
    elapsedMs: Date.now() - startedAt,
    worktreesKept: config.keepWorktrees || cleanupErrors.length > 0,
    cleanupErrors,
    ...(failure === undefined ? {} : { error: failure }),
  })
  parent.session.append('turn/end', { turn, reason: { kind: 'completed' } })
}

function eventFor<T extends SessionEvent['type']>(
  events: readonly SessionEvent[],
  type: T,
  runId: string,
): Extract<SessionEvent, { type: T }> | undefined {
  return events.findLast((event): event is Extract<SessionEvent, { type: T }> =>
    event.type === type && 'runId' in event.data && event.data.runId === runId)
}

async function adoptCandidate(
  ctx: Context,
  payload: AdoptionPayload,
  invocation: CommandInvocation,
  config: ResolvedConfig,
): Promise<void> {
  const parent = invocation.agent
  const events = parent.session.events
  const start = eventFor(events, 'dual-eval/run-start', payload.runId)
  const end = eventFor(events, 'dual-eval/run-end', payload.runId)
  if (start === undefined || end === undefined) throw new Error('找不到已完成的对比运行')
  if (end.data.status !== 'completed') throw new Error('只有已完成的对比运行可以采纳')
  const existing = eventFor(events, 'dual-eval/adopted', payload.runId)
  if (existing !== undefined) {
    if (existing.data.index === payload.index) return
    throw new Error('这个对比运行已经采纳了另一个模型')
  }
  const model = start.data.models.find(candidate => candidate.index === payload.index)
  const worker = events.findLast((event): event is Extract<SessionEvent, { type: 'dual-eval/worker-end' }> =>
    event.type === 'dual-eval/worker-end'
      && event.data.runId === payload.runId
      && event.data.evidence.index === payload.index)
  if (model === undefined || worker === undefined) throw new Error('找不到要采纳的模型证据')
  if (worker.data.evidence.error !== undefined || worker.data.evidence.stopReason !== 'completed') {
    throw new Error('失败或未完成的模型结果不能采纳')
  }

  const repository = await realpath(start.data.repository)
  const git: GitConfig = {
    command: config.gitCommand,
    graceMs: config.gitGraceMs,
    maxOutputBytes: config.gitMaxOutputBytes,
  }
  const dirty = (await runGit(ctx, repository, [
    'status', '--porcelain=v1', '--untracked-files=normal',
  ], invocation.signal, git)).stdout
  if (dirty.length > 0) throw new Error('采纳前主工作区必须保持干净，请先提交或暂存本地修改')
  const currentHead = (await runGit(ctx, repository, [
    'rev-parse', '--verify', 'HEAD^{commit}',
  ], invocation.signal, git)).stdout.trim()
  if (currentHead !== start.data.baseCommit) {
    throw new Error('当前工作区 HEAD 已经变化，不能再采纳这个旧基线上的结果')
  }

  const artifactDirectory = await realpath(start.data.artifactDirectory)
  const patchPath = await realpath(worker.data.evidence.patchPath)
  const patchRelative = relative(artifactDirectory, patchPath)
  if (patchRelative.startsWith('..') || isAbsolute(patchRelative)) {
    throw new Error('候选补丁不属于这个对比运行的证据目录')
  }
  const adoptionWorktree = join(dirname(artifactDirectory), `adopt-${String(payload.index + 1)}-${randomUUID()}`)
  let created = false
  let commit: string | undefined
  try {
    await runGit(ctx, repository, [
      'worktree', 'add', '--detach', adoptionWorktree, start.data.baseCommit,
    ], invocation.signal, git)
    created = true
    const patch = await readFile(patchPath, 'utf8')
    if (patch.trim() !== '') {
      await runGit(ctx, adoptionWorktree, [
        'apply', '--index', '--binary', '--whitespace=nowarn', patchPath,
      ], invocation.signal, git)
    }
    await runGit(ctx, adoptionWorktree, [
      '-c', 'user.name=DeepSeek Harness',
      '-c', 'user.email=deepseek-harness@localhost',
      '-c', 'commit.gpgsign=false',
      'commit', '--allow-empty', '--no-verify', '--quiet',
      '-m', `Adopt ${model.label} from comparison ${payload.runId}`,
    ], invocation.signal, git)
    commit = (await runGit(ctx, adoptionWorktree, [
      'rev-parse', '--verify', 'HEAD^{commit}',
    ], invocation.signal, git)).stdout.trim()
    await runGit(ctx, repository, ['merge', '--ff-only', commit], invocation.signal, git)
    parent.session.append('dual-eval/adopted', {
      runId: payload.runId,
      index: payload.index,
      model,
      previousBaseCommit: start.data.baseCommit,
      commit,
    })
  } finally {
    if (created) {
      try {
        await runGit(ctx, repository, ['worktree', 'remove', '--force', adoptionWorktree], undefined, git)
        await runGit(ctx, repository, ['worktree', 'prune'], undefined, git)
      } catch {
        // Adoption already advanced the durable workspace; stale worktree metadata is recoverable.
      }
    }
  }
}

/** Register the Host command and isolated subagent provider. */
export function apply(ctx: Context, config: Config): void {
  const resolved = config as ResolvedConfig
  // Persistence imports this same Set instance. Extending it here lets an
  // installed Harness safely reload this out-of-tree plugin's durable events.
  const known = KNOWN_SESSION_EVENT_TYPES as Set<string>
  for (const eventType of EVENT_TYPES) known.add(eventType)
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(
      () => registerCandidateFileRoutes(httpCtx, {
        command: resolved.gitCommand,
        graceMs: resolved.gitGraceMs,
        maxOutputBytes: resolved.gitMaxOutputBytes,
        ...(resolved.runsRoot === undefined ? {} : { runsRoot: resolved.runsRoot }),
      }),
      'dsh-dual-model-eval: candidate file preview and downloads',
    )
  })
  ctx.subagents.registerProvider(new IsolatedWorktreeProvider(PROVIDER_NAME))
  ctx.commands.register({
    name: COMMAND_NAME,
    description: 'Run one coding task concurrently across selected models in isolated Git worktrees',
    input: { hint: '由对比测试界面生成' },
    recordInput: false,
    handler: async (invocation): Promise<CommandResult> => {
      try {
        const payload = parsePayload(invocation.rawInput, resolved.maxModels)
        await runComparison(ctx, payload, invocation, resolved)
        return { kind: 'success', text: '对比运行已完成' }
      } catch (cause: unknown) {
        return { kind: 'error', text: errorText(cause) }
      }
    },
  })
  ctx.commands.register({
    name: ADOPT_COMMAND_NAME,
    description: 'Commit one completed comparison candidate and advance the workspace baseline',
    input: { hint: '由对比结果卡片生成' },
    recordInput: false,
    handler: async (invocation): Promise<CommandResult> => {
      try {
        const payload = parseAdoptionPayload(invocation.rawInput)
        await adoptCandidate(ctx, payload, invocation, resolved)
        return { kind: 'success', text: '已采纳模型结果' }
      } catch (cause: unknown) {
        return { kind: 'error', text: errorText(cause) }
      }
    },
  })
}

export type {
  DualEvalChangeStats, DualEvalFilePreview, DualEvalFileRequest, DualEvalModelRoute,
  DualEvalRunStatus, DualEvalToolEvidence, DualEvalWorkerEvidence, DualEvalWorkerMetrics,
  DualEvalWorkerProgress, DualEvalWorkspaceRequest,
} from './types.ts'
