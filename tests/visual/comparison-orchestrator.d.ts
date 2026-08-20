import type { MetricAggregate, MetricComparison } from './comparison.js'

export interface ComparisonRounds {
  baseline: unknown[]
  local: unknown[]
}

export interface ComparisonResult {
  fixture: unknown
  read: unknown
  orders: Array<Array<'baseline' | 'local'>>
  rounds: ComparisonRounds
  aggregates: Record<'baseline' | 'local', Record<string, MetricAggregate>>
  metricComparisons: Record<string, MetricComparison>
  warmAggregates: Record<'baseline' | 'local', Record<string, MetricAggregate>>
  warmMetricComparisons: Record<string, MetricComparison>
  correctness: { state: string, performanceComparable: boolean }
  warmCorrectness: { state: string, performanceComparable: boolean }
  warmPerformanceComparable: boolean
  warnings: string[]
  complete?: boolean
  cancelled?: boolean
}

export function comparisonCorrectness(rounds: ComparisonRounds): { state: string, performanceComparable: boolean }
export function warmComparisonCorrectness(rounds: ComparisonRounds): { state: string, performanceComparable: boolean }
export function comparisonAggregates(rounds: ComparisonRounds): Record<'baseline' | 'local', Record<string, MetricAggregate>>
export function comparisonMetrics(rounds: ComparisonRounds, targetFps?: number): Record<string, MetricComparison>
export function warmComparisonAggregates(rounds: ComparisonRounds): Record<'baseline' | 'local', Record<string, MetricAggregate>>
export function warmComparisonMetrics(rounds: ComparisonRounds, targetFps?: number): Record<string, MetricComparison>
export function comparisonSummaryWarnings(
  aggregates: Record<'baseline' | 'local', Record<string, MetricAggregate>>,
  rounds: number,
  options?: { scope?: string, directional?: boolean }
): string[]
export function createComparisonReport(input: unknown): Record<string, unknown>
export function sharedReadResult(buffer: ArrayBuffer, readMs: number): { buffer: ArrayBuffer, read: { bytes: number, readMs: number, throughputBytesPerSecond: number } }
