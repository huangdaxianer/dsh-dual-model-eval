import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { ComparisonChoice, ComparisonSelectionState } from './selection-runtime.ts'

export interface ComparisonMenuInjected {
  readonly maxModels: number
  readonly directory: SnapshotStore<ModelDirectoryState>
  readonly comparison: SnapshotStore<ComparisonSelectionState>
  readonly load: () => void
  readonly setEnabled: (enabled: boolean) => void
  readonly toggleChoice: (choice: ComparisonChoice) => void
}

/** Business face for the plugin-owned replacement of the built-in model seat. */
export interface ModelSelectInjected {
  readonly available: boolean
  readonly directory: SnapshotStore<ModelDirectoryState>
  readonly load: () => void
  readonly select: (selection: ModelSelection) => Promise<boolean>
}
