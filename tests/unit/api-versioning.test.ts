import { describe, expect, it } from 'vitest'

import {
  capabilitiesForVersion,
  caseById,
  mergeCapabilities,
  resolveCaseSupport,
  supportLabel,
} from '../visual/api-cases.js'

const sharedCapabilityCase = {
  id: 'synthetic.shared',
  versions: 'both' as const,
  capabilities: ['playerState'],
}
const sharedCase = caseById('parser.url-string')!
const localOnlyCase = caseById('player.step-frames')!

describe('version capability mapping', () => {
  it('grants modern capabilities from 2.2.0 onward', () => {
    const modern = capabilitiesForVersion('2.2.0')
    expect(modern.parserConfig).toBe(true)
    expect(modern.parserBytes).toBe(true)
    expect(modern.parserAbort).toBe(true)
    expect(modern.parserProgress).toBe(true)
    expect(modern.parserTimeout).toBe(true)
    expect(modern.playerState).toBe(true)
    expect(modern.playerStepToFrame).toBe(true)
    expect(modern.playerFrozenConfig).toBe(true)
    expect(modern.db).toBe(true)
    expect(capabilitiesForVersion('2.10.0').playerState).toBe(true)
    expect(capabilitiesForVersion('3.0.0').playerState).toBe(true)
  })

  it('marks the released 2.1.1 runtime as lacking modern capabilities', () => {
    const legacy = capabilitiesForVersion('2.1.1')
    expect(legacy.parserConfig).toBe(false)
    expect(legacy.parserBytes).toBe(false)
    expect(legacy.playerState).toBe(false)
    expect(legacy.playerStepToFrame).toBe(false)
    expect(legacy.playerFrozenConfig).toBe(false)
    expect(legacy.db).toBe(true)
  })

  it('treats unparseable versions as legacy', () => {
    expect(capabilitiesForVersion(undefined).playerState).toBe(false)
    expect(capabilitiesForVersion('latest').playerState).toBe(false)
    expect(capabilitiesForVersion('2').playerState).toBe(false)
  })
})

describe('capability merge', () => {
  it('lets probed environment flags override the version defaults', () => {
    const merged = mergeCapabilities(capabilitiesForVersion('2.2.0'), {
      eval: false,
      worker: false,
      playerState: false,
    })
    expect(merged.eval).toBe(false)
    expect(merged.worker).toBe(false)
    expect(merged.playerState).toBe(false)
    expect(merged.parserProgress).toBe(true)
  })

  it('ignores undefined probes', () => {
    const merged = mergeCapabilities({ db: true }, { db: undefined, eval: true })
    expect(merged.db).toBe(true)
    expect(merged.eval).toBe(true)
  })
})

describe('case support resolution', () => {
  it('marks 2.2.0-only cases local-only on the baseline', () => {
    expect(resolveCaseSupport(localOnlyCase, capabilitiesForVersion('2.2.0'), 'baseline')).toEqual({
      state: 'local-only',
      supported: false,
      reason: '仅 2.2.0',
    })
    expect(
      resolveCaseSupport(localOnlyCase, capabilitiesForVersion('2.2.0'), 'local').supported,
    ).toBe(true)
  })

  it('marks shared cases unsupported when the baseline lacks a capability', () => {
    expect(
      resolveCaseSupport(sharedCapabilityCase, capabilitiesForVersion('2.1.1'), 'baseline'),
    ).toEqual({
      state: 'unsupported',
      supported: false,
      reason: 'player.state',
    })
    expect(
      resolveCaseSupport(sharedCapabilityCase, capabilitiesForVersion('2.2.0'), 'baseline')
        .supported,
    ).toBe(true)
  })

  it('runs shared cases on both sides when capabilities match', () => {
    expect(resolveCaseSupport(sharedCase, capabilitiesForVersion('2.1.1'), 'baseline')).toEqual({
      state: 'supported',
      supported: true,
      reason: '',
    })
    expect(resolveCaseSupport(sharedCase, capabilitiesForVersion('2.1.1'), 'local').supported).toBe(
      true,
    )
  })

  it('labels support states in user-facing text', () => {
    expect(supportLabel('local-only')).toBe('仅 2.2.0')
    expect(supportLabel('unsupported')).toBe('基线不支持')
    expect(supportLabel('supported')).toBe('双版本')
  })
})
