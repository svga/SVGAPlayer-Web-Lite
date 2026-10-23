import {
  API_CASE_GROUPS,
  buildExecutionPlan,
  capabilitiesForVersion,
  caseById,
  groupLabel,
  mergeCapabilities,
  resolveCaseSupport,
} from './api-cases.js'
import { createApiRunner, apiRunnerTimeoutFor } from './api-runner-client.js'
import {
  apiComparisonWarnings,
  compareCaseRuns,
  createApiReport,
  summarizeApiCases,
} from './api-comparison.js'
import { environmentProfile, formatBytes, formatMilliseconds } from './metrics.js'

const elements = {
  cancel: document.querySelector('[data-testid="api-cancel"]'),
  environmentBadge: document.querySelector('#environment-badge'),
  export: document.querySelector('[data-testid="api-export"]'),
  filterCount: document.querySelector('[data-testid="api-filter-count"]'),
  filterGroup: document.querySelector('[data-testid="api-filter-group"]'),
  filterStatus: document.querySelector('[data-testid="api-filter-status"]'),
  filterSupport: document.querySelector('[data-testid="api-filter-support"]'),
  fixture: document.querySelector('[data-testid="api-fixture-select"]'),
  groupList: document.querySelector('#api-group-list'),
  planSize: document.querySelector('#api-plan-size'),
  progress: document.querySelector('[data-testid="api-progress"]'),
  results: document.querySelector('#api-results-body'),
  rounds: document.querySelector('[data-testid="api-rounds"]'),
  run: document.querySelector('[data-testid="api-run"]'),
  runtimeCards: document.querySelector('#api-runtime-cards'),
  runtimeWarnings: document.querySelector('#api-runtime-warnings'),
  search: document.querySelector('[data-testid="api-search"]'),
  stage: document.querySelector('[data-testid="api-stage"]'),
  stageLabel: document.querySelector('#api-stage-label'),
  stageMessage: document.querySelector('#api-stage-message'),
  status: document.querySelector('[data-testid="api-status"]'),
  summaryCards: document.querySelector('[data-testid="api-summary"]'),
  verdict: document.querySelector('[data-testid="api-verdict"]'),
  warnings: document.querySelector('#api-warnings'),
}

const statusLabels = {
  idle: '等待运行',
  running: '运行中',
  cancelling: '正在取消',
  completed: '已结束',
  cancelled: '已取消',
  failed: '运行失败',
}

const outcomeLabels = {
  pass: '通过',
  'within-band': '波动带内',
  improvement: '改善',
  regression: '计时回退',
  limited: '数据受限',
  observation: '观察',
  'local-only': '仅 2.2.0',
  'baseline-unsupported': '基线不支持',
  'baseline-unavailable': '基线不可用',
  'baseline-failed': '基线失败',
  'parity-mismatch': '行为不一致',
  failed: '失败',
  skipped: '已跳过',
  cancelled: '已取消',
}

const outcomeStates = {
  pass: 'completed',
  'within-band': 'completed',
  improvement: 'completed',
  observation: 'completed',
  regression: 'paused',
  limited: 'paused',
  'local-only': 'idle',
  'baseline-unsupported': 'idle',
  'baseline-unavailable': 'idle',
  'baseline-failed': 'paused',
  'parity-mismatch': 'failed',
  failed: 'failed',
  skipped: 'idle',
  cancelled: 'cancelled',
}

const verdictLabels = {
  pass: '通过',
  review: '需复核',
  fail: '存在问题',
  'local-only': '仅本地',
  cancelled: '已取消',
}

const verdictStates = {
  pass: 'completed',
  review: 'paused',
  fail: 'failed',
  'local-only': 'idle',
  cancelled: 'cancelled',
}

let runtimes = { local: null, baseline: null }
let fixtures = []
let selectedFixture = null
let capabilities = { local: null, baseline: null }
let runners = { local: null, baseline: null }
let rows = []
let rowEntries = []
let running = false
let cancelRequested = false
let baselineStartFailed = false
let localStartFailed = false
let currentRunner = null
let report = null
let runWarnings = []
let sameVersion = false
let runId = createRunId()
let startedAt = null

