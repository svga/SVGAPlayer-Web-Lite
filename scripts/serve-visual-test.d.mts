export interface RunnerRuntimeMetadata {
  version: string
  source: 'local' | 'npm'
}

export const apiRunnerSecurityHeaders: Record<string, string>

export function runnerSecurityHeadersFor(
  runtime: string | null,
  baseline: RunnerRuntimeMetadata | null | undefined,
): Record<string, string>
