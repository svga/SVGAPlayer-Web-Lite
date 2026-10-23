export interface ApiCaseGroup {
  id: string
  label: string
}

export interface ApiCaseSupportInput {
  versions: 'both' | 'local'
  capabilities: string[]
}

export interface ApiCaseDefinition extends ApiCaseSupportInput {
  id: string
  group: string
  name: string
  api: string
  fixture: 'none' | 'selected' | 'v1'
  fixtureScoped: boolean
  timeoutMs: number
  repeats: number
  timingMetrics: string[]
  observationOnly: boolean
  notes: string
}

export interface ApiFixtureEntry {
  name: string
  url: string
  bytes: number
  expectation: 'playable' | 'unsupported-v1'
}

export interface ApiExecutionInstance {
  key: string
  caseId: string
  fixtureName: string | null
}

export interface ApiCapabilities {
  [capability: string]: boolean | undefined
}

export interface ApiSupport {
  state: 'supported' | 'unsupported' | 'local-only'
  supported: boolean
  reason: string
}

export const API_CASE_GROUPS: ApiCaseGroup[]
export const API_CASES: ApiCaseDefinition[]

export function caseById(id: string): ApiCaseDefinition | undefined
export function casesFor(groups?: string[] | null): ApiCaseDefinition[]
export function groupLabel(id: string): string
export function capabilityLabel(id: string): string
export function capabilitiesForVersion(version: string | null | undefined): ApiCapabilities
export function mergeCapabilities(
  base: ApiCapabilities,
  probed?: ApiCapabilities | null,
): ApiCapabilities
export function resolveCaseSupport(
  definition: ApiCaseSupportInput,
  capabilities: ApiCapabilities | null | undefined,
  side: 'local' | 'baseline',
): ApiSupport
export function supportLabel(state: string): string
export function fixtureNameFor(
  definition: Pick<ApiCaseDefinition, 'fixture'>,
  selectedFixture: { name: string } | null | undefined,
): string | null
export function buildExecutionPlan(options?: {
  scope?: 'selected' | 'all'
  fixture?: { name: string } | null
  fixtures?: Array<{ name: string; expectation: ApiFixtureEntry['expectation'] }>
  groups?: string[] | null
}): ApiExecutionInstance[]