function createRunId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint32Array(4)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => value.toString(16)).join('-')
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits))
}

function setStatus(state, text) {
  elements.status.dataset.state = state
  elements.status.textContent = text || statusLabels[state] || state
}

function setStage(label, message) {
  elements.stageLabel.textContent = label
  if (message !== undefined) {
    elements.stageMessage.textContent = message
    elements.stageMessage.hidden = false
  }
}

function runtimeLabel(runtime) {
  return runtime === 'baseline' ? '基线版本' : '本地版本'
}

function runtimeDetails(runtime) {
  if (!runtime) return [['状态', '不可用']]
  return [
    ['版本', runtime.version || '未知'],
    ['来源', runtime.source || '未知'],
    ['缓存', runtime.cacheState || '未知'],
    ['原始', Number.isFinite(runtime.bytes) ? formatBytes(runtime.bytes) : '未知'],
    ['gzip', Number.isFinite(runtime.gzipBytes) ? formatBytes(runtime.gzipBytes) : '未知'],
    ['包完整性', runtime.integrity || '未知'],
    ['脚本完整性', runtime.scriptIntegrity || '未知'],
    ['提交', runtime.gitCommit || '未知'],
    ['工作区', runtime.dirty === true ? '有未提交改动' : runtime.dirty === false ? '干净' : '未知'],
  ]
}

function staticWarnings() {
  const warnings = []
  if (!runtimes.baseline)
    warnings.push('基线运行时不可用：本地 API 套件仍可运行，但基线列与跨版本对比会标记为不可用。')
  if (runtimes.baseline?.version && runtimes.local?.version === runtimes.baseline.version)
    warnings.push('基线与本地版本相同，计时差异只代表同版本噪声，不作为版本回退结论。')
  if (runtimes.baseline?.cacheState === 'stale-cache')
    warnings.push('基线来自过期缓存，网络恢复后建议重新确认。')
  const environment = environmentProfile()
  if (!environment.worker) warnings.push('当前浏览器不提供 Worker，默认解析路径无法运行。')
  if (!environment.offscreenCanvas)
    warnings.push('当前浏览器不提供 OffscreenCanvas，渲染会使用 HTML Canvas。')
  if (!environment.imageBitmap)
    warnings.push('当前浏览器不提供 ImageBitmap，图片解码会使用后备路径。')
  return warnings
}

function renderRuntimeCards() {
  const cards = ['baseline', 'local'].map((runtime) => {
    const value = runtimes[runtime]
    const card = document.createElement('article')
    card.className = 'runtime-card'
    card.dataset.testid = `api-runtime-card-${runtime}`
    card.dataset.available = String(Boolean(value))
    const heading = document.createElement('h3')
    heading.textContent = value ? runtimeLabel(runtime) : '基线版本不可用'
    const list = document.createElement('dl')
    list.replaceChildren(
      ...runtimeDetails(value).flatMap(([term, detail]) => {
        const dt = document.createElement('dt')
        dt.textContent = term
        const dd = document.createElement('dd')
        dd.textContent = detail
        return [dt, dd]
      }),
    )
    card.append(heading, list)
    return card
  })
  elements.runtimeCards.replaceChildren(...cards)
  renderWarnings()
}

function renderWarnings(extra = []) {
  const warnings = [...new Set([...staticWarnings(), ...runWarnings, ...extra])]
  elements.runtimeWarnings.replaceChildren(
    ...warnings.map((text) => Object.assign(document.createElement('p'), { textContent: text })),
  )
}

