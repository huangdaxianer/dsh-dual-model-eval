import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { realpath, stat } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import { type Agent, type AgentHandle, type AgentOptions, foldConsumedWork } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type ContentBlock } from '@deepseek-ai/dsh-llm'
import { SessionId, type TurnEndReason } from '@deepseek-ai/dsh-session'
import {
  appendDelegatedPolicyOverrides,
  applyChildComposition,
  captureDelegatedPolicyOverrides,
  childSessionMeta,
  finalAssistantOutput,
  resolveChildAgentOptions,
  resolveChildDepth,
  type ResolvedSubagentStartRequest,
  type SubagentCapabilities,
  type SubagentProvider,
  type SubagentResult,
  type SubagentRun,
  type SubagentStopReason,
} from '@deepseek-ai/dsh-subagent'

declare module '@deepseek-ai/dsh-agent' {
  interface AgentOptions {
    /** Absolute cwd consumed only by the comparison worktree provider. */
    dualEvalWorktreeCwd?: string
  }
}

function stopReason(reason: TurnEndReason | undefined): SubagentStopReason {
  switch (reason?.kind) {
    case 'completed': return 'completed'
    case 'aborted':
    case 'interrupted': return 'aborted'
    case 'max-tokens': return 'max-tokens'
    case 'blocked': return 'refusal'
    case 'error':
    default: return 'error'
  }
}

function attachDescriptor(childCtx: Context, request: ResolvedSubagentStartRequest): void {
  let appended = false
  childCtx.on('agent/pre-step', async ({ agent }, next) => {
    const decision = await next()
    if (!appended && decision.kind === 'enter') {
      appended = true
      agent.session.append('subagent/descriptor', request.descriptor)
    }
    return decision
  })
}

function drive(handle: AgentHandle, signal: AbortSignal, prompt: ContentBlock[], childId: SessionId): SubagentRun {
  const child = handle.agent
  const onAbort = (): void => {
    child.cancel({ kind: 'parent' })
  }
  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) onAbort()
  const result: Promise<SubagentResult> = (async () => {
    try {
      if (!signal.aborted) {
        child.followup(createUserMessage({ content: prompt, source: { kind: 'user' } }))
        await child.whenIdle()
      }
      const output = finalAssistantOutput(child.session.events) ?? []
      const recorded = stopReason(foldConsumedWork(child.session.events).end?.data.reason)
      return { output, stopReason: signal.aborted && recorded !== 'completed' ? 'aborted' : recorded }
    } finally {
      signal.removeEventListener('abort', onAbort)
    }
  })()
  return {
    id: childId,
    localAgent: child,
    result,
    async dispose(): Promise<void> {
      signal.removeEventListener('abort', onAbort)
      const settlements = await Promise.allSettled([handle.dispose(), result])
      if (settlements[0].status === 'rejected') throw settlements[0].reason
    },
  }
}

async function validateWorkspace(path: string): Promise<string> {
  if (!isAbsolute(path)) throw new Error('comparison subagent cwd must be absolute')
  const resolved = await realpath(path)
  if (!(await stat(resolved)).isDirectory()) throw new Error(`comparison subagent cwd is not a directory: ${path}`)
  return resolved
}

/** In-process subagent provider with a per-run isolated cwd. */
export class IsolatedWorktreeProvider implements SubagentProvider {
  readonly capabilities: SubagentCapabilities = {
    outputSchema: false,
    depthLimit: true,
    toolFilter: true,
    persona: true,
  }
  readonly inheritsParentContext = false

  constructor(readonly name: string) {}

  async start(request: ResolvedSubagentStartRequest): Promise<SubagentRun> {
    if (request.signal.aborted) throw new Error('comparison subagent was aborted before publication')
    const requested = request.agentOptions
    const workspace = requested?.dualEvalWorktreeCwd
    if (workspace === undefined) throw new Error('comparison subagent is missing agentOptions.dualEvalWorktreeCwd')
    const cwd = await validateWorkspace(workspace)
    const childDepth = resolveChildDepth(request.parent, request.maxDepth)
    const inherited = captureDelegatedPolicyOverrides(request.parent)
    const childId = SessionId(randomUUID())
    const { dualEvalWorktreeCwd: _cwd, ...route } = requested as AgentOptions
    void _cwd
    const handle = await request.parent.ctx.agents.create({
      sessionId: childId,
      meta: { ...childSessionMeta(request.parent, childDepth, 0), cwd },
      agentOptions: resolveChildAgentOptions(request.parent, route, childDepth),
      signal: request.signal,
      setup: (childCtx): void => {
        appendDelegatedPolicyOverrides((childCtx.agent as Agent).session, inherited)
        applyChildComposition(childCtx, request.parent, {
          persona: request.persona,
          toolFilter: request.toolFilter,
        })
        attachDescriptor(childCtx, request)
      },
    })
    return drive(handle, request.signal, request.prompt, childId)
  }
}
