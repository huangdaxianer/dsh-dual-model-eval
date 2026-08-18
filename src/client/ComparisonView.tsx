import { useEffect, useState } from 'react'
import {
  DisclosureRow, IconApiOutline14, MarkdownText, StateDot, type StateDotState,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DualEvalRunSnapshot, DualEvalWorkerSnapshot } from './comparison-view-model.ts'
import type { DualEvalChangeStats, DualEvalToolEvidence, DualEvalWorkerMetrics } from '../types.ts'
import css from './ComparisonView.module.css'

export interface ComparisonRunInjected {
  readonly adopt: (runId: string, index: number) => Promise<void>
}

/** Complete props for the keyed comparison renderer in the Chat flow. */
export type ComparisonRunNodeProps =
  PropsRuntime<'conversation.chat.node', 'dual-eval-run'>
  & PropsLocale<'dualEval'>
  & ComparisonRunInjected

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function workerStatus(worker: DualEvalWorkerSnapshot, t: PropsLocale<'dualEval'>['t']): { label: string; dot: StateDotState } {
  const evidence = worker.evidence
  if (evidence === undefined) {
    return worker.started
      ? { label: t('worker.running'), dot: 'ongoing' }
      : { label: t('worker.pending'), dot: 'warning' }
  }
  if (evidence.error !== undefined || evidence.stopReason === 'error') {
    return { label: t('worker.failed'), dot: 'error' }
  }
  return { label: t('worker.completed'), dot: 'done' }
}

function compactNumber(value: number): string {
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return `${String(Math.round(value / 100) / 10)}K`
  return `${String(Math.round(value / 100_000) / 10)}M`
}

function duration(ms: number): string {
  if (ms < 60_000) return `${String(Math.round(ms / 100) / 10)}s`
  const whole = Math.round(ms / 1_000)
  return `${String(Math.floor(whole / 60))}m${String(whole % 60)}s`
}

function processSummaryStats(
  metrics: DualEvalWorkerMetrics | undefined,
  elapsedMs: number,
  t: PropsLocale<'dualEval'>['t'],
): string[] {
  return [
    t('process.elapsed', { duration: duration(elapsedMs) }),
    t('process.tools', { count: metrics?.toolCalls ?? 0 }),
  ]
}

function processExpandedStats(
  metrics: DualEvalWorkerMetrics | undefined,
  t: PropsLocale<'dualEval'>['t'],
): string[] {
  if (metrics === undefined) return []
  const totalInput = metrics.inputTokens + metrics.cacheReadTokens + metrics.cacheWriteTokens
  const groups = [t('process.steps', { count: metrics.steps })]
  if (totalInput > 0 || metrics.outputTokens > 0) {
    groups.push(t('process.tokens', { input: compactNumber(totalInput), output: compactNumber(metrics.outputTokens) }))
  }
  if (totalInput > 0) {
    groups.push(t('process.cache', { percent: Math.round(metrics.cacheReadTokens / totalInput * 100) }))
  }
  if (metrics.ttftSteps > 0) {
    groups.push(t('process.ttft', { duration: duration(metrics.ttftMs / metrics.ttftSteps) }))
  }
  if (metrics.decodeMs > 0 && metrics.outputTokens > 0) {
    groups.push(t('process.speed', {
      speed: String(Math.round(metrics.outputTokens / (metrics.decodeMs / 1_000) * 10) / 10),
    }))
  }
  return groups
}

function changeRatios(changes: DualEvalChangeStats): { added: number; deleted: number } {
  const total = changes.additions + changes.deletions
  if (total === 0) return { added: 0, deleted: 0 }
  const added = Math.round(changes.additions / total * 100)
  return { added, deleted: 100 - added }
}

function toolSummary(tool: DualEvalToolEvidence): string {
  try {
    const parsed = JSON.parse(tool.argsRaw) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return tool.argsRaw
    const args = parsed as Record<string, unknown>
    for (const key of ['cmd', 'command', 'path', 'filePath', 'query', 'pattern', 'url']) {
      const value = args[key]
      if (typeof value === 'string' && value !== '') return value.split('\n')[0] ?? ''
    }
    return Object.keys(args).slice(0, 3).join(', ')
  } catch {
    return tool.argsRaw.split('\n')[0] ?? ''
  }
}