function renderEnvironment() {
  const environment = environmentProfile()
  const browser = environment.browser.includes('Firefox/')
    ? 'Firefox'
    : environment.browser.includes('AppleWebKit/') && !environment.browser.includes('Chrome/')
      ? 'WebKit'
      : 'Chromium'
  elements.environmentBadge.textContent = `${browser} · ${environment.viewport} · DPR ${environment.devicePixelRatio} · CPU ${environment.hardwareConcurrency || '未知'} · ${environment.worker ? 'Worker' : '无 Worker'} · ${environment.offscreenCanvas ? 'OffscreenCanvas' : 'HTML Canvas'} · ${environment.crossOriginIsolated ? '跨源隔离' : '未隔离'}`
  elements.environmentBadge.title = environment.browser
}

function renderGroupList() {
  elements.groupList.replaceChildren(
    ...API_CASE_GROUPS.map((group) => {
      const label = document.createElement('label')
      label.className = 'api-group-item'
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.checked = true
      input.value = group.id
      input.dataset.testid = `api-group-${group.id}`
      const text = document.createElement('span')
      text.textContent = group.label
      label.append(input, text)
      input.addEventListener('change', updatePlanSize)
      return label
    }),
  )
}

function selectedGroups() {
  return [...elements.groupList.querySelectorAll('input[type="checkbox"]:checked')].map(
    (input) => input.value,
  )
}

function currentScope() {
  return document.querySelector('input[name="api-scope"]:checked')?.value || 'selected'
}

function currentRounds() {
  return Number(elements.rounds.value) || 1
}

function planNow() {
  return buildExecutionPlan({
    scope: currentScope(),
    fixture: selectedFixture,
    fixtures,
    groups: selectedGroups(),
  })
}

function updatePlanSize() {
  if (fixtures.length === 0) {
    elements.planSize.textContent = '读取中'
    return
  }
  const plan = planNow()
  elements.planSize.textContent = `${plan.length} 个用例`
  elements.run.disabled = running || plan.length === 0
}

function renderFixtureOptions() {
  elements.fixture.replaceChildren(
    ...fixtures.map((fixture) => {
      const option = document.createElement('option')
      option.value = fixture.name
      option.textContent =
        fixture.expectation === 'unsupported-v1'
          ? `${fixture.name} · SVGA 1.x 预期拒绝`
          : fixture.name
      return option
    }),
  )
  selectedFixture = fixtures.find((fixture) => fixture.name === 'soundwave.svga') || fixtures[0]
  if (selectedFixture) elements.fixture.value = selectedFixture.name
  elements.fixture.disabled = false
  renderFixtureWarning()
}

function renderFixtureWarning() {
  if (selectedFixture?.expectation === 'unsupported-v1')
    runWarnings = [
      ...runWarnings.filter((warning) => !warning.startsWith('当前素材是 SVGA 1.x')),
      '当前素材是 SVGA 1.x 保留文件：正向加载用例会按预期失败，请切换到可播放素材。',
    ]
  else runWarnings = runWarnings.filter((warning) => !warning.startsWith('当前素材是 SVGA 1.x'))
  renderWarnings()
}

function renderSummary() {
  const summary = summarizeApiCases(rows, {
    cancelled: cancelRequested,
    baselineAvailable: Boolean(runtimes.baseline) && !baselineStartFailed,
  })
  const cards = [
    ['用例', summary.total],
    ['通过', summary.passed],
    ['失败', summary.failed],
    ['仅 2.2.0', summary.localOnly],
    ['基线不支持', summary.baselineUnsupported],
    ['基线不可用', summary.baselineUnavailable],
    ['行为不一致', summary.parityMismatch],
    ['计时回退', summary.regressions],
    ['观察项', summary.observation],
    ['已跳过', summary.skipped],
  ]
  elements.summaryCards.replaceChildren(
    ...cards.map(([label, value]) => {
      const card = document.createElement('div')
      card.className = 'summary-card'
      const heading = document.createElement('span')
      heading.textContent = label
      const output = document.createElement('strong')
      output.textContent = String(value)
      card.append(heading, output)
      return card
    }),
  )
  const verdict = summary.verdict
  elements.verdict.textContent = verdictLabels[verdict] || verdict
  elements.verdict.dataset.state = verdictStates[verdict] || 'idle'
  elements.verdict.dataset.verdict = verdict
  elements.warnings.replaceChildren(
    ...apiComparisonWarnings({
      rounds: currentRounds(),
      sameVersion,
      baselineAvailable: Boolean(runtimes.baseline) && !baselineStartFailed,
      rows,
    }).map((text) => Object.assign(document.createElement('p'), { textContent: text })),
  )
  return summary
}

