/** Browser half: model-seat takeover, comparison submission, and inline evidence. */
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import type {
  ClientContext, ISessions, SessionId, SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { CommandRowProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-commands/types'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { DualEvalFilePreview, DualEvalModelRoute } from '../types.ts'
import { ComparisonAdoptionGate, requiresComparisonAdoption } from './adoption-gate.ts'
import { ComparisonRunNode, type ComparisonRunInjected } from './ComparisonView.tsx'
import { dualEvalRunDefinition } from './comparison-view-model.ts'
import { en, NS, zh, type DualEvalKey } from './locales.ts'
import { ModelSelect } from './ModelSelect.tsx'
import { ComparisonSelectionRuntime } from './selection-runtime.ts'
import type { ComparisonMenuInjected, ModelSelectInjected } from './slots.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Multi-model comparison selector and evidence view copy. */
    dualEval: DualEvalKey
  }
}

const MAX_MODELS = 4
const RUNNING_BLOCK_OWNER = 'dsh-dual-model-eval-running'

interface ComposerBlock {
  readonly reason: string
}

interface LegacyBlocks {
  set(sessionId: SessionId, block: ComposerBlock | undefined): void
  setFor?: (sessionId: SessionId, owner: string, block: ComposerBlock | undefined) => void
}

interface OwnedBlocks {
  setFor(sessionId: SessionId, owner: string, block: ComposerBlock | undefined): void
  dispose(): void
}

interface InputSnapshot {
  readonly draft: string
  readonly imageIds: readonly unknown[]
}

interface InputFace {
  readonly state: SnapshotStore<InputSnapshot>
  setDraft(text: string): void
  submit(mode?: unknown): void
  notify(level: 'info' | 'error', text: string): void
}

interface ConversationCompatibilityFace {
  readonly blocks: LegacyBlocks
  readonly input: { for(ctx: ClientContext): InputFace }
}

