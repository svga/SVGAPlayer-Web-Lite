const CAPABILITY_LABELS = {
  parserConfig: 'Parser 配置项',
  parserBytes: 'Parser 字节输入',
  parserAbort: 'Parser AbortSignal',
  parserProgress: 'Parser 进度回调',
  parserTimeout: 'Parser 单请求超时',
  parserUrlObject: 'Parser URL 对象输入',
  parserDirect: 'Parser 直接模式',
  playerState: 'player.state',
  playerProgress: 'player.progress',
  playerIsPlaying: 'player.isPlaying',
  playerStepToFrame: 'stepToFrame',
  playerFrozenConfig: '冻结的 player.config',
  playerDisableOffscreen: 'isDisableOffscreenCanvas',
  db: 'DB',
  dbList: 'indexedDB.databases()',
  eval: '动态代码执行',
}

export const API_CASE_GROUPS = [
  { id: 'boot', label: '启动与导出' },
  { id: 'parser', label: 'Parser' },
  { id: 'player-config', label: 'Player 配置' },
  { id: 'player-lifecycle', label: 'Player 生命周期' },
  { id: 'db', label: 'DB' },
  { id: 'timing', label: '计时' },
]

const groupById = new Map(API_CASE_GROUPS.map((group) => [group.id, group]))

function defineCase(definition) {
  return {
    versions: 'both',
    capabilities: [],
    fixture: 'none',
    fixtureScoped: false,
    timeoutMs: 6_000,
    repeats: 0,
    timingMetrics: [],
    observationOnly: false,
    notes: '',
    ...definition,
  }
}

