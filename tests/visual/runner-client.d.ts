export interface RunnerTimeoutOptions {
  maxPlaybackMs?: number
  includeWarm?: boolean
  timeoutMs?: number
}

export function runnerTimeoutFor(options?: RunnerTimeoutOptions): number

export interface IsolatedRunnerOptions {
  target?: HTMLElement
  visible?: boolean
  onEvent?: (event: unknown) => void
}

export function createIsolatedRunner(runtime: 'baseline' | 'local', options?: IsolatedRunnerOptions): unknown