function statusOf(result) {
  if (!result) return '—'
  if (result.status === 'passed') return '通过'
  if (result.status === 'failed')
    return `失败 ${result.checks?.filter((check) => !check.passed).length || ''}`.trim()
  if (result.status === 'error') return '错误'
  if (result.status === 'timeout') return '超时'
  if (result.status === 'skipped') return '跳过'
  if (result.status === 'cancelled') return '取消'
  if (result.status === 'local-only') return '仅 2.2.0'
  if (result.status === 'unsupported') return '不支持'
  if (result.status === 'unavailable') return '不可用'
  return result.status
}

function statusTone(result) {
  if (!result) return 'missing'
  if (result.status === 'passed') return 'passed'
  if (['failed', 'error', 'timeout'].includes(result.status)) return 'failed'
  if (result.status === 'skipped') return 'skipped'
  if (result.status === 'cancelled') return 'cancelled'
  return 'info'
}

function supportKey(row) {
  if (row.support.baseline === 'local-only') return 'local-only'
  if (row.outcome === 'baseline-unavailable') return 'both'
  if (row.support.baseline === 'unsupported') return 'baseline-unsupported'
  return 'both'
}

function supportText(row) {
  const key = supportKey(row)
  if (key === 'local-only') return '仅 2.2.0'
  if (key === 'baseline-unsupported') return '基线不支持'
  return '双版本'
}

function metricValue(metric, aggregate) {
  if (!aggregate || !Number.isFinite(aggregate.median)) return '—'
  if (metric.endsWith('Ms')) return formatMilliseconds(aggregate.median)
  if (metric === 'actualFps') return `${round(aggregate.median)} fps`
  if (metric === 'skippedFrames' || metric === 'longTaskCount')
    return String(Math.round(aggregate.median))
  return String(round(aggregate.median, 1))
}

function metricDelta(metric, comparison) {
  if (!comparison) return ''
  if (comparison.resolutionLimited) return '低于 1 ms'
  if (Number.isFinite(comparison.percentDelta)) {
    const value = comparison.percentDelta
    return `${value > 0 ? '+' : ''}${round(value * 100, 1)}%`
  }
  if (Number.isFinite(comparison.absoluteDelta)) {
    const value = comparison.absoluteDelta
    return `${value > 0 ? '+' : ''}${round(value, 2)}`
  }
  return '—'
}

function timingCell(row, definition) {
  const metrics = definition.timingMetrics || []
  if (metrics.length === 0) return '—'
  const container = document.createElement('div')
  container.className = 'api-timing-cell'
  for (const metric of metrics) {
    const comparison = row.timingComparisons?.[metric]
    const line = document.createElement('div')
    if (!comparison) {
      line.textContent = `${metric}: —`
    } else {
      line.textContent = `${metric}: ${metricValue(metric, comparison.local)} · ${metricValue(metric, comparison.baseline)} · ${metricDelta(metric, comparison)}`
    }
    if (comparison?.sameVersion) line.dataset.sameVersion = 'true'
    if (comparison?.outcome) line.dataset.outcome = comparison.outcome
    container.append(line)
  }
  if (definition.observationOnly) {
    const note = document.createElement('span')
    note.className = 'api-observation-note'
    note.textContent = '观察值，不作优劣判断'
    container.append(note)
  }
  return container
}

