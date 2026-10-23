import type { MetricAggregate } from './comparison'

export interface ApiRunResult {
  status: string
  reason?: string
  checks?: Array<{ id: string; label: string; passed: boolean; detail?: string }>
  parity?: unknown
  timings?: Record<string, number[]>
  warnings?: string[]
}

export interface ApiTimingComparison {
  name: string
  direction: 'lower' | 'higher' | 'target-distance' | 'approximate' | 'observation'
  baseline: MetricAggregate
  local: MetricAggregate
  absoluteDelta: number | null
  percentDelta: number | null
  bandPercent: number
  outcome: string
  sameVersion?: boolean
  relativeMadWarning?: boolean
  limited?: boolean
  resolutionLimited?: boolean
}

export interface ApiCaseRow {
  key: string
  caseId: string
  fixtureName: string | null
  group: string
  name: string
  api: string
  versions: 'both' | 'local'
  observationOnly: boolean
  support: { local: string; baseline: string }
  local: ApiRunResult | null
  baseline: ApiRunResult | null
  timingComparisons: Record<string, ApiTimingComparison>
  parity: { state: string; local?: unknown; baseline?: unknown }
  warnings: string[]
  outcome: string
  rounds: number
}

export interface ApiCaseSummary {
  total: number
  passed: number
  failed: number
  localOnly: number
  baselineUnsupported: number
  baselineUnavailable: number
  parityMismatch: number
  baselineFailure: number
  regressions: number
  improvements: number
  withinBand: number
  limited: number
  observation: number
  skipped: number
  cancelled: number
  verdict: 'pass' | 'review' | 'fail' | 'local-only' | 'cancelled'
}

export function compareCaseRuns(input: {
  definition: {
    id: string
    group: string
    name: string
    api: string
    versions: 'both' | 'local'
    observationOnly?: boolean
    timingMetrics: string[]
  }
  instance: { key: string; caseId: string; fixtureName?: string | null }
  localSupport?: { state: string; supported: boolean; reason: string } | null
  baselineSupport?: { state: string; supported: boolean; reason: string } | null
  baselineAvailable?: boolean
  local?: ApiRunResult | null
  baseline?: ApiRunResult | null
  sameVersion?: boolean
  rounds?: number
}): ApiCaseRow

export function summarizeApiCases(
  rows: Array<Pick<ApiCaseRow, 'outcome'>>,
  options?: { cancelled?: boolean; baselineAvailable?: boolean },
): ApiCaseSummary

export function buildCaseTimings(
  rows: ApiCaseRow[],
): Record<
  string,
  Record<
    string,
    { local: MetricAggregate; baseline: MetricAggregate; comparison: ApiTimingComparison }
  >
>

export function apiComparisonWarnings(input: {
  rounds?: number
  sameVersion?: boolean
  baselineAvailable?: boolean
  rows?: Array<{
    key: string
    timingComparisons?: Record<
      string,
      { relativeMadWarning?: boolean; resolutionLimited?: boolean }
    >
  }>
}): string[]

export function createApiReport(input: {
  schemaVersion?: number
  runtimes: unknown
  environment: unknown
  config?: {
    runId?: string
    [key: string]: unknown
  }
  rows: ApiCaseRow[]
  warnings?: string[]
  startedAt?: string
  finishedAt?: string
  cancelled?: boolean
  baselineAvailable?: boolean
}): {
  schemaVersion: number
  kind: string
  createdAt: string
  startedAt: string | null
  runId: string | null
  runtimes: unknown
  environment: unknown
  config: Record<string, unknown>
  cases: Array<Record<string, unknown>>
  timings: Record<string, unknown>
  summary: ApiCaseSummary
  warnings: string[]
}