export const API_CASES = [
  defineCase({
    id: 'boot.exports',
    group: 'boot',
    name: 'UMD 全局导出',
    api: 'SVGA',
    timeoutMs: 4_000,
  }),
  defineCase({
    id: 'boot.constructors',
    group: 'boot',
    name: '构造器与原型方法',
    api: 'SVGA.Parser / SVGA.Player / SVGA.DB',
    timeoutMs: 4_000,
  }),
  defineCase({
    id: 'boot.smoke',
    group: 'boot',
    name: '加载、挂载、播放与销毁',
    api: 'Parser.load → Player.mount/start/destroy',
    fixture: 'selected',
    timeoutMs: 8_000,
  }),

  defineCase({
    id: 'parser.construct',
    group: 'parser',
    name: '默认构造与销毁',
    api: 'new Parser()',
  }),
  defineCase({
    id: 'parser.max-inflight-accept',
    group: 'parser',
    name: 'maxInFlight 边界 1 与 8',
    api: 'new Parser({ maxInFlight })',
    capabilities: ['parserConfig'],
    versions: 'local',
  }),
  defineCase({
    id: 'parser.max-inflight-reject',
    group: 'parser',
    name: 'maxInFlight 非法值',
    api: 'new Parser({ maxInFlight })',
    capabilities: ['parserConfig'],
    versions: 'local',
  }),
  defineCase({
    id: 'parser.headers',
    group: 'parser',
    name: '实例与单次请求头合并',
    api: 'new Parser({ headers }) / load(url, { headers })',
    capabilities: ['parserConfig'],
    versions: 'local',
    fixture: 'selected',
  }),
  defineCase({
    id: 'parser.direct',
    group: 'parser',
    name: 'isDisableWebWorker 直接模式',
    api: 'new Parser({ isDisableWebWorker: true })',
    capabilities: ['parserDirect', 'eval'],
    versions: 'local',
    fixture: 'selected',
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'parser.url-string',
    group: 'parser',
    name: 'URL 字符串加载',
    api: 'load(url)',
    fixture: 'selected',
    fixtureScoped: true,
  }),
  defineCase({
    id: 'parser.url-object',
    group: 'parser',
    name: 'URL 对象加载',
    api: 'load(URL)',
    capabilities: ['parserUrlObject'],
    fixture: 'selected',
  }),
  defineCase({
    id: 'parser.data-url',
    group: 'parser',
    name: 'data: URL 加载',
    api: 'load(data:)',
    fixture: 'selected',
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'parser.blob-url',
    group: 'parser',
    name: 'blob: URL 加载',
    api: 'load(blob:)',
    fixture: 'selected',
  }),
  defineCase({
    id: 'parser.extensionless',
    group: 'parser',
    name: '无后缀 HTTP 地址',
    api: 'load(/fixtures/extensionless)',
  }),
  defineCase({
    id: 'parser.bytes-uint8',
    group: 'parser',
    name: 'Uint8Array 输入不 detach',
    api: 'load(Uint8Array)',
    capabilities: ['parserBytes'],
    versions: 'local',
    fixture: 'selected',
  }),
  defineCase({
    id: 'parser.bytes-arraybuffer',
    group: 'parser',
    name: 'ArrayBuffer 输入',
    api: 'load(ArrayBuffer)',
    capabilities: ['parserBytes'],
    versions: 'local',
    fixture: 'selected',
  }),
  defineCase({
    id: 'parser.progress',
    group: 'parser',
    name: 'onProgress 下载与解码阶段',
    api: 'load(url, { onProgress })',
    capabilities: ['parserProgress'],
    versions: 'local',
    fixture: 'selected',
  }),
  defineCase({
    id: 'parser.abort',
    group: 'parser',
    name: 'AbortSignal 预先、在途与排队取消',
    api: 'load(url, { signal })',
    capabilities: ['parserAbort'],
    versions: 'local',
    fixture: 'selected',
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'parser.timeout',
    group: 'parser',
    name: '单请求超时与 timeout: 0',
    api: 'load(url, { timeout })',
    capabilities: ['parserTimeout'],
    versions: 'local',
    fixture: 'selected',
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'parser.concurrent',
    group: 'parser',
    name: '同一 Parser 并发独立完成',
    api: 'load() × 2',
    capabilities: ['parserAbort'],
    versions: 'local',
    fixture: 'selected',
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'parser.http-error',
    group: 'parser',
    name: '非 2xx 响应拒绝',
    api: 'load(url)',
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'parser.v1-rejected',
    group: 'parser',
    name: 'SVGA 1.x 明确拒绝',
    api: 'load(show.svga)',
    fixture: 'v1',
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'parser.invalid-protocol',
    group: 'parser',
    name: '非法 URL 协议',
    api: 'load(ftp:)',
    capabilities: ['parserConfig'],
    versions: 'local',
  }),
  defineCase({
    id: 'parser.invalid-timeout',
    group: 'parser',
    name: '非法 timeout',
    api: 'load(url, { timeout: -1 })',
    capabilities: ['parserConfig'],
    versions: 'local',
    fixture: 'selected',
  }),
  defineCase({
    id: 'parser.destroy-idempotent',
    group: 'parser',
    name: '重复 destroy',
    api: 'Parser.destroy()',
  }),
  defineCase({
    id: 'parser.load-after-destroy',
    group: 'parser',
    name: 'destroy 后 load 拒绝',
    api: 'Parser.destroy() / load()',
    versions: 'local',
    fixture: 'selected',
  }),

  defineCase({
    id: 'player.construct-canvas',
    group: 'player-config',
    name: 'Canvas 构造器重载',
    api: 'new Player(canvas)',
  }),
  defineCase({
    id: 'player.construct-options',
    group: 'player-config',
    name: '配置对象构造器',
    api: 'new Player({ container, loop })',
  }),
  defineCase({
    id: 'player.construct-empty',
    group: 'player-config',
    name: '空配置对象',
    api: 'new Player({})',
  }),
  defineCase({
    id: 'player.defaults',
    group: 'player-config',
    name: '默认配置快照',
    api: 'player.config',
  }),
  defineCase({
    id: 'player.config-frozen',
    group: 'player-config',
    name: 'config 为冻结快照',
    api: 'player.config',
    capabilities: ['playerFrozenConfig'],
    versions: 'local',
  }),
  defineCase({
    id: 'player.config-validation',
    group: 'player-config',
    name: '配置校验与 setConfig 拒绝',
    api: 'new Player(options) / setConfig(options)',
    capabilities: ['playerState'],
    versions: 'local',
    fixture: 'selected',
  }),
  defineCase({
    id: 'player.initial-getters',
    group: 'player-config',
    name: '初始 state / isPlaying / progress',
    api: 'player.state / isPlaying / progress',
    capabilities: ['playerState', 'playerIsPlaying', 'playerProgress'],
    versions: 'local',
  }),
  defineCase({
    id: 'player.no-delay',
    group: 'player-config',
    name: 'isOpenNoExecutionDelay 计时 Worker',
    api: 'new Player({ isOpenNoExecutionDelay: true })',
    fixture: 'selected',
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'player.start-unmounted',
    group: 'player-config',
    name: '未挂载 start 拒绝',
    api: 'player.start()',
  }),
  defineCase({
    id: 'player.mount-invalid',
    group: 'player-config',
    name: '非法 Video 挂载拒绝',
    api: 'player.mount({})',
    timeoutMs: 8_000,
  }),

  defineCase({
    id: 'player.mount',
    group: 'player-lifecycle',
    name: 'mount 设置帧数与画布尺寸',
    api: 'player.mount(video)',
    fixture: 'selected',
  }),
  defineCase({
    id: 'player.remount',
    group: 'player-lifecycle',
    name: '重复 mount 切换素材',
    api: 'player.mount(video) × 2',
    fixture: 'selected',
  }),
  defineCase({
    id: 'player.start',
    group: 'player-lifecycle',
    name: 'start 启动时间线',
    api: 'player.start()',
    fixture: 'selected',
    fixtureScoped: true,
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'player.pause-resume',
    group: 'player-lifecycle',
    name: 'pause / resume 事件与帧保持',
    api: 'player.pause() / resume()',
    fixture: 'selected',
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'player.stop',
    group: 'player-lifecycle',
    name: 'stop 回到起始帧',
    api: 'player.stop()',
    fixture: 'selected',
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'player.clear',
    group: 'player-lifecycle',
    name: 'clear 清空画布',
    api: 'player.clear()',
  }),
  defineCase({
    id: 'player.end-natural',
    group: 'player-lifecycle',
    name: '自然结束与 onEnd',
    api: 'player.onEnd',
    fixture: 'selected',
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'player.loop-false',
    group: 'player-lifecycle',
    name: 'loop: false 单次播放',
    api: 'new Player({ loop: false })',
    capabilities: ['playerState', 'playerIsPlaying'],
    versions: 'local',
    fixture: 'selected',
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'player.loop-count',
    group: 'player-lifecycle',
    name: 'loop: 2 只结束一次',
    api: 'player.onEnd',
    fixture: 'selected',
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'player.events-order',
    group: 'player-lifecycle',
    name: '事件触发顺序',
    api: 'onStart / onPause / onResume / onStop',
    fixture: 'selected',
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'player.step-frames',
    group: 'player-lifecycle',
    name: 'stepToFrame 首帧、中间帧、末帧',
    api: 'player.stepToFrame(frame)',
    capabilities: ['playerStepToFrame'],
    versions: 'local',
    fixture: 'selected',
  }),
  defineCase({
    id: 'player.step-and-play',
    group: 'player-lifecycle',
    name: 'stepToFrame(frame, true)',
    api: 'player.stepToFrame(frame, true)',
    capabilities: ['playerStepToFrame'],
    versions: 'local',
    fixture: 'selected',
  }),
  defineCase({
    id: 'player.step-invalid',
    group: 'player-lifecycle',
    name: 'stepToFrame 非法参数',
    api: 'player.stepToFrame()',
    capabilities: ['playerStepToFrame'],
    versions: 'local',
    fixture: 'selected',
  }),
  defineCase({
    id: 'player.setconfig-dynamic',
    group: 'player-lifecycle',
    name: '播放中 setConfig',
    api: 'player.setConfig()',
    fixture: 'selected',
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'player.offscreen-toggle',
    group: 'player-lifecycle',
    name: 'OffscreenCanvas 运行时切换',
    api: 'player.setConfig({ isDisableOffscreenCanvas })',
    capabilities: ['playerDisableOffscreen'],
    versions: 'local',
    fixture: 'selected',
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'player.frame-cache',
    group: 'player-lifecycle',
    name: 'isCacheFrames 重复播放',
    api: 'player.start() × 2',
    fixture: 'selected',
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'player.progress',
    group: 'player-lifecycle',
    name: 'progress 与 onProcess 一致',
    api: 'player.progress / onProcess(progress)',
    capabilities: ['playerProgress', 'playerStepToFrame'],
    versions: 'local',
    fixture: 'selected',
  }),
  defineCase({
    id: 'player.destroy',
    group: 'player-lifecycle',
    name: 'destroy 释放并清空画布',
    api: 'player.destroy()',
    fixture: 'selected',
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'player.destroy-idempotent',
    group: 'player-lifecycle',
    name: '重复 destroy 与销毁状态',
    api: 'player.destroy() × 2 / player.state',
    capabilities: ['playerState'],
    versions: 'local',
    fixture: 'selected',
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'player.destroyed-ops',
    group: 'player-lifecycle',
    name: '销毁后操作拒绝',
    api: 'start / mount / pause / resume / stop / stepToFrame / setConfig',
    capabilities: ['playerState'],
    versions: 'local',
    fixture: 'selected',
    timeoutMs: 8_000,
  }),

  defineCase({
    id: 'db.find-missing',
    group: 'db',
    name: '缺失 key 返回 undefined',
    api: 'db.find(id)',
    capabilities: ['db'],
  }),
  defineCase({
    id: 'db.lazy-open',
    group: 'db',
    name: '首次读写才打开数据库',
    api: 'new DB() / db.find()',
    capabilities: ['db'],
    versions: 'local',
  }),
  defineCase({
    id: 'db.insert-find',
    group: 'db',
    name: 'insert → find 元数据往返',
    api: 'db.insert(id, video) / find(id)',
    capabilities: ['db'],
    fixture: 'selected',
  }),
  defineCase({
    id: 'db.image-bytes',
    group: 'db',
    name: '图片字节往返与稳定记录',
    api: 'db.insert(id, video) / find(id)',
    capabilities: ['db'],
    versions: 'local',
    fixture: 'selected',
  }),
  defineCase({
    id: 'db.keys',
    group: 'db',
    name: '字符串与数字 key',
    api: 'db.insert(id) / db.find(id)',
    capabilities: ['db'],
    fixture: 'selected',
  }),
  defineCase({
    id: 'db.delete',
    group: 'db',
    name: 'delete 后未命中',
    api: 'db.delete(id)',
    capabilities: ['db'],
    fixture: 'selected',
  }),
  defineCase({
    id: 'db.replace-elements',
    group: 'db',
    name: '替换与动态元素不持久化',
    api: 'db.insert(id, video)',
    capabilities: ['db'],
    versions: 'local',
    fixture: 'selected',
  }),
  defineCase({
    id: 'db.corrupt-cleanup',
    group: 'db',
    name: '损坏记录按未命中并清理',
    api: 'db.find(id)',
    capabilities: ['db'],
    versions: 'local',
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'db.unavailable',
    group: 'db',
    name: 'IndexedDB 不可用时拒绝',
    api: 'db.find(id)',
    capabilities: ['db'],
    versions: 'local',
    observationOnly: true,
  }),
  defineCase({
    id: 'db.blocked-upgrade',
    group: 'db',
    name: '升级被阻塞时拒绝',
    api: 'db.find(id)',
    capabilities: ['db'],
    versions: 'local',
    observationOnly: true,
    timeoutMs: 8_000,
  }),

  defineCase({
    id: 'timing.parser-construct',
    group: 'timing',
    name: 'Parser 构造与销毁耗时',
    api: 'new Parser() / destroy()',
    repeats: 3,
    timingMetrics: ['parserConstructMs'],
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'timing.parser-url',
    group: 'timing',
    name: 'Blob URL 解析耗时',
    api: 'parser.load(blob:)',
    fixture: 'selected',
    repeats: 3,
    timingMetrics: ['parserUrlMs'],
    timeoutMs: 10_000,
  }),
  defineCase({
    id: 'timing.parser-bytes',
    group: 'timing',
    name: '字节输入解析耗时',
    api: 'parser.load(Uint8Array)',
    capabilities: ['parserBytes'],
    versions: 'local',
    fixture: 'selected',
    repeats: 3,
    timingMetrics: ['parserBytesMs'],
    timeoutMs: 10_000,
  }),
  defineCase({
    id: 'timing.player-construct',
    group: 'timing',
    name: 'Player 构造与销毁耗时',
    api: 'new Player({ container })',
    repeats: 3,
    timingMetrics: ['playerConstructMs'],
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'timing.player-mount',
    group: 'timing',
    name: '图片解码与挂载耗时',
    api: 'player.mount(video)',
    fixture: 'selected',
    repeats: 3,
    timingMetrics: ['mountMs'],
    timeoutMs: 10_000,
  }),
  defineCase({
    id: 'timing.player-start',
    group: 'timing',
    name: 'start 到双 RAF 首帧',
    api: 'player.start()',
    fixture: 'selected',
    repeats: 3,
    timingMetrics: ['firstPaintMs'],
    timeoutMs: 10_000,
  }),
  defineCase({
    id: 'timing.player-controls',
    group: 'timing',
    name: 'pause + resume + stop 耗时',
    api: 'player.pause() / resume() / stop()',
    fixture: 'selected',
    repeats: 3,
    timingMetrics: ['controlsMs'],
    timeoutMs: 10_000,
  }),
  defineCase({
    id: 'timing.step-to-frame',
    group: 'timing',
    name: 'stepToFrame 耗时',
    api: 'player.stepToFrame(frame)',
    capabilities: ['playerStepToFrame'],
    versions: 'local',
    fixture: 'selected',
    repeats: 3,
    timingMetrics: ['stepToFrameMs'],
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'timing.setconfig',
    group: 'timing',
    name: 'setConfig 耗时',
    api: 'player.setConfig()',
    fixture: 'selected',
    repeats: 3,
    timingMetrics: ['setConfigMs'],
    timeoutMs: 8_000,
  }),
  defineCase({
    id: 'timing.db',
    group: 'timing',
    name: 'DB insert / find / delete 耗时',
    api: 'db.insert() / find() / delete()',
    capabilities: ['db'],
    versions: 'local',
    fixture: 'selected',
    repeats: 3,
    timingMetrics: ['dbInsertMs', 'dbFindMs', 'dbDeleteMs'],
    timeoutMs: 10_000,
  }),
  defineCase({
    id: 'timing.playback-sample',
    group: 'timing',
    name: '有界播放采样',
    api: 'player.onProcess / onEnd',
    fixture: 'selected',
    fixtureScoped: true,
    repeats: 3,
    timingMetrics: ['actualFps', 'skippedFrames', 'longTaskCount'],
    observationOnly: true,
    timeoutMs: 10_000,
  }),
]

