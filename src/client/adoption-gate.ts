import type {
  ChatSnapshot, ISessions, SessionId,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { DualEvalRunSnapshot } from './comparison-view-model.ts'

const BLOCK_OWNER = 'ui-dual-model-eval'

interface ComposerBlockFace {
  setFor(sessionId: SessionId, owner: string, block: { readonly reason: string } | undefined): void
}

function latestComparison(chat: ChatSnapshot): DualEvalRunSnapshot | undefined {
  for (let index = chat.order.length - 1; index >= 0; index -= 1) {
    const key = chat.order[index]
    if (key === undefined) continue
    const node = chat.nodes.get(key)
    if (node?.kind === 'dual-eval-run') return node.data as DualEvalRunSnapshot
  }
  return undefined
}

/** Whether the latest comparison has a usable result but still needs an adoption. */
export function requiresComparisonAdoption(chat: ChatSnapshot): boolean {
  const run = latestComparison(chat)
  return run !== undefined
    && run.status === 'completed'
    && run.adopted === undefined
    && run.workers.some(worker =>
      worker.evidence?.stopReason === 'completed' && worker.evidence.error === undefined,
    )
}

/** Keeps each listed session's composer block in sync with its latest comparison run. */
export class ComparisonAdoptionGate {
  private readonly sessionStops = new Map<SessionId, () => void>()
  private listStop: (() => void) | undefined

  constructor(
    private readonly sessions: ISessions,
    private readonly blocks: ComposerBlockFace,
    private readonly reason: () => string,
  ) {}

  /** Begin observing the list and every listed session. */
  start(): () => void {
    this.reconcile()
    this.listStop = this.sessions.list.subscribe(() => { this.reconcile() })
    return () => { this.dispose() }
  }

  private reconcile(): void {
    const ids = new Set(this.sessions.list.getSnapshot().ids)
    for (const sessionId of ids) {
      if (this.sessionStops.has(sessionId)) continue
      const session = this.sessions.binding(sessionId)?.session
      if (session === undefined) continue
      const publish = (): void => {
        this.blocks.setFor(
          sessionId,
          BLOCK_OWNER,
          requiresComparisonAdoption(session.getSnapshot().chat) ? { reason: this.reason() } : undefined,
        )
      }
      publish()
      this.sessionStops.set(sessionId, session.subscribe(publish))
    }
    for (const [sessionId, stop] of this.sessionStops) {
      if (ids.has(sessionId)) continue
      stop()
      this.blocks.setFor(sessionId, BLOCK_OWNER, undefined)
      this.sessionStops.delete(sessionId)
    }
  }

  private dispose(): void {
    this.listStop?.()
    this.listStop = undefined
    for (const [sessionId, stop] of this.sessionStops) {
      stop()
      this.blocks.setFor(sessionId, BLOCK_OWNER, undefined)
    }
    this.sessionStops.clear()
  }
}
