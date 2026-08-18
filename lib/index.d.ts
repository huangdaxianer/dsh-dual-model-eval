import z from "@deepseek-ai/schemastery";
import { ContentBlock } from "@deepseek-ai/dsh-llm";
import { Context } from "@deepseek-ai/cordis";
import { SessionEvent } from "@deepseek-ai/dsh-session/types";
//#region src/types.d.ts
/** Complete model route captured at submission time. */
interface DualEvalModelRoute {
  readonly index: number;
  readonly label: string;
  readonly providerLabel: string;
  readonly provider: string;
  readonly model: string;
  readonly reasoningEffort?: string;
}
/** One bounded native Tool lifecycle captured from the candidate Session. */
interface DualEvalToolEvidence {
  readonly seq: number;
  readonly callId: string;
  readonly name: string;
  readonly argsRaw: string;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly content: readonly ContentBlock[];
  readonly isError: boolean;
  readonly error?: {
    readonly name: string;
    readonly code: string;
  };
  readonly meta?: unknown;
}
/** Provider and wall-clock statistics folded from one candidate Session. */
interface DualEvalWorkerMetrics {
  readonly steps: number;
  readonly llmMs: number;
  readonly toolMs: number;
  readonly ttftMs: number;
  readonly ttftSteps: number;
  readonly decodeMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly reasoningTokens: number;
  readonly toolCalls: number;
}
/** Compact line-change evidence derived from Git numstat. */
interface DualEvalChangeStats {
  readonly additions: number;
  readonly deletions: number;
  readonly filesChanged: number;
  readonly binaryFiles: number;
}
/** One incremental bounded projection published while a candidate is still running. */
interface DualEvalWorkerProgress {
  readonly index: number;
  readonly childSessionId: string;
  readonly elapsedMs: number;
  readonly metrics: DualEvalWorkerMetrics;
  /** Full bounded seed used once when observation attaches after child publication. */
  readonly tools?: readonly DualEvalToolEvidence[];
  /** One subsequent Tool lifecycle delta, keyed by callId. */
  readonly tool?: DualEvalToolEvidence;
  readonly toolsTruncated: boolean;
}
/** One model's bounded durable evidence projection. */
interface DualEvalWorkerEvidence extends DualEvalModelRoute {
  readonly childSessionId?: string;
  readonly stopReason: string;
  readonly elapsedMs: number;
  readonly response: string;
  readonly status: string;
  readonly patchPreview: string;
  readonly responsePath: string;
  readonly statusPath: string;
  readonly patchPath: string;
  readonly changes?: DualEvalChangeStats;
  readonly metrics?: DualEvalWorkerMetrics;
  readonly tools?: readonly DualEvalToolEvidence[];
  readonly toolsTruncated?: boolean;
  readonly worktreePath?: string;
  readonly responseTruncated: boolean;
  readonly statusTruncated: boolean;
  readonly patchTruncated: boolean;
  readonly error?: string;
}
/** Final run disposition. Completion describes orchestration, not quality. */
type DualEvalRunStatus = 'completed' | 'cancelled' | 'error';
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Authoritative comparison request and common Git base. */
    'dual-eval/run-start': {
      runId: string;
      task: string;
      repository: string;
      baseCommit: string;
      artifactDirectory: string;
      models: readonly DualEvalModelRoute[];
    };
    /** One candidate began after its isolated worktree was created. */
    'dual-eval/worker-start': {
      runId: string;
      model: DualEvalModelRoute;
    };
    /** Incremental child trace projection; emitted only at semantic lifecycle boundaries. */
    'dual-eval/worker-progress': {
      runId: string;
      progress: DualEvalWorkerProgress;
    };
    /** One candidate settled and its bounded evidence was captured. */
    'dual-eval/worker-end': {
      runId: string;
      evidence: DualEvalWorkerEvidence;
    };
    /** The orchestrator settled after cleanup. */
    'dual-eval/run-end': {
      runId: string;
      status: DualEvalRunStatus;
      elapsedMs: number;
      worktreesKept: boolean;
      cleanupErrors: readonly string[];
      error?: string;
    };
    /** One completed candidate was committed and fast-forwarded into the workspace baseline. */
    'dual-eval/adopted': {
      runId: string;
      index: number;
      model: DualEvalModelRoute;
      previousBaseCommit: string;
      commit: string;
    };
  }
}
//#endregion
//#region src/index.d.ts
declare const name = "client-ui-dual-model-eval";
declare const inject: string[];
interface Config {
  runsRoot?: string;
  initializeNonGitWorkspace?: boolean;
  requireCleanWorktree?: boolean;
  keepWorktrees?: boolean;
  timeoutMs?: number;
  maxModels?: number;
  maxResponseChars?: number;
  maxStatusChars?: number;
  maxPatchPreviewChars?: number;
  gitCommand?: string;
  gitGraceMs?: number;
  gitMaxOutputBytes?: number;
}
declare const Config: z<Config>;
interface TraceObservation {
  readonly emit: boolean;
  readonly tool?: DualEvalToolEvidence;
}
/** O(1)-per-event projector shared by durable final capture and live progress. */
declare class ChildTraceTracker {
  private readonly metrics;
  private readonly starts;
  private readonly firstTokens;
  private readonly toolStarts;
  private readonly toolIndexes;
  private readonly tools;
  observe(event: SessionEvent): TraceObservation;
  snapshot(): {
    readonly metrics: DualEvalWorkerMetrics;
    readonly tools: readonly DualEvalToolEvidence[];
    readonly toolsTruncated: boolean;
  };
}
/** Fold actual child Session events into bounded native Tool rows and provider metrics. */
declare function projectChildTrace(events: readonly SessionEvent[]): ReturnType<ChildTraceTracker['snapshot']>;
/** Parse Git --numstat output without deriving line counts from rendered patches. */
declare function parseNumstat(output: string): DualEvalChangeStats;
/** Register the Host command and isolated subagent provider. */
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { Config, type DualEvalChangeStats, type DualEvalModelRoute, type DualEvalRunStatus, type DualEvalToolEvidence, type DualEvalWorkerEvidence, type DualEvalWorkerMetrics, type DualEvalWorkerProgress, apply, inject, name, parseNumstat, projectChildTrace };
//# sourceMappingURL=index.d.ts.map