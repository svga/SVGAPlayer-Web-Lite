export interface RunnerTimeoutOptions {
  maxPlaybackMs?: number
  includeWarm?: boolean
  timeoutMs?: number
}

export function runnerTimeoutFor(options?: RunnerTimeoutOptions): number
