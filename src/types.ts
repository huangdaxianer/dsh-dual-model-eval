/** Shared durable vocabulary for the multi-model worktree comparison plugin. */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'

/** Complete model route captured at submission time. */
export interface DualEvalModelRoute {
  readonly index: number
  readonly label: string
  readonly providerLabel: string
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

/** One bounded native Tool lifecycle captured from the candidate Session. */
export interface DualEvalToolEvidence {
  readonly seq: number
  readonly callId: string
  readonly name: string
  readonly argsRaw: string
  readonly startedAt: number
  readonly endedAt?: number
  readonly content: readonly ContentBlock[]
  readonly isError: boolean
  readonly error?: { readonly name: string; readonly code: string }
  readonly meta?: unknown
}

/** Provider and wall-clock statistics folded from one candidate Session. */
export interface DualEvalWorkerMetrics {
  readonly steps: number
  readonly llmMs: number
  readonly toolMs: number
  readonly ttftMs: number
  readonly ttftSteps: number
  readonly decodeMs: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  readonly reasoningTokens: number
  readonly toolCalls: number
}

/** Compact line-change evidence derived from Git numstat. */
export interface DualEvalChangeStats {
  readonly additions: number
  readonly deletions: number
  readonly filesChanged: number
  readonly binaryFiles: number
}

/** One incremental bounded projection published while a candidate is still running. */
export interface DualEvalWorkerProgress {
  readonly index: number
  readonly childSessionId: string
  readonly elapsedMs: number
  readonly metrics: DualEvalWorkerMetrics
  /** Full bounded seed used once when observation attaches after child publication. */
  readonly tools?: readonly DualEvalToolEvidence[]
  /** One subsequent Tool lifecycle delta, keyed by callId. */
  readonly tool?: DualEvalToolEvidence
  readonly toolsTruncated: boolean
}

/** One model's bounded durable evidence projection. */
export interface DualEvalWorkerEvidence extends DualEvalModelRoute {
  readonly childSessionId?: string
  readonly stopReason: string
  readonly elapsedMs: number
  readonly response: string
  readonly status: string
  readonly patchPreview: string
  readonly responsePath: string
  readonly statusPath: string
  readonly patchPath: string
  readonly changes?: DualEvalChangeStats
  readonly metrics?: DualEvalWorkerMetrics
  readonly tools?: readonly DualEvalToolEvidence[]
  readonly toolsTruncated?: boolean
  readonly worktreePath?: string
  readonly responseTruncated: boolean
  readonly statusTruncated: boolean
  readonly patchTruncated: boolean
  readonly error?: string
}

/** Final run disposition. Completion describes orchestration, not quality. */
export type DualEvalRunStatus = 'completed' | 'cancelled' | 'error'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Authoritative comparison request and common Git base. */
    'dual-eval/run-start': {
      runId: string
      task: string
      repository: string
      baseCommit: string
      artifactDirectory: string
      models: readonly DualEvalModelRoute[]
    }
    /** One candidate began after its isolated worktree was created. */
    'dual-eval/worker-start': {
      runId: string
      model: DualEvalModelRoute
    }
    /** Incremental child trace projection; emitted only at semantic lifecycle boundaries. */
    'dual-eval/worker-progress': {
      runId: string
      progress: DualEvalWorkerProgress
    }
    /** One candidate settled and its bounded evidence was captured. */
    'dual-eval/worker-end': {
      runId: string
      evidence: DualEvalWorkerEvidence
    }
    /** The orchestrator settled after cleanup. */
    'dual-eval/run-end': {
      runId: string
      status: DualEvalRunStatus
      elapsedMs: number
      worktreesKept: boolean
      cleanupErrors: readonly string[]
      error?: string
    }
    /** One completed candidate was committed and fast-forwarded into the workspace baseline. */
    'dual-eval/adopted': {
      runId: string
      index: number
      model: DualEvalModelRoute
      previousBaseCommit: string
      commit: string
    }
  }
}
