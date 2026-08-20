export interface MetricAggregate {
  samples: number
  median: number | null
  relativeMad: number | null
}

export interface MetricComparison {
  name: string
  direction: 'lower' | 'higher' | 'target-distance' | 'approximate' | 'observation'
  baseline: MetricAggregate
  local: MetricAggregate
  baselineValue: number | null
  localValue: number | null
  absoluteDelta: number | null
  percentDelta: number | null
  bandPercent: number
  outcome: 'regression' | 'improvement' | 'within-band' | 'limited'
  approximate?: boolean
  observational?: boolean
}

export function median(values: number[]): number | null
export function relativeMad(values: number[]): number | null
export function aggregateRounds(values: number[]): MetricAggregate
export function aggregateVersionRounds(rounds: unknown[], metric: string | ((round: unknown) => number)): MetricAggregate
export function comparisonBand(baseline: MetricAggregate, local: MetricAggregate): number
export function metricDirection(name: string): MetricComparison['direction']
export function compareMetric(name: string, baseline: MetricAggregate | number[], local: MetricAggregate | number[], options?: { targetFps?: number }): MetricComparison
export function compareCorrectness(input: { baseline: unknown, local: unknown }): { state: string, performanceComparable: boolean }
export function compareWarmCorrectness(input: { baseline: unknown, local: unknown }): { state: string, performanceComparable: boolean }