function detailsFor(row) {
  const details = document.createElement('div')
  details.className = 'api-case-detail'
  const checks = document.createElement('ul')
  checks.className = 'api-check-list'
  for (const side of ['local', 'baseline']) {
    for (const check of row[side]?.checks || []) {
      // Keep every local check; on the baseline show only failures so a
      // matching run stays compact.
      if (side === 'baseline' && check.passed) continue
      const item = document.createElement('li')
      item.dataset.passed = String(check.passed)
      const prefix = side === 'baseline' ? '基线 · ' : ''
      item.textContent = `${check.passed ? '✓' : '✗'} ${prefix}${check.label}${check.detail ? `：${check.detail}` : ''}`
      checks.append(item)
    }
  }
  if (checks.childElementCount > 0) details.append(checks)
  for (const side of ['local', 'baseline']) {
    const error = row[side]?.error
    if (!error) continue
    const item = document.createElement('p')
    item.className = 'api-case-warning'
    item.textContent = `${runtimeLabel(side)}错误：${error.name || 'Error'} · ${error.message}`
    details.append(item)
  }
  if (row.parity?.state === 'mismatch') {
    const mismatch = document.createElement('p')
    mismatch.className = 'api-parity-mismatch'
    mismatch.textContent = `行为不一致：本地 ${JSON.stringify(row.parity.local)} · 基线 ${JSON.stringify(row.parity.baseline)}`
    details.append(mismatch)
  }
  for (const warning of row.warnings || []) {
    const item = document.createElement('p')
    item.className = 'api-case-warning'
    item.textContent = warning
    details.append(item)
  }
  if (details.childElementCount === 0) {
    const item = document.createElement('p')
    item.className = 'api-case-warning'
    item.textContent = '没有额外检查项'
    details.append(item)
  }
  return details
}

function appendRow(row) {
  const definition = caseById(row.caseId)
  const element = document.createElement('tr')
  element.dataset.testid = 'api-case-row'
  element.dataset.caseId = row.caseId
  element.dataset.group = row.group
  element.dataset.support = supportKey(row)
  element.dataset.localStatus = row.local?.status || 'missing'
  element.dataset.baselineStatus = row.baseline?.status || 'missing'
  element.dataset.outcome = row.outcome

  const nameCell = document.createElement('th')
  nameCell.scope = 'row'
  const details = document.createElement('details')
  details.className = 'api-case-details'
  const summary = document.createElement('summary')
  const name = document.createElement('span')
  name.className = 'api-case-name'
  name.textContent = row.name
  const identifier = document.createElement('code')
  identifier.textContent = row.caseId
  summary.append(name, identifier)
  if (row.fixtureName) {
    const fixture = document.createElement('span')
    fixture.className = 'api-case-fixture'
    fixture.textContent = row.fixtureName
    summary.append(fixture)
  }
  details.append(summary, detailsFor(row))
  nameCell.append(details)

  const supportCell = document.createElement('td')
  supportCell.textContent = supportText(row)
  supportCell.dataset.label = '支持'

  const localCell = document.createElement('td')
  localCell.textContent = statusOf(row.local)
  localCell.dataset.tone = statusTone(row.local)
  localCell.dataset.label = '2.2.0'

  const baselineCell = document.createElement('td')
  baselineCell.textContent = statusOf(row.baseline)
  baselineCell.dataset.tone = statusTone(row.baseline)
  baselineCell.dataset.label = '基线'

  const timing = document.createElement('td')
  timing.dataset.label = '计时'
  timing.append(timingCell(row, definition))

  const outcome = document.createElement('td')
  outcome.textContent = outcomeLabels[row.outcome] || row.outcome
  outcome.dataset.tone = outcomeStates[row.outcome] || 'idle'
  outcome.dataset.label = '判定'

  element.append(nameCell, supportCell, localCell, baselineCell, timing, outcome)
  elements.results.append(element)
  rowEntries.push({ element, row })
  applyFilters()
}

