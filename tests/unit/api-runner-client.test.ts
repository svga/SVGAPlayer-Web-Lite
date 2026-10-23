import { describe, expect, it, vi } from 'vitest'

import {
  apiProtocol,
  apiRunnerTimeoutFor,
  isApiRunnerMessage,
} from '../visual/api-runner-client.js'

describe('API runner timeout budget', () => {
  it('reserves cleanup time for a single-shot case', () => {
    expect(apiRunnerTimeoutFor({ timeoutMs: 6_000, repeats: 0 }, 3)).toBe(7_500)
    expect(apiRunnerTimeoutFor({}, 1)).toBe(7_500)
  })

  it('scales repeated timing cases with warmup samples', () => {
    expect(apiRunnerTimeoutFor({ timeoutMs: 6_000, repeats: 3 }, 1)).toBe(8_500)
    expect(apiRunnerTimeoutFor({ timeoutMs: 6_000, repeats: 3 }, 3)).toBe(26_500)
    expect(apiRunnerTimeoutFor({ timeoutMs: 6_000, repeats: 3 }, 5)).toBe(38_500)
  })

  it('clamps invalid rounds and the browser timer maximum', () => {
    expect(apiRunnerTimeoutFor({ timeoutMs: 6_000, repeats: 3 }, 0)).toBe(8_500)
    expect(apiRunnerTimeoutFor({ timeoutMs: 6_000, repeats: 3 }, 99)).toBe(38_500)
    expect(apiRunnerTimeoutFor({ timeoutMs: Number.MAX_SAFE_INTEGER, repeats: 3 }, 5)).toBe(
      0x7fffffff,
    )
    expect(apiRunnerTimeoutFor({ timeoutMs: -1, repeats: 0 }, 1)).toBe(7_500)
  })
})

describe('API runner message validation', () => {
  const source = {} as MessageEventSource
  const valid = {
    origin: 'http://127.0.0.1:4173',
    source,
    data: { protocol: apiProtocol, runId: 'run-1', event: 'ready' },
  }
  const expected = { origin: valid.origin, source, runId: 'run-1' }

  it('accepts a message from the expected origin, frame and run', () => {
    expect(isApiRunnerMessage(valid, expected)).toBe(true)
  })

  it('rejects messages from another origin, frame, protocol or run', () => {
    expect(isApiRunnerMessage({ ...valid, origin: 'http://evil.test' }, expected)).toBe(false)
    expect(isApiRunnerMessage({ ...valid, source: {} as MessageEventSource }, expected)).toBe(false)
    expect(
      isApiRunnerMessage({ ...valid, data: { ...valid.data, protocol: 'other' } }, expected),
    ).toBe(false)
    expect(
      isApiRunnerMessage({ ...valid, data: { ...valid.data, runId: 'run-2' } }, expected),
    ).toBe(false)
    expect(isApiRunnerMessage(null, expected)).toBe(false)
  })

  it('does not consult getters more than needed for malformed data', () => {
    const getter = vi.fn(() => 'run-1')
    const data = { protocol: apiProtocol }
    Object.defineProperty(data, 'runId', { get: getter })
    expect(isApiRunnerMessage({ ...valid, data }, expected)).toBe(true)
    expect(getter).toHaveBeenCalledTimes(1)
  })
})