const caseIndex = new Map(API_CASES.map((definition) => [definition.id, definition]))

export function caseById(id) {
  return caseIndex.get(id)
}

export function casesFor(groups) {
  if (groups === undefined || groups === null || groups.length === 0) return [...API_CASES]
  const allowed = new Set(groups)
  return API_CASES.filter((definition) => allowed.has(definition.group))
}

export function groupLabel(id) {
  return groupById.get(id)?.label || id
}

export function capabilityLabel(id) {
  return CAPABILITY_LABELS[id] || id
}

function versionParts(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version || ''))
  return match === null ? null : match.slice(1).map(Number)
}

function versionAtLeast(version, major, minor, patch = 0) {
  const parts = versionParts(version)
  if (parts === null) return false
  const [actualMajor, actualMinor, actualPatch] = parts
  if (actualMajor !== major) return actualMajor > major
  if (actualMinor !== minor) return actualMinor > minor
  return actualPatch >= patch
}

/**
 * Version-gated capabilities only. Environment probes (eval, Worker,
 * OffscreenCanvas, indexedDB) are merged on top by the page.
 */
export function capabilitiesForVersion(version) {
  const modern = versionAtLeast(version, 2, 2, 0)
  return {
    parserConfig: modern,
    parserBytes: modern,
    parserAbort: modern,
    parserProgress: modern,
    parserTimeout: modern,
    parserUrlObject: modern,
    parserDirect: true,
    playerState: modern,
    playerProgress: modern,
    playerIsPlaying: modern,
    playerStepToFrame: modern,
    playerFrozenConfig: modern,
    playerDisableOffscreen: modern,
    db: true,
  }
}