function applyFilters() {
  const group = elements.filterGroup.value
  const support = elements.filterSupport.value
  const status = elements.filterStatus.value
  const query = elements.search.value.trim().toLowerCase()
  let visible = 0
  for (const { element, row } of rowEntries) {
    const matchesGroup = group === 'all' || row.group === group
    const matchesSupport = support === 'all' || supportKey(row) === support
    const matchesStatus = status === 'all' || (row.local?.status || 'missing') === status
    const haystack = `${row.caseId} ${row.name} ${row.api}`.toLowerCase()
    const matchesQuery = query === '' || haystack.includes(query)
    const show = matchesGroup && matchesSupport && matchesStatus && matchesQuery
    element.hidden = !show
    if (show) visible++
  }
  elements.filterCount.textContent = `${visible} / ${rowEntries.length}`
}

function resetResults() {
  rows = []
  rowEntries = []
  elements.results.replaceChildren()
  elements.summaryCards.replaceChildren()
  elements.warnings.replaceChildren()
  elements.export.disabled = true
  elements.verdict.textContent = '等待运行'
  elements.verdict.dataset.state = 'idle'
  elements.verdict.dataset.verdict = 'idle'
  elements.filterCount.textContent = '0 / 0'
  report = null
  runWarnings = []
  renderWarnings()
}

function clearStage() {
  for (const runtime of ['local', 'baseline']) {
    if (!runners[runtime]) continue
    try {
      runners[runtime].dispose()
    } catch {}
    runners[runtime] = null
  }
  elements.stageMessage.hidden = false
  elements.stageMessage.textContent = '运行后，本地与基线的隔离运行器会在这里显示测试画布。'
  elements.stageLabel.textContent = '等待运行'
}

async function ensureRunner(side) {
  if (runners[side]) return runners[side]
  const client = createApiRunner(side, {
    target: elements.stage,
    visible: true,
    onEvent: (message) => {
      if (message.event === 'case-start') {
        const definition = caseById(message.caseId)
        setStage(
          `${runtimeLabel(side)} · ${definition?.name || message.caseId}${message.fixtureName ? ` · ${message.fixtureName}` : ''}`,
          '',
        )
      }
    },
  })
  try {
    const ready = await client.ready
    const version = runtimes[side]?.version
    capabilities[side] = mergeCapabilities(capabilitiesForVersion(version), ready.capabilities)
    runners[side] = client
    elements.stageMessage.hidden = true
    renderWarnings()
    return client
  } catch (error) {
    client.dispose()
    throw error
  }
}

async function runSide(side, instance, definition) {
  let runner
  try {
    runner = await ensureRunner(side)
  } catch (error) {
    if (side === 'baseline') {
      baselineStartFailed = true
      capabilities.baseline = null
    } else {
      localStartFailed = true
    }
    return {
      status: 'error',
      error: { message: error instanceof Error ? error.message : String(error) },
    }
  }
  currentRunner = runner
  try {
    const result = await runner.runCase({
      key: instance.key,
      caseId: instance.caseId,
      fixtureName: instance.fixtureName,
      options: {
        rounds: currentRounds(),
        sampleMs: currentScope() === 'all' ? 1_000 : 1_200,
      },
      timeoutMs: apiRunnerTimeoutFor(definition, currentRounds()),
    })
    if (result.status === 'timeout') {
      runner.dispose()
      if (runners[side] === runner) runners[side] = null
    }
    return result
  } catch (error) {
    return {
      status: 'error',
      error: { message: error instanceof Error ? error.message : String(error) },
    }
  } finally {
    if (currentRunner === runner) currentRunner = null
  }
}

function updateProgress(done, total, instance) {
  const definition = caseById(instance.caseId)
  const fixture = instance.fixtureName ? ` · ${instance.fixtureName}` : ''
  elements.progress.textContent = `${done}/${total} · ${definition?.name || instance.caseId}${fixture}`
  setStatus('running', `运行中 ${done}/${total}`)
}

