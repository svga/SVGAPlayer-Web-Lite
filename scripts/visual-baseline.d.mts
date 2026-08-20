export interface BaselineRequest {
  baseline: string
}

export interface CommandOptions {
  cwd?: string
}

export type CommandRunner = (command: string, arguments_: string[], options?: CommandOptions) => Promise<string>

export interface RuntimeMetadata {
  version: string
  source: 'local' | 'npm'
  url: '/runtime/local.js' | '/runtime/baseline.js'
  bytes: number
  gzipBytes: number
  integrity: string
  cacheState: 'local' | 'cache' | 'confirmed-cache' | 'downloaded' | 'stale-cache'
  onlineConfirmed?: boolean
  warning?: string
  gitCommit?: string | null
  dirty?: boolean | null
  runtimePath?: string
}

export interface RuntimeDependencies {
  projectDir?: string
  cacheDir?: string
  run?: CommandRunner
}

export function parseBaselineOptions (arguments_?: string[]): BaselineRequest
export function prepareBaselineRuntime (request: BaselineRequest, dependencies?: RuntimeDependencies): Promise<RuntimeMetadata | null>
export function createRuntimeMetadata (dependencies?: RuntimeDependencies): Promise<RuntimeMetadata>
