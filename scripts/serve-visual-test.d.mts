export interface RunnerRuntimeMetadata {
  version: string
  source: 'local' | 'npm'
}

export function runnerSecurityHeadersFor(runtime: string | null, baseline: RunnerRuntimeMetadata | null | undefined): Record<string, string>
