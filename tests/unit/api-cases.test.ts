import { describe, expect, it } from 'vitest'

import { API_CASE_RUNNERS } from '../visual/api-case-runners.js'
import {
  API_CASE_GROUPS,
  API_CASES,
  buildExecutionPlan,
  caseById,
  casesFor,
  fixtureNameFor,
  groupLabel,
} from '../visual/api-cases.js'

const groupIds = new Set(API_CASE_GROUPS.map((group) => group.id))

const playableFixtures: Array<{ name: string; expectation: 'playable' | 'unsupported-v1' }> = [
  { name: 'a.svga', expectation: 'playable' },
  { name: 'b.svga', expectation: 'playable' },
  { name: 'show.svga', expectation: 'unsupported-v1' },
]

describe('API case registry', () => {
  it('has unique ids and a known group for every case', () => {
    const ids = API_CASES.map((definition) => definition.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const definition of API_CASES) {
      expect(groupIds.has(definition.group)).toBe(true)
      expect(definition.name.length).toBeGreaterThan(0)
      expect(definition.api.length).toBeGreaterThan(0)
    }
  })

  it('registers exactly one executor for every case and no stale executors', () => {
    const ids = new Set(API_CASES.map((definition) => definition.id))
    for (const id of ids) expect(typeof API_CASE_RUNNERS[id]).toBe('function')
    for (const id of Object.keys(API_CASE_RUNNERS)) expect(ids.has(id)).toBe(true)
  })

  it('keeps metadata internally consistent', () => {
    const versions = new Set(['both', 'local'])
    const fixtures = new Set(['none', 'selected', 'v1'])
    for (const definition of API_CASES) {
      expect(versions.has(definition.versions)).toBe(true)
      expect(fixtures.has(definition.fixture)).toBe(true)
      expect(Number.isInteger(definition.timeoutMs)).toBe(true)
      expect(definition.timeoutMs).toBeGreaterThan(0)
      expect(Number.isInteger(definition.repeats)).toBe(true)
      expect(definition.repeats).toBeGreaterThanOrEqual(0)
      expect(Array.isArray(definition.timingMetrics)).toBe(true)
      if (definition.timingMetrics.length > 0) {
        expect(definition.repeats).toBeGreaterThan(0)
      }
      if (definition.fixtureScoped) {
        expect(['selected']).toContain(definition.fixture)
      }
    }
  })

  it('keeps timing metadata on timing cases and fixture-scoped cases shared', () => {
    for (const definition of API_CASES) {
      if (definition.group === 'timing') expect(definition.timingMetrics.length).toBeGreaterThan(0)
      else expect(definition.timingMetrics).toEqual([])
      if (definition.fixtureScoped) expect(definition.versions).toBe('both')
    }
    expect(
      API_CASES.filter((definition) => definition.versions === 'local').length,
    ).toBeGreaterThan(20)
  })

  it('exposes group labels and case lookup', () => {
    expect(groupLabel('parser')).toBe('Parser')
    expect(groupLabel('missing')).toBe('missing')
    expect(caseById('boot.exports')?.group).toBe('boot')
    expect(caseById('missing')).toBeUndefined()
  })

  it('filters cases by group', () => {
    expect(casesFor(['boot']).every((definition) => definition.group === 'boot')).toBe(true)
    expect(casesFor([]).length).toBe(API_CASES.length)
    expect(casesFor(['parser', 'db']).length).toBe(
      API_CASES.filter((definition) => definition.group === 'parser' || definition.group === 'db')
        .length,
    )
  })

  it('maps fixtures for selected, fixed and no-fixture cases', () => {
    expect(fixtureNameFor({ fixture: 'selected' }, { name: 'a.svga' })).toBe('a.svga')
    expect(fixtureNameFor({ fixture: 'selected' }, null)).toBeNull()
    expect(fixtureNameFor({ fixture: 'v1' }, { name: 'a.svga' })).toBe('show.svga')
    expect(fixtureNameFor({ fixture: 'none' }, { name: 'a.svga' })).toBeNull()
  })
})

describe('API execution plan', () => {
  it('runs every selected case once for the current fixture', () => {
    const plan = buildExecutionPlan({
      scope: 'selected',
      fixture: { name: 'a.svga' },
      fixtures: playableFixtures,
    })
    expect(plan).toHaveLength(API_CASES.length)
    for (const instance of plan) {
      expect(instance.key).toBe(instance.caseId)
      const definition = caseById(instance.caseId)
      expect(instance.fixtureName).toBe(fixtureNameFor(definition!, { name: 'a.svga' }))
    }
  })

  it('honors group filters in the selected scope', () => {
    const plan = buildExecutionPlan({
      scope: 'selected',
      fixture: { name: 'a.svga' },
      fixtures: playableFixtures,
      groups: ['boot'],
    })
    expect(plan.length).toBe(casesFor(['boot']).length)
    expect(plan.every((instance) => caseById(instance.caseId)?.group === 'boot')).toBe(true)
  })

  it('sweeps only fixture-scoped cases across playable fixtures', () => {
    const plan = buildExecutionPlan({
      scope: 'all',
      fixture: { name: 'a.svga' },
      fixtures: playableFixtures,
    })
    const scoped = API_CASES.filter((definition) => definition.fixtureScoped)
    expect(plan).toHaveLength(scoped.length * 2)
    expect(plan.some((instance) => instance.fixtureName === 'show.svga')).toBe(false)
    expect(
      plan.every(
        (instance) =>
          instance.key === `${instance.caseId}@${instance.fixtureName}` &&
          instance.key.includes('@'),
      ),
    ).toBe(true)
  })

  it('returns an empty sweep when no playable fixture is available', () => {
    expect(
      buildExecutionPlan({
        scope: 'all',
        fixtures: [{ name: 'show.svga', expectation: 'unsupported-v1' }],
      }),
    ).toEqual([])
  })
})
