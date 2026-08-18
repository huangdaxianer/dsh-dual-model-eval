import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import {
  createSnapshotStore, type SessionId, type SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { DualEvalModelRoute } from '../types.ts'

export interface ComparisonChoice extends Omit<DualEvalModelRoute, 'index'> {}

export interface ComparisonSelectionState {
  enabled: boolean
  selected: ComparisonChoice[]
  submitting: boolean
}

const EMPTY_STATE: ComparisonSelectionState = {
  enabled: false,
  selected: [],
  submitting: false,
}

export function choiceKey(choice: Pick<ComparisonChoice, 'provider' | 'model' | 'reasoningEffort'>): string {
  return `${choice.provider}\u0000${choice.model}\u0000${choice.reasoningEffort ?? ''}`
}

/** Flatten one Host directory into complete routes suitable for comparison. */
export function choicesOf(state: ModelDirectoryState): readonly ComparisonChoice[] {
  return state.groups.flatMap(group => group.models.map((model) => {
    const current = state.current?.provider === group.id && state.current.model === model.id
    const reasoningEffort = current
      ? state.current?.reasoningEffort ?? model.reasoning?.defaultEffort
      : model.reasoning?.defaultEffort
    return {
      label: model.name,
      providerLabel: group.name,
      provider: group.id,
      model: model.id,
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    }
  }))
}

/** Client-owned ephemeral comparison selection, isolated by parent session. */
export class ComparisonSelectionRuntime {
  private readonly stores = new Map<SessionId, SnapshotStore<ComparisonSelectionState>>()

  constructor(readonly maxModels = 4) {}

  storeFor(sessionId: SessionId): SnapshotStore<ComparisonSelectionState> {
    let store = this.stores.get(sessionId)
    if (store === undefined) {
      store = createSnapshotStore(EMPTY_STATE)
      this.stores.set(sessionId, store)
    }
    return store
  }

  setEnabled(sessionId: SessionId, enabled: boolean, directory: ModelDirectoryState): void {
    const store = this.storeFor(sessionId)
    if (!enabled) {
      store.update((draft) => { draft.enabled = false })
      return
    }
    const available = choicesOf(directory)
    const current = available.find(choice =>
      choice.provider === directory.current?.provider && choice.model === directory.current.model)
    const selected: ComparisonChoice[] = []
    if (current !== undefined) selected.push(current)
    for (const choice of available) {
      if (selected.length >= Math.min(2, this.maxModels)) break
      if (!selected.some(existing => choiceKey(existing) === choiceKey(choice))) selected.push(choice)
    }
    store.set({ enabled: true, selected, submitting: false })
  }

  toggleChoice(sessionId: SessionId, choice: ComparisonChoice): void {
    const store = this.storeFor(sessionId)
    store.update((draft) => {
      const key = choiceKey(choice)
      const index = draft.selected.findIndex(candidate => choiceKey(candidate) === key)
      if (index >= 0) {
        draft.selected.splice(index, 1)
      } else if (draft.selected.length < this.maxModels) {
        draft.selected.push(choice)
      }
    })
  }

  setSubmitting(sessionId: SessionId, submitting: boolean): void {
    this.storeFor(sessionId).update((draft) => { draft.submitting = submitting })
  }

  selection(sessionId: SessionId): readonly ModelSelection[] {
    return this.storeFor(sessionId).getSnapshot().selected.map(choice => ({
      provider: choice.provider,
      model: choice.model,
      ...(choice.reasoningEffort === undefined ? {} : { reasoningEffort: choice.reasoningEffort }),
    }))
  }
}
