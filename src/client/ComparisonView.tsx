import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  DisclosureRow, IconApiOutline14, IconCodeOutline16, IconDownloadOutline16,
  IconFolderOpenOutline16, MarkdownText, Modal, StateDot, type StateDotState,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DualEvalRunSnapshot, DualEvalWorkerSnapshot } from './comparison-view-model.ts'
import type {
  DualEvalChangeStats, DualEvalFilePreview, DualEvalFileRequest, DualEvalToolEvidence,
  DualEvalWorkerEvidence, DualEvalWorkerMetrics, DualEvalWorkspaceRequest,
} from '../types.ts'
import css from './ComparisonView.module.css'

export interface ComparisonRunInjected {
  readonly adopt: (runId: string, index: number) => Promise<void>
  readonly previewFile: (request: DualEvalFileRequest) => Promise<DualEvalFilePreview>
  readonly downloadFile: (request: DualEvalFileRequest) => Promise<void>
  readonly downloadWorkspace: (request: DualEvalWorkspaceRequest) => Promise<void>
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
  running: boolean,
  t: PropsLocale<'dualEval'>['t'],
): string[] {
  const groups = [t('process.elapsed', { duration: duration(elapsedMs) })]
  if (!running) groups.push(t('process.tools', { count: metrics?.toolCalls ?? 0 }))
  return groups
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

function toolSummary(tool: DualEvalToolEvidence): string {
  try {
    const parsed = JSON.parse(tool.argsRaw) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return tool.argsRaw
    const args = parsed as Record<string, unknown>
    for (const key of ['cmd', 'command', 'path', 'filePath', 'file_path', 'query', 'pattern', 'url']) {
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

function latestObservedTool(tools: readonly DualEvalToolEvidence[]): DualEvalToolEvidence | undefined {
  return tools.at(-1)
}

function changedFilePaths(evidence: DualEvalWorkerEvidence): readonly string[] {
  const declared = evidence.changes?.files ?? []
  if (declared.length > 0) return declared
  const paths = new Set<string>()
  for (const line of evidence.patchPreview.split('\n')) {
    if (!line.startsWith('diff --git ')) continue
    const marker = line.lastIndexOf(' b/')
    if (marker < 0) continue
    const path = line.slice(marker + 3).replace(/^"|"$/gu, '')
    if (path !== '' && path !== '/dev/null') paths.add(path)
  }
  if (paths.size > 0) return [...paths]
  for (const line of evidence.status.split('\n')) {
    if (line.length < 4) continue
    const path = (line.slice(3).split(' -> ').at(-1) ?? '').trim().replace(/^"|"$/gu, '')
    if (path !== '') paths.add(path)
  }
  return [...paths]
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
  const summaryStats = processSummaryStats(metrics, elapsedMs, running, t)
  const expandedStats = processExpandedStats(metrics, t)
  // Real tools often finish between two browser paints. Keep the latest Tool
  // visible for the rest of the live run so brief calls are not lost entirely.
  const currentTool = running ? latestObservedTool(tools) : undefined
  const currentToolDetail = currentTool === undefined ? '' : toolSummary(currentTool)
  const currentToolLabel = currentTool === undefined
    ? ''
    : [currentTool.name, currentToolDetail].filter(value => value !== '').join(' · ')
  return (
    <details className={css.processDetails} aria-label={t('process.title')}>
      <summary title={t('process.title')}>
        <span className={css.processSummaryStats}>
          {summaryStats.map(value => <span key={value}>{value}</span>)}
        </span>
        {currentTool !== undefined && (
          <span
            key={currentTool.callId}
            className={css.currentToolTicker}
            aria-live="polite"
            title={currentToolLabel}
          >
            <span className={css.currentToolTickerInner}>
              <IconApiOutline14 size={13} />
              <span className={css.currentToolName}>{currentTool.name}</span>
              {currentToolDetail !== '' && (
                <>
                  <span className={css.currentToolSeparator} aria-hidden>·</span>
                  <span className={css.currentToolDetail}>{currentToolDetail}</span>
                </>
              )}
            </span>
          </span>
        )}
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

function FilePreviewDialog({ run, worker, files, open, onClose, previewFile, downloadFile, downloadWorkspace, t }: {
  run: DualEvalRunSnapshot
  worker: DualEvalWorkerSnapshot
  files: readonly string[]
  open: boolean
  onClose: () => void
  previewFile: ComparisonRunInjected['previewFile']
  downloadFile: ComparisonRunInjected['downloadFile']
  downloadWorkspace: ComparisonRunInjected['downloadWorkspace']
  t: PropsLocale<'dualEval'>['t']
}) {
  const [selectedPath, setSelectedPath] = useState(files[0] ?? '')
  const [preview, setPreview] = useState<DualEvalFilePreview>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [downloading, setDownloading] = useState<'file' | 'workspace'>()
  const requestBase: DualEvalWorkspaceRequest = {
    artifactDirectory: run.artifactDirectory,
    runId: run.runId,
    index: worker.route.index,
  }

  useEffect(() => {
    if (!open) return
    if (selectedPath === '' || !files.includes(selectedPath)) setSelectedPath(files[0] ?? '')
  }, [files, open, selectedPath])

  useEffect(() => {
    if (!open || selectedPath === '') return
    let active = true
    setLoading(true)
    setPreview(undefined)
    setError(undefined)
    void previewFile({ ...requestBase, path: selectedPath }).then((value) => {
      if (active) setPreview(value)
    }).catch((cause: unknown) => {
      if (active) setError(t('files.error', { message: errorText(cause) }))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [open, previewFile, run.artifactDirectory, run.runId, selectedPath, t, worker.route.index])

  const startDownload = async (kind: 'file' | 'workspace') => {
    setDownloading(kind)
    setError(undefined)
    try {
      if (kind === 'workspace') await downloadWorkspace(requestBase)
      else await downloadFile({ ...requestBase, path: selectedPath })
    } catch (cause: unknown) {
      setError(t('files.downloadFailed', { message: errorText(cause) }))
    } finally {
      setDownloading(undefined)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('files.dialogTitle', { model: worker.route.label })}
      closeLabel={t('files.close')}
      className={css.fileDialogModal ?? ''}
      contentClassName={css.fileDialogContent ?? ''}
    >
      <div className={css.fileDialogToolbar}>
        <p>{t('files.workspaceHint')}</p>
        <button
          type="button"
          className={css.downloadButton}
          disabled={downloading !== undefined}
          onClick={() => { void startDownload('workspace') }}
        >
          <IconFolderOpenOutline16 size={16} />
          <span>{downloading === 'workspace' ? t('files.downloading') : t('files.downloadWorkspace')}</span>
        </button>
      </div>
      <div className={css.fileDialogLayout}>
        <aside className={css.fileListPane} aria-label={t('changes.fileList')}>
          <div className={css.fileListTitle}>{t('changes.files', { count: files.length })}</div>
          <div className={css.fileList}>
            {files.map(path => (
              <button
                key={path}
                type="button"
                data-selected={path === selectedPath || undefined}
                title={path}
                onClick={() => { setSelectedPath(path) }}
              >
                <IconCodeOutline16 size={15} />
                <span>{path}</span>
              </button>
            ))}
          </div>
        </aside>
        <section className={css.filePreviewPane} aria-label={t('files.preview')}>
          <header className={css.filePreviewHeader}>
            <code title={selectedPath}>{selectedPath}</code>
            <button
              type="button"
              className={css.downloadButton}
              disabled={downloading !== undefined || preview?.deleted === true || selectedPath === ''}
              onClick={() => { void startDownload('file') }}
            >
              <IconDownloadOutline16 size={16} />
              <span>{downloading === 'file' ? t('files.downloading') : t('files.downloadFile')}</span>
            </button>
          </header>
          <div className={css.filePreviewBody}>
            {loading && <p className={css.filePreviewState}>{t('files.loading')}</p>}
            {!loading && error !== undefined && <p className={css.filePreviewError}>{error}</p>}
            {!loading && error === undefined && preview?.deleted === true && (
              <p className={css.filePreviewState}>{t('files.deleted')}</p>
            )}
            {!loading && error === undefined && preview?.binary === true && (
              <p className={css.filePreviewState}>{t('files.binary', { size: compactNumber(preview.size) })}</p>
            )}
            {!loading && error === undefined && preview !== undefined && !preview.deleted && !preview.binary && (
              <>
                <pre>{preview.content}</pre>
                {preview.truncated && <p className={css.filePreviewTruncated}>{t('files.truncated')}</p>}
              </>
            )}
          </div>
        </section>
      </div>
    </Modal>
  )
}

function ChangeSummary({ run, worker, changes, files, previewFile, downloadFile, downloadWorkspace, t }: {
  run: DualEvalRunSnapshot
  worker: DualEvalWorkerSnapshot
  changes: DualEvalChangeStats | undefined
  files: readonly string[]
  previewFile: ComparisonRunInjected['previewFile']
  downloadFile: ComparisonRunInjected['downloadFile']
  downloadWorkspace: ComparisonRunInjected['downloadWorkspace']
  t: PropsLocale<'dualEval'>['t']
}) {
  const [open, setOpen] = useState(false)
  if (changes === undefined) return <span className={css.changeUnknown}>{t('changes.unknown')}</span>
  return (
    <>
      <button
        type="button"
        className={css.fileArtifactRow}
        aria-label={t('changes.aria', {
          count: changes.filesChanged,
          additions: changes.additions,
          deletions: changes.deletions,
        })}
        disabled={files.length === 0}
        onClick={() => { setOpen(true) }}
      >
        <span className={css.fileArtifactCount}>
          <IconCodeOutline16 size={15} />
          {t('changes.files', { count: changes.filesChanged })}
        </span>
        <span className={css.fileArtifactDiff}>
          <span className={css.additions}>+{compactNumber(changes.additions)}</span>
          <span className={css.deletions}>-{compactNumber(changes.deletions)}</span>
        </span>
      </button>
      <FilePreviewDialog
        run={run}
        worker={worker}
        files={files}
        open={open}
        onClose={() => { setOpen(false) }}
        previewFile={previewFile}
        downloadFile={downloadFile}
        downloadWorkspace={downloadWorkspace}
        t={t}
      />
    </>
  )
}

function AdoptionFooter({ run, worker, transport, t }: {
  run: DualEvalRunSnapshot
  worker: DualEvalWorkerSnapshot
  transport: ComparisonRunInjected
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
      await transport.adopt(run.runId, worker.route.index)
    } catch (cause: unknown) {
      setError(t('action.adoptFailed', { message: errorText(cause) }))
    } finally {
      setPending(false)
    }
  }

  return (
    <footer className={css.adoptionFooter}>
      <ChangeSummary
        run={run}
        worker={worker}
        changes={evidence?.changes}
        files={evidence === undefined ? [] : changedFilePaths(evidence)}
        previewFile={transport.previewFile}
        downloadFile={transport.downloadFile}
        downloadWorkspace={transport.downloadWorkspace}
        t={t}
      />
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

function WorkerCard({ run, worker, transport, t }: {
  run: DualEvalRunSnapshot
  worker: DualEvalWorkerSnapshot
  transport: ComparisonRunInjected
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
          {evidence !== undefined && <AdoptionFooter run={run} worker={worker} transport={transport} t={t} />}
        </div>
      )}
    </article>
  )
}

function RunCards({ run, transport, t }: {
  run: DualEvalRunSnapshot
  transport: ComparisonRunInjected
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
            transport={transport}
            t={t}
          />
        ))}
      </div>
    </section>
  )
}

/** Render one durable side-by-side comparison directly inside the ordinary Chat flow. */
export function ComparisonRunNode({ node, adopt, previewFile, downloadFile, downloadWorkspace, t }: ComparisonRunNodeProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = rootRef.current
    const viewport = root?.closest<HTMLElement>('[data-conversation-scroll]')
    if (root === null || viewport === null || viewport === undefined) return
    const updateWidth = () => {
      if (viewport.clientWidth > 0) {
        root.style.setProperty('--dual-eval-available-width', `${String(Math.max(0, viewport.clientWidth - 24))}px`)
      }
    }
    updateWidth()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateWidth)
    observer.observe(viewport)
    return () => { observer.disconnect() }
  }, [])
  return (
    <div ref={rootRef} className={css.chatNode} data-dual-eval-run={node.data.runId}>
      <RunCards run={node.data} transport={{ adopt, previewFile, downloadFile, downloadWorkspace }} t={t} />
    </div>
  )
}
