import { describe, expect, it } from 'vitest'
import { CallId, createMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { parseNumstat, projectChildTrace } from '../src/index.ts'

describe('dual-model evidence projection', () => {
  it('folds provider usage, latency, cache, and native Tool evidence from child events', () => {
    const events: SessionEvent[] = [
      { type: 'step/start', seq: 1, time: 1_000, data: { turn: 1, step: 1 } },
      {
        type: 'assistant/chunk', seq: 2, time: 1_100,
        data: { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'x' } },
      },
      {
        type: 'assistant/message', seq: 3, time: 1_300,
        data: {
          turn: 1,
          step: 1,
          message: createMessage({
            role: 'assistant',
            content: [{ type: 'text', text: 'x' }],
            source: { kind: 'model', provider: 'mock', model: 'mock' },
          }),
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            cacheReadTokens: 20,
            cacheWriteTokens: 2,
            reasoningTokens: 3,
          },
        },
      },
      {
        type: 'tool/call', seq: 4, time: 1_400,
        data: { turn: 1, step: 1, callId: CallId('call-1'), name: 'bash', arguments: '{"cmd":"pwd"}' },
      },
      {
        type: 'tool/result', seq: 5, time: 1_700,
        data: {
          turn: 1,
          step: 1,
          message: createToolResultMessage({
            callId: CallId('call-1'),
            content: [{ type: 'text', text: '/repo\n' }],
            isError: false,
          }),
        },
      },
    ]

    expect(projectChildTrace(events)).toEqual({
      metrics: {
        steps: 1,
        llmMs: 300,
        toolMs: 300,
        ttftMs: 100,
        ttftSteps: 1,
        decodeMs: 200,
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 20,
        cacheWriteTokens: 2,
        reasoningTokens: 3,
        toolCalls: 1,
      },
      tools: [{
        seq: 5,
        callId: 'call-1',
        name: 'bash',
        argsRaw: '{"cmd":"pwd"}',
        startedAt: 1_400,
        endedAt: 1_700,
        content: [{ type: 'text', text: '/repo\n' }],
        isError: false,
      }],
      toolsTruncated: false,
    })

    expect(projectChildTrace(events.slice(0, 4))).toEqual({
      metrics: {
        steps: 1,
        llmMs: 300,
        toolMs: 0,
        ttftMs: 100,
        ttftSteps: 1,
        decodeMs: 200,
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 20,
        cacheWriteTokens: 2,
        reasoningTokens: 3,
        toolCalls: 1,
      },
      tools: [{
        seq: 4,
        callId: 'call-1',
        name: 'bash',
        argsRaw: '{"cmd":"pwd"}',
        startedAt: 1_400,
        content: [],
        isError: false,
      }],
      toolsTruncated: false,
    })
  })

  it('derives compact line statistics from Git numstat, including binary files', () => {
    expect(parseNumstat('12\t3\tsrc/a.ts\n0\t7\tsrc/b.ts\n-\t-\timage.png\n')).toEqual({
      additions: 12,
      deletions: 10,
      filesChanged: 3,
      binaryFiles: 1,
      files: ['src/a.ts', 'src/b.ts', 'image.png'],
    })
  })
})
