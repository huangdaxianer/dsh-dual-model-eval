import type {
  ChatConversationViewNode, ConversationMatch, ConversationNodeContext, ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-runtime/client'
import type {
  DualEvalModelRoute, DualEvalRunStatus, DualEvalToolEvidence, DualEvalWorkerEvidence,
  DualEvalWorkerMetrics, DualEvalWorkerProgress,
} from '../types.ts'

export interface DualEvalWorkerProgressSnapshot {
  readonly childSessionId: string
  readonly elapsedMs: number
  readonly metrics: DualEvalWorkerMetrics
  readonly tools: readonly DualEvalToolEvidence[]
  readonly toolsTruncated: boolean
}

export interface DualEvalWorkerSnapshot {
  readonly route: DualEvalModelRoute
  readonly started: boolean
  readonly startedAt?: number
  readonly progress?: DualEvalWorkerProgressSnapshot
  readonly evidence?: DualEvalWorkerEvidence
}

export interface DualEvalRunSnapshot {
  readonly runId: string
  readonly task: string
  readonly repository: string
  readonly baseCommit: string
  readonly artifactDirectory: string
  readonly startedAt: number
  readonly status: 'running' | DualEvalRunStatus
  readonly elapsedMs?: number
  readonly worktreesKept: boolean
  readonly cleanupErrors: readonly string[]
  readonly error?: string
  readonly adopted?: { readonly index: number; readonly commit: string }
  readonly workers: readonly DualEvalWorkerSnapshot[]
}

interface RunState {
  readonly runId: string
  readonly task: string
  readonly repository: string
  readonly baseCommit: string
  readonly artifactDirectory: string
  readonly startedAt: number
  readonly status: 'running' | DualEvalRunStatus
  readonly elapsedMs?: number
  readonly worktreesKept: boolean
  readonly cleanupErrors: readonly string[]
  readonly error?: string
  readonly adopted?: { readonly index: number; readonly commit: string }
  readonly workers: ReadonlyMap<number, DualEvalWorkerSnapshot>
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    /** One durable multi-model comparison run rendered inside the ordinary Chat flow. */
    'dual-eval-run': DualEvalRunSnapshot
  }
}

function buildSnapshot(state: RunState): DualEvalRunSnapshot {
  return {
    runId: state.runId,
    task: state.task,
    repository: state.repository,
    baseCommit: state.baseCommit,
    artifactDirectory: state.artifactDirectory,
    startedAt: state.startedAt,
    status: state.status,
    ...(state.elapsedMs === undefined ? {} : { elapsedMs: state.elapsedMs }),
    worktreesKept: state.worktreesKept,
    cleanupErrors: state.cleanupErrors,
    ...(state.error === undefined ? {} : { error: state.error }),
    ...(state.adopted === undefined ? {} : { adopted: state.adopted }),
    workers: [...state.workers.values()].sort((left, right) => left.route.index - right.route.index),
  }
}

function eventRunId(match: ConversationMatch): string {
  const data = match.event.data as { runId: string }
  return data.runId
}

function mergeProgress(
  current: DualEvalWorkerProgressSnapshot | undefined,
  next: DualEvalWorkerProgress,
): DualEvalWorkerProgressSnapshot {
  let tools = next.tools ?? current?.tools ?? []
  const changedTool = next.tool
  if (changedTool !== undefined) {
    const index = tools.findIndex(tool => tool.callId === changedTool.callId)
    tools = index < 0
      ? [...tools, changedTool]
      : tools.map((tool, candidate) => candidate === index ? changedTool : tool)
  }
  return {
    childSessionId: next.childSessionId,
    elapsedMs: next.elapsedMs,
    metrics: next.metrics,
    tools,
    toolsTruncated: next.toolsTruncated,
  }
}

export const dualEvalRunDefinition: ConversationNodeDefinition<RunState> = {
  kind: 'dual-eval-run',
  target: 'chat',
  match: (event) => {
    if (event.type === 'dual-eval/run-start') return { id: event.data.runId, role: 'start' }
    if (event.type === 'dual-eval/worker-start'
      || event.type === 'dual-eval/worker-progress'
      || event.type === 'dual-eval/worker-end'
      || event.type === 'dual-eval/run-end'
      || event.type === 'dual-eval/adopted') {
      return { id: event.data.runId, role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'dual-eval/run-start') throw new Error('dual-eval run started without run-start')
    return {
      runId: match.event.data.runId,
      task: match.event.data.task,
      repository: match.event.data.repository,
      baseCommit: match.event.data.baseCommit,
      artifactDirectory: match.event.data.artifactDirectory,
      startedAt: match.event.time,
      status: 'running',
      worktreesKept: false,
      cleanupErrors: [],
      workers: new Map(match.event.data.models.map(route => [route.index, { route, started: false }])),
    }
  },
  update: (context, match) => {
    const state = context.state
    if (eventRunId(match) !== state.runId) return state
    if (match.event.type === 'dual-eval/worker-start') {
      const workers = new Map(state.workers)
      workers.set(match.event.data.model.index, {
        route: match.event.data.model,
        started: true,
        startedAt: match.event.time,
      })
      return { ...state, workers }
    }
    if (match.event.type === 'dual-eval/worker-progress') {
      const workers = new Map(state.workers)
      const index = match.event.data.progress.index
      const current = workers.get(index)
      if (current === undefined) return state
      workers.set(index, {
        ...current,
        started: true,
        progress: mergeProgress(current.progress, match.event.data.progress),
      })
      return { ...state, workers }
    }
    if (match.event.type === 'dual-eval/worker-end') {
      const workers = new Map(state.workers)
      const index = match.event.data.evidence.index
      const previous = workers.get(index)
      workers.set(index, {
        route: match.event.data.evidence,
        started: true,
        ...(previous?.startedAt === undefined ? {} : { startedAt: previous.startedAt }),
        evidence: match.event.data.evidence,
      })
      return { ...state, workers }
    }
    if (match.event.type === 'dual-eval/run-end') {
      return {
        ...state,
        status: match.event.data.status,
        elapsedMs: match.event.data.elapsedMs,
        worktreesKept: match.event.data.worktreesKept,
        cleanupErrors: match.event.data.cleanupErrors,
        ...(match.event.data.error === undefined ? {} : { error: match.event.data.error }),
      }
    }
    if (match.event.type === 'dual-eval/adopted') {
      return {
        ...state,
        adopted: { index: match.event.data.index, commit: match.event.data.commit },
      }
    }
    return state
  },
  buildViewNode: (context: ConversationNodeContext<RunState>): ChatConversationViewNode | null => {
    if (context.state === undefined || context.start === undefined) return null
    return {
      key: context.key,
      kind: 'dual-eval-run',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start.event.seq,
      location: context.start.location,
      visibility: 'visible',
      data: buildSnapshot(context.state),
    }
  },
}