export function mergeCapabilities(base, probed) {
  const merged = { ...base }
  for (const [key, value] of Object.entries(probed || {})) {
    if (value !== undefined) merged[key] = value
  }
  return merged
}

export function resolveCaseSupport(definition, capabilities, side) {
  if (side === 'baseline' && definition.versions === 'local') {
    return { state: 'local-only', supported: false, reason: '仅 2.2.0' }
  }
  for (const capability of definition.capabilities) {
    if (capabilities?.[capability] !== true) {
      return { state: 'unsupported', supported: false, reason: capabilityLabel(capability) }
    }
  }
  return { state: 'supported', supported: true, reason: '' }
}

export function supportLabel(state) {
  if (state === 'local-only') return '仅 2.2.0'
  if (state === 'unsupported') return '基线不支持'
  return '双版本'
}

export function fixtureNameFor(definition, selectedFixture) {
  if (definition.fixture === 'selected') return selectedFixture?.name || null
  if (definition.fixture === 'v1') return 'show.svga'
  return null
}

export function buildExecutionPlan({ scope = 'selected', fixture, fixtures = [], groups } = {}) {
  const selected = casesFor(groups)
  if (scope !== 'all') {
    return selected.map((definition) => ({
      key: definition.id,
      caseId: definition.id,
      fixtureName: fixtureNameFor(definition, fixture),
    }))
  }

  const playable = fixtures.filter((entry) => entry.expectation === 'playable')
  const scoped = selected.filter((definition) => definition.fixtureScoped)
  const plan = []
  for (const entry of playable) {
    for (const definition of scoped) {
      plan.push({
        key: `${definition.id}@${entry.name}`,
        caseId: definition.id,
        fixtureName: entry.name,
      })
    }
  }
  return plan
}