async function runApiSuite() {
  if (running) return
  running = true
  cancelRequested = false
  baselineStartFailed = false
  localStartFailed = false
  sameVersion = Boolean(runtimes.baseline) && runtimes.local?.version === runtimes.baseline?.version
  runId = createRunId()
  startedAt = new Date().toISOString()
  resetResults()
  renderFixtureWarning()
  clearStage()
  elements.run.disabled = true
  elements.cancel.disabled = false
  elements.export.disabled = true
  elements.fixture.disabled = true
  elements.rounds.disabled = true
  for (const input of elements.groupList.querySelectorAll('input')) input.disabled = true
  for (const input of document.querySelectorAll('input[name="api-scope"]')) input.disabled = true
  elements.stage.scrollIntoView({ block: 'center' })
  setStatus('running', '准备运行')

  const plan = planNow()
  if (plan.length === 0) {
    running = false
    setStatus('failed', '没有可执行的用例')
    elements.cancel.disabled = true
    restoreControls()
    return
  }

  try {
    await ensureRunner('local')
  } catch (error) {
    running = false
    elements.cancel.disabled = true
    setStatus('failed', '本地隔离运行器启动失败')
    runWarnings.push(
      `本地隔离运行器启动失败：${error instanceof Error ? error.message : String(error)}`,
    )
    renderWarnings()
    restoreControls()
    return
  }
  if (runtimes.baseline) {
    try {
      await ensureRunner('baseline')
    } catch (error) {
      baselineStartFailed = true
      capabilities.baseline = null
      runWarnings.push(
        `基线隔离运行器启动失败：${error instanceof Error ? error.message : String(error)}`,
      )
      renderWarnings()
    }
  }

  let done = 0
  for (const instance of plan) {
    if (cancelRequested) break
    done++
    updateProgress(done, plan.length, instance)
    const definition = caseById(instance.caseId)
    const localSupport = resolveCaseSupport(definition, capabilities.local, 'local')
    const baselineSupport = resolveCaseSupport(
      definition,
      capabilities.baseline || capabilitiesForVersion(runtimes.baseline?.version),
      'baseline',
    )
    let localResult = null
    let baselineResult = null
    const order = done % 2 === 1 ? ['local', 'baseline'] : ['baseline', 'local']
    for (const side of order) {
      if (cancelRequested) break
      if (side === 'local') {
        if (!localSupport.supported) {
          localResult = { status: 'unsupported', reason: localSupport.reason }
          continue
        }
        localResult = await runSide('local', instance, definition)
      } else {
        if (!runtimes.baseline || baselineStartFailed) {
          baselineResult = { status: 'unavailable' }
          continue
        }
        if (!baselineSupport.supported) {
          baselineResult = {
            status: baselineSupport.state,
            reason: baselineSupport.reason,
          }
          continue
        }
        baselineResult = await runSide('baseline', instance, definition)
      }
    }
    if (cancelRequested && localResult === null && baselineResult === null) continue
    const row = compareCaseRuns({
      definition,
      instance,
      localSupport,
      baselineSupport,
      baselineAvailable: Boolean(runtimes.baseline) && !baselineStartFailed,
      local: localResult,
      baseline: baselineResult,
      sameVersion,
      rounds: currentRounds(),
    })
    rows.push(row)
    appendRow(row)
    renderSummary()
    if (localStartFailed) break
  }

  running = false
  elements.cancel.disabled = true
  clearStage()
  restoreControls()
  const cancelled = cancelRequested
  setStatus(
    cancelled ? 'cancelled' : localStartFailed ? 'failed' : 'completed',
    cancelled
      ? `已取消，保留 ${rows.length} 项`
      : localStartFailed
        ? '本地隔离运行器中断'
        : `已完成 ${rows.length} 项`,
  )
  elements.progress.textContent = cancelled
    ? `已取消 · 保留 ${rows.length} 项`
    : `完成 ${rows.length} 项`
  const summary = renderSummary()
  report = createApiReport({
    runtimes,
    environment: environmentProfile(),
    config: {
      runId,
      scope: currentScope(),
      fixture: selectedFixture?.name || null,
      fixtures:
        currentScope() === 'all'
          ? fixtures
              .filter((fixture) => fixture.expectation === 'playable')
              .map((fixture) => fixture.name)
          : [selectedFixture?.name].filter(Boolean),
      groups: selectedGroups(),
      rounds: currentRounds(),
      warmup: currentRounds() >= 3,
      runnerCsp: 'unsafe-eval',
    },
    rows,
    warnings: [
      ...new Set([
        ...runWarnings,
        ...apiComparisonWarnings({
          rounds: currentRounds(),
          sameVersion,
          baselineAvailable: Boolean(runtimes.baseline) && !baselineStartFailed,
          rows,
        }),
      ]),
    ],
    startedAt,
    finishedAt: new Date().toISOString(),
    cancelled,
    baselineAvailable: Boolean(runtimes.baseline) && !baselineStartFailed,
  })
  elements.export.disabled = rows.length === 0
  elements.verdict.dataset.verdict = summary.verdict
}