function toolOutput(tool: DualEvalToolEvidence): string {
  return tool.content
    .filter((block): block is Extract<(typeof tool.content)[number], { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('')
}

function ToolTraceRow({ tool }: { tool: DualEvalToolEvidence }) {
  const [open, setOpen] = useState(false)
  const output = toolOutput(tool)
  const args = tool.argsRaw === '{}' ? '' : tool.argsRaw
  const expandable = args !== '' || output !== ''
  const running = tool.endedAt === undefined
  const failure = tool.isError
    ? output.split('\n')[0] || tool.error?.code || tool.error?.name || tool.name
    : undefined
  const summary = failure ?? toolSummary(tool)
  return (
    <div className={css.toolRow} data-error={tool.isError || undefined} data-running={running || undefined}>
      <DisclosureRow
        rowClassName={css.toolRowHeader}
        leadingClassName={css.toolLeading}
        titleClassName={css.toolTitle}
        chevronClassName={css.toolChevron}
        icon={tool.isError
          ? <StateDot state="error" />
          : running ? <StateDot state="ongoing" /> : <IconApiOutline14 size={14} />}
        title={tool.name}
        open={open && expandable}
        expandable={expandable}
        expandOnRowClick
        keepContentWhenOpen
        onToggle={() => { setOpen(value => !value) }}
        collapsedContent={summary !== '' && (
          <>
            <span className={css.toolSeparator} aria-hidden />
            <span className={css.toolSummary} data-error={tool.isError || undefined}>{summary}</span>
          </>
        )}
      >
        <div className={css.toolIoCard}>
          {args !== '' && (
            <div className={css.toolIoSection}>
              <span className={css.toolIoLabel}>IN</span>
              <pre>{args}</pre>
            </div>
          )}
          {args !== '' && output !== '' && <span className={css.toolIoDivider} />}
          {output !== '' && (
            <div className={css.toolIoSection}>
              <span className={css.toolIoLabel}>OUT</span>
              <pre data-error={tool.isError || undefined}>{output}</pre>
            </div>
          )}
        </div>
      </DisclosureRow>
    </div>
  )
}

function ResponseSection({ worker, t }: {
  worker: DualEvalWorkerSnapshot
  t: PropsLocale<'dualEval'>['t']
}) {
  const evidence = worker.evidence
  if (evidence === undefined) return null
  return (
    <section className={css.responseSection}>
      <h4>{t('worker.response')}</h4>
      <div className={css.responseBody}>
        {evidence.response === ''
          ? <p className={css.emptyEvidence}>{t('worker.emptyResponse')}</p>
          : <MarkdownText text={evidence.response} />}
        {evidence.responseTruncated && <p className={css.truncated}>{t('worker.truncated')}</p>}
      </div>
    </section>
  )
}

function useWorkerElapsed(worker: DualEvalWorkerSnapshot): number {
  const [now, setNow] = useState(() => Date.now())
  const running = worker.started && worker.evidence === undefined
  useEffect(() => {
    if (!running || worker.startedAt === undefined) return
    const timer = window.setInterval(() => { setNow(Date.now()) }, 1_000)
    return () => { window.clearInterval(timer) }
  }, [running, worker.startedAt])
  if (worker.evidence !== undefined) return worker.evidence.elapsedMs
  const observed = worker.progress?.elapsedMs ?? 0
  if (worker.startedAt === undefined) return observed
  return Math.max(observed, now - worker.startedAt)
}

function ProcessDetails({ worker, t }: {
  worker: DualEvalWorkerSnapshot
  t: PropsLocale<'dualEval'>['t']
}) {
  const evidence = worker.evidence
  const progress = worker.progress
  const elapsedMs = useWorkerElapsed(worker)
  if (!worker.started) return null
  const tools = evidence?.tools ?? progress?.tools ?? []
  const metrics = evidence?.metrics ?? progress?.metrics
  const toolsTruncated = evidence?.toolsTruncated ?? progress?.toolsTruncated ?? false
  const running = evidence === undefined
  const summaryStats = processSummaryStats(metrics, elapsedMs, t)
  const expandedStats = processExpandedStats(metrics, t)
  return (
    <details className={css.processDetails} aria-label={t('process.title')}>
      <summary title={t('process.title')}>
        <span className={css.processSummaryStats}>
          {summaryStats.map(value => <span key={value}>{value}</span>)}
        </span>
      </summary>
      <div className={css.processBody}>
        {(running || expandedStats.length > 0) && (
          <div className={css.processExpandedStats}>
            {running && <span className={css.liveBadge}>{t('process.live')}</span>}
            {expandedStats.map(value => <span key={value}>{value}</span>)}
          </div>
        )}
        {tools.length === 0
          ? <p className={css.emptyEvidence}>{running ? t('process.waiting') : t('process.empty')}</p>
          : tools.map(tool => <ToolTraceRow key={tool.callId} tool={tool} />)}
        {toolsTruncated && <p className={css.truncated}>{t('process.truncated')}</p>}
      </div>
    </details>
  )
}

function ChangeSummary({ changes, t }: {
  changes: DualEvalChangeStats | undefined
  t: PropsLocale<'dualEval'>['t']
}) {
  if (changes === undefined) return <span className={css.changeUnknown}>{t('changes.unknown')}</span>
  const ratio = changeRatios(changes)
  return (
    <div className={css.changeSummary} aria-label={t('changes.aria', {
      additions: changes.additions,
      deletions: changes.deletions,
      added: ratio.added,
      deleted: ratio.deleted,
    })}>
      <span className={css.additions}>+{compactNumber(changes.additions)}</span>
      <span className={css.deletions}>-{compactNumber(changes.deletions)}</span>
      <span className={css.changeRatio}>{t('changes.ratio', { added: ratio.added, deleted: ratio.deleted })}</span>
      <span className={css.changeFiles}>{t('changes.files', { count: changes.filesChanged })}</span>
      {changes.binaryFiles > 0 && <span className={css.changeFiles}>{t('changes.binary', { count: changes.binaryFiles })}</span>}
    </div>
  )
}

function AdoptionFooter({ run, worker, adopt, t }: {
  run: DualEvalRunSnapshot
  worker: DualEvalWorkerSnapshot
  adopt: ComparisonRunInjected['adopt']
  t: PropsLocale<'dualEval'>['t']
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const selected = run.adopted?.index === worker.route.index
  const anotherSelected = run.adopted !== undefined && !selected
  const evidence = worker.evidence
  const adoptable = run.status === 'completed'
    && evidence?.stopReason === 'completed'
    && evidence.error === undefined
  const label = selected
    ? t('action.adopted')
    : anotherSelected ? t('action.otherAdopted') : pending ? t('action.adopting') : t('action.adopt')

  const onAdopt = async () => {
    setPending(true)
    setError(undefined)
    try {
      await adopt(run.runId, worker.route.index)
    } catch (cause: unknown) {
      setError(t('action.adoptFailed', { message: errorText(cause) }))
    } finally {
      setPending(false)
    }
  }

  return (
    <footer className={css.adoptionFooter}>
      <ChangeSummary changes={evidence?.changes} t={t} />
      <button
        type="button"
        className={css.adoptButton}
        data-adopted={selected || undefined}
        data-dual-eval-adopt={worker.route.index}
        disabled={!adoptable || pending || run.adopted !== undefined}
        onClick={() => { void onAdopt() }}
      >
        {label}
      </button>
      {error !== undefined && <p className={css.adoptError}>{error}</p>}
    </footer>
  )
}

function WorkerCard({ run, worker, adopt, t }: {
  run: DualEvalRunSnapshot
  worker: DualEvalWorkerSnapshot
  adopt: ComparisonRunInjected['adopt']
  t: PropsLocale<'dualEval'>['t']
}) {
  const status = workerStatus(worker, t)
  const evidence = worker.evidence
  return (
    <article className={css.workerCard} data-dual-eval-model={worker.route.model}>
      <header className={css.workerHeader}>
        <div className={css.workerIdentity}>
          <span className={css.workerIndex}>{String(worker.route.index + 1).padStart(2, '0')}</span>
          <div className={css.workerNames}>
            <h3>{worker.route.label}</h3>
            <code>{worker.route.provider}/{worker.route.model}</code>
          </div>
        </div>
        <div className={css.statusLabel}><StateDot state={status.dot} /><span>{status.label}</span></div>
      </header>
      {!worker.started ? (
        <div className={css.workerWaiting}>
          <span className={css.waitingLine} />
          <span className={css.waitingLineShort} />
        </div>
      ) : (
        <div className={css.workerBody}>
          {evidence?.error !== undefined && <div className={css.workerError}>{evidence.error}</div>}
          <ProcessDetails worker={worker} t={t} />
          {evidence !== undefined && <ResponseSection worker={worker} t={t} />}
          {evidence !== undefined && <AdoptionFooter run={run} worker={worker} adopt={adopt} t={t} />}
        </div>
      )}
    </article>
  )
}

function RunCards({ run, adopt, t }: {
  run: DualEvalRunSnapshot
  adopt: ComparisonRunInjected['adopt']
  t: PropsLocale<'dualEval'>['t']
}) {
  return (
    <section className={css.runCards} aria-label={t('comparison.results')}>
      {(run.error !== undefined || run.cleanupErrors.length > 0) && (
        <div className={css.runError}>
          {run.error !== undefined && <p>{run.error}</p>}
          {run.cleanupErrors.map(error => <p key={error}>{error}</p>)}
        </div>
      )}
      <div className={css.workerGrid} style={{ gridTemplateColumns: `repeat(${String(run.workers.length)}, minmax(310px, 1fr))` }}>
        {run.workers.map(worker => (
          <WorkerCard
            key={`${run.runId}-${String(worker.route.index)}`}
            run={run}
            worker={worker}
            adopt={adopt}
            t={t}
          />
        ))}
      </div>
    </section>
  )
}

/** Render one durable side-by-side comparison directly inside the ordinary Chat flow. */
export function ComparisonRunNode({ node, adopt, t }: ComparisonRunNodeProps) {
  return (
    <div className={css.chatNode} data-dual-eval-run={node.data.runId}>
      <RunCards run={node.data} adopt={adopt} t={t} />
    </div>
  )
}