function encodeRequest(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function transportError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const FILES_ENDPOINT = '/dual-model-eval-files'

async function postJson<T>(path: string, value: unknown): Promise<T> {
  const response = await fetch(`${FILES_ENDPOINT}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  })
  const payload = await response.json() as { error?: unknown } & T
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `HTTP ${String(response.status)}`)
  }
  return payload
}

async function downloadCandidate(value: unknown): Promise<void> {
  const download = await postJson<{ url: string; filename: string }>('prepare', value)
  const anchor = document.createElement('a')
  anchor.href = download.url
  anchor.download = download.filename
  anchor.hidden = true
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
}

function HiddenCommandRow(_props: CommandRowProps): null {
  return null
}

/** Backport independently owned composer blocks when the installed Harness has only the legacy setter. */
function ownedBlocks(blocks: LegacyBlocks): OwnedBlocks {
  if (typeof blocks.setFor === 'function') {
    return {
      setFor: blocks.setFor.bind(blocks),
      dispose: () => {},
    }
  }
  const original = blocks.set
  const bySession = new Map<SessionId, Map<string, ComposerBlock>>()
  const setFor = (sessionId: SessionId, owner: string, block: ComposerBlock | undefined): void => {
    let owners = bySession.get(sessionId)
    if (owners === undefined) {
      owners = new Map()
      bySession.set(sessionId, owners)
    }
    if (block === undefined) owners.delete(owner)
    else owners.set(owner, block)
    if (owners.size === 0) bySession.delete(sessionId)
    original.call(blocks, sessionId, [...owners.values()].at(-1))
  }
  blocks.set = (sessionId, block) => { setFor(sessionId, 'legacy', block) }
  return {
    setFor,
    dispose: () => {
      blocks.set = original
      bySession.clear()
    },
  }
}

function markEngaged(session: unknown): void {
  const compatible = session as { handleBlank?: (blank: boolean) => void }
  compatible.handleBlank?.(false)
}

/** Wrap the public per-session input facade so comparison mode owns ordinary composer submit. */
function installSubmissionCompatibility(
  ctx: ClientContext,
  sessions: ISessions,
  comparison: ComparisonSelectionRuntime,
  blocks: OwnedBlocks,
  t: TranslateNS<'dualEval'>,
): () => void {
  const conversation = ctx.conversation as unknown as ConversationCompatibilityFace
  const restores = new Map<SessionId, () => void>()

  const attach = (sessionId: SessionId): void => {
    if (restores.has(sessionId)) return
    const binding = sessions.binding(sessionId)
    if (binding === undefined) return
    const input = conversation.input.for(binding.ctx as ClientContext)
    const original = input.submit
    const wasOwn = Object.hasOwn(input, 'submit')
    input.submit = function submitComparison(mode?: unknown): void {
      const selected = comparison.storeFor(sessionId).getSnapshot()
      if (!selected.enabled) {
        original.call(input, mode)
        return
      }
      if (selected.submitting) {
        input.notify('error', t('submit.busy'))
        return
      }
      if (requiresComparisonAdoption(binding.session.getSnapshot().chat)) {
        blocks.setFor(sessionId, 'dsh-dual-model-eval-adoption', { reason: t('submit.adoptRequired') })
        input.notify('error', t('submit.adoptRequired'))
        return
      }
      const snapshot = input.state.getSnapshot()
      if (snapshot.draft.trim() === '' && snapshot.imageIds.length === 0) return
      if (snapshot.imageIds.length > 0) {
        input.notify('error', t('submit.images'))
        return
      }
      if (selected.selected.length < 2) {
        input.notify('error', t('submit.minimum'))
        return
      }
      if (selected.selected.length > MAX_MODELS) {
        input.notify('error', t('submit.maximum'))
        return
      }
      const text = snapshot.draft
      const models: DualEvalModelRoute[] = selected.selected.map((choice, index) => ({ index, ...choice }))
      const line = `/compare-models ${encodeRequest({
        version: 1,
        runId: crypto.randomUUID(),
        task: text,
        models,
      })}`
      markEngaged(binding.session)
      comparison.setSubmitting(sessionId, true)
      blocks.setFor(sessionId, RUNNING_BLOCK_OWNER, { reason: t('submit.busy') })
      input.setDraft('')
      void ctx.remote.commands.execute(sessionId, line).then((result) => {
        if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
        if (result.value === undefined) throw new Error('compare-models command is unavailable')
        if (result.value.result.kind === 'error') throw new Error(result.value.result.text)
      }).catch((error: unknown) => {
        if (input.state.getSnapshot().draft === '') input.setDraft(text)
        input.notify('error', t('submit.transport', { message: transportError(error) }))
      }).finally(() => {
        comparison.setSubmitting(sessionId, false)
        blocks.setFor(sessionId, RUNNING_BLOCK_OWNER, undefined)
      })
    }
    restores.set(sessionId, () => {
      if (wasOwn) input.submit = original
      else delete (input as { submit?: InputFace['submit'] }).submit
    })
  }

  const reconcile = (): void => {
    const ids = new Set(sessions.list.getSnapshot().ids)
    for (const sessionId of ids) attach(sessionId)
    for (const [sessionId, restore] of restores) {
      if (ids.has(sessionId)) continue
      restore()
      restores.delete(sessionId)
    }
  }
  reconcile()
  const stop = sessions.list.subscribe(reconcile)
  return () => {
    stop()
    for (const restore of restores.values()) restore()
    restores.clear()
  }
}

export const inject = [
  'slots', 'locale', 'sessions', 'remote', 'remote.commands', 'conversation', 'conversationEvents',
  'modelDirectories',
]

/** Mount the comparison UI, compatibility seams, and durable result cards. */
export function apply(ctx: ClientContext): void {
  const comparison = new ComparisonSelectionRuntime(MAX_MODELS)
  const sessions = ctx.sessions as unknown as ISessions
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-dual-model-eval: dictionaries')
  ctx.effect(() => ctx.conversationEvents.register(dualEvalRunDefinition), 'dsh-dual-model-eval: event definition')

  const conversation = ctx.conversation as unknown as ConversationCompatibilityFace
  const blocks = ownedBlocks(conversation.blocks)
  ctx.effect(() => () => { blocks.dispose() }, 'dsh-dual-model-eval: composer block compatibility')

  const adoptionGate = new ComparisonAdoptionGate(sessions, blocks, () => t('submit.adoptRequired'))
  ctx.effect(() => adoptionGate.start(), 'dsh-dual-model-eval: adoption composer gate')
  ctx.effect(
    () => installSubmissionCompatibility(ctx, sessions, comparison, blocks, t),
    'dsh-dual-model-eval: composer submission compatibility',
  )

  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'dual-eval-run',
    locale: NS,
    inject: (sessionId): ComparisonRunInjected => ({
      adopt: async (runId, index) => {
        const line = `/compare-models-adopt ${encodeRequest({ version: 1, runId, index })}`
        const result = await ctx.remote.commands.execute(sessionId, line)
        if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
        if (result.value === undefined) throw new Error('compare-models-adopt command is unavailable')
        if (result.value.result.kind === 'error') throw new Error(result.value.result.text)
      },
      previewFile: request => postJson<DualEvalFilePreview>('preview', request),
      downloadFile: request => downloadCandidate({ ...request, kind: 'file' }),
      downloadWorkspace: request => downloadCandidate({ ...request, kind: 'workspace' }),
    }),
  }, ComparisonRunNode))

  ctx.slots.inject('conversation.chat.commandview', function* hideComparisonCommands() {
    yield ctx.slots.register({ name: 'conversation.chat.commandview', key: 'compare-models' }, HiddenCommandRow)
    yield ctx.slots.register({ name: 'conversation.chat.commandview', key: 'compare-models-adopt' }, HiddenCommandRow)
  })

  // A third-party registration in this single-cardinality seat shadows the
  // shipped occupant. This copy retains ordinary model selection and adds the
  // comparison controls inside the same menu without patching Harness core.
  ctx.inject(['slots', 'modelDirectories'], (scope: ClientContext) => {
    const modelT = scope.locale.bind('model')
    const dualT = scope.locale.bind(NS)
    const models = scope.modelDirectories
    const scopedSessions = scope.sessions as unknown as ISessions
    scope.slots.inject('conversation.input.model', () => scope.slots.register({
      name: 'conversation.input.model',
      inject: (sessionId): ModelSelectInjected & ComparisonMenuInjected
        & { t: TranslateNS<'model'>; dualT: TranslateNS<'dualEval'> } => {
        const directory = models.directoryFor(sessionId)
        const available = scopedSessions.subagentAddress(sessionId) === undefined
        return {
          available,
          directory: directory.store,
          comparison: comparison.storeFor(sessionId),
          maxModels: MAX_MODELS,
          load: () => {
            if (available) directory.load().catch(() => { /* surfaced on the store */ })
          },
          select: (selection: ModelSelection) => available
            ? directory.select(selection).then(() => true, () => false)
            : Promise.resolve(false),
          setEnabled: (enabled) => { comparison.setEnabled(sessionId, enabled, directory.store.getSnapshot()) },
          toggleChoice: (choice) => { comparison.toggleChoice(sessionId, choice) },
          t: modelT,
          dualT,
        }
      },
    }, ModelSelect))
  })
}

export { dualEvalRunDefinition } from './comparison-view-model.ts'
export { ComparisonAdoptionGate, requiresComparisonAdoption } from './adoption-gate.ts'
export type { DualEvalRunSnapshot, DualEvalWorkerSnapshot } from './comparison-view-model.ts'
export { ComparisonSelectionRuntime, choicesOf } from './selection-runtime.ts'
export type { ComparisonChoice, ComparisonSelectionState } from './selection-runtime.ts'