function restoreControls() {
  running = false
  elements.run.disabled = fixtures.length === 0 || planNow().length === 0
  elements.fixture.disabled = false
  elements.rounds.disabled = false
  for (const input of elements.groupList.querySelectorAll('input')) input.disabled = false
  for (const input of document.querySelectorAll('input[name="api-scope"]')) input.disabled = false
}

function cancelRun() {
  if (!running || cancelRequested) return
  cancelRequested = true
  elements.cancel.disabled = true
  setStatus('cancelling', '正在取消并清理…')
  currentRunner?.cancelCase()
}

function exportReport() {
  if (!report) return
  const baseline = String(runtimes.baseline?.version || 'no-baseline').replace(
    /[^0-9A-Za-z._-]/g,
    '-',
  )
  const local = String(runtimes.local?.version || 'local').replace(/[^0-9A-Za-z._-]/g, '-')
  const stamp = report.createdAt.replace(/[:.]/g, '-')
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `svga-api-lab-${baseline}-vs-${local}-${stamp}.json`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

async function loadFixtures() {
  const response = await fetch('/api/fixtures', { cache: 'no-store' })
  if (!response.ok) throw Error(`读取素材失败：${response.status}`)
  ;({ fixtures } = await response.json())
  renderFixtureOptions()
  updatePlanSize()
}

async function loadRuntimes() {
  const response = await fetch('/api/runtimes', { cache: 'no-store' })
  if (!response.ok) throw Error(`读取运行时信息失败：${response.status}`)
  runtimes = await response.json()
  renderRuntimeCards()
  updatePlanSize()
}

elements.run.addEventListener('click', () => {
  void runApiSuite()
})
elements.cancel.addEventListener('click', cancelRun)
elements.export.addEventListener('click', exportReport)
elements.fixture.addEventListener('change', () => {
  selectedFixture = fixtures.find((fixture) => fixture.name === elements.fixture.value) || null
  renderFixtureWarning()
  updatePlanSize()
})
elements.rounds.addEventListener('change', updatePlanSize)
for (const input of document.querySelectorAll('input[name="api-scope"]'))
  input.addEventListener('change', updatePlanSize)
elements.filterGroup.addEventListener('change', applyFilters)
elements.filterSupport.addEventListener('change', applyFilters)
elements.filterStatus.addEventListener('change', applyFilters)
elements.search.addEventListener('input', applyFilters)
window.addEventListener('beforeunload', () => {
  try {
    currentRunner?.cancelCase()
  } catch {}
  clearStage()
})

renderEnvironment()
renderGroupList()
for (const group of API_CASE_GROUPS) {
  const option = document.createElement('option')
  option.value = group.id
  option.textContent = groupLabel(group.id)
  elements.filterGroup.append(option)
}
renderWarnings()
void loadFixtures().catch((error) => {
  elements.planSize.textContent = '读取失败'
  runWarnings.push(error instanceof Error ? error.message : String(error))
  renderWarnings()
})
void loadRuntimes().catch((error) => {
  runtimes = { local: null, baseline: null }
  renderRuntimeCards()
  setStatus('failed', '运行时信息不可用')
  runWarnings.push(error instanceof Error ? error.message : String(error))
  renderWarnings()
})
