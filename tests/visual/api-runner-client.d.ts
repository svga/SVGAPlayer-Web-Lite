export const apiCancelGraceMs: number
export const apiProtocol: string

export function apiRunnerTimeoutFor(
  definition: { timeoutMs?: number; repeats?: number } | null | undefined,
  rounds?: number,
): number

export function isApiRunnerMessage(
  event: { origin?: string; source?: unknown; data?: Record<string, unknown> } | null | undefined,
  expected: { origin: string; source: unknown; runId: string },
): boolean

export interface ApiRunnerOptions {
  target?: HTMLElement
  onEvent?: (event: Record<string, unknown>) => void
  visible?: boolean
}

export interface ApiRunnerClient {
  frame: HTMLIFrameElement
  ready: Promise<Record<string, unknown>>
  runtime: 'local' | 'baseline'
  readonly disposed: boolean
  readonly timedOut: boolean
  runCase(input: {
    key: string
    caseId: string
    fixtureName?: string | null
    options?: Record<string, unknown>
    timeoutMs?: number
  }): Promise<{
    status: string
    key?: string
    attempt?: number
    forced?: boolean
    error?: { message: string; name?: string }
    checks?: unknown[]
    parity?: unknown
    timings?: Record<string, number[]>
    warnings?: string[]
  }>
  cancelCase(): void
  dispose(): void
}

export function createApiRunner(
  runtime: 'local' | 'baseline',
  options?: ApiRunnerOptions,
): ApiRunnerClient
