import { useId, useMemo, useSyncExternalStore } from 'react'
import clsx from 'clsx'
import { IconCheckOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { choiceKey, choicesOf } from './selection-runtime.ts'
import type { ComparisonMenuInjected } from './slots.ts'
import css from './ComparisonMenuExtension.module.css'

/** Additive comparison controls inside the standard model selector menu. */
export function ComparisonMenuExtension({
  locked, maxModels, directory, comparison, load, setEnabled, toggleChoice, t,
}: { locked: boolean } & ComparisonMenuInjected & PropsLocale<'dualEval'>) {
  const models = useSyncExternalStore(
    fn => directory.subscribe(fn),
    () => directory.getSnapshot(),
  )
  const compare = useSyncExternalStore(
    fn => comparison.subscribe(fn),
    () => comparison.getSnapshot(),
  )
  const id = useId()
  const choices = useMemo(() => choicesOf(models), [models])
  const selectedKeys = useMemo(() => new Set(compare.selected.map(choiceKey)), [compare.selected])
  const busy = locked || models.status === 'selecting' || compare.submitting

  return (
    <section className={css.root} aria-label={t('compare.title')}>
      <button
        type="button"
        role="switch"
        aria-checked={compare.enabled}
        className={css.compareSwitch}
        disabled={busy}
        onClick={() => { setEnabled(!compare.enabled) }}
      >
        <span className={css.switchCopy}>
          <span className={css.switchTitle}>{t('compare.title')}</span>
          <span className={css.switchDescription}>{t('compare.description')}</span>
        </span>
        <span className={clsx(css.switchTrack, compare.enabled && css.switchTrackOn)} aria-hidden>
          <span className={css.switchThumb} />
        </span>
      </button>

      {compare.enabled && (
        <>
          <div className={css.compareSummary}>
            <span>{t('compare.selected', { count: compare.selected.length, max: maxModels })}</span>
            <span className={compare.selected.length < 2 ? css.summaryWarning : css.summaryHint}>
              {compare.selected.length < 2
                ? t('compare.minimum')
                : compare.selected.length >= maxModels ? t('compare.maximum', { max: maxModels }) : ''}
            </span>
          </div>
          {models.status === 'loading' && <div className={css.status}>{t('status.loading')}</div>}
          {compare.submitting && <div className={css.status}>{t('status.submitting')}</div>}
          {models.error !== null && (
            <div className={css.error}>
              <span>{t('error.load', { message: models.error })}</span>
              <button type="button" className={css.retry} onClick={load}>{t('action.retry')}</button>
            </div>
          )}
          <div className={clsx(css.groups, 'scrollable')}>
            {models.groups.map(group => (
              <section className={css.group} role="group" aria-labelledby={`${id}-${group.id}`} key={group.id}>
                <div className={css.groupTitle} id={`${id}-${group.id}`}>{group.name}</div>
                {group.models.map((model) => {
                  const choice = choices.find(candidate => candidate.provider === group.id && candidate.model === model.id)
                  if (choice === undefined) return null
                  const checked = selectedKeys.has(choiceKey(choice))
                  const atLimit = !checked && compare.selected.length >= maxModels
                  return (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      className={clsx(css.option, checked && css.selected)}
                      key={model.id}
                      disabled={busy || atLimit}
                      onClick={() => { toggleChoice(choice) }}
                    >
                      <span className={css.optionCopy}>
                        <span className={css.modelName}>{model.name}</span>
                        {model.description !== undefined && <span className={css.description}>{model.description}</span>}
                      </span>
                      <span className={css.check}>{checked ? <IconCheckOutline16 /> : null}</span>
                    </button>
                  )
                })}
              </section>
            ))}
          </div>
          {models.status === 'ready' && choices.length === 0 && <div className={css.status}>{t('empty.models')}</div>}
        </>
      )}
    </section>
  )
}
