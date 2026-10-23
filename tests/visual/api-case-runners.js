const EXPECTED_VERSION_MESSAGE = 'only support version@2'

function videoCore(video) {
  const imageKeys = Object.keys(video.images).sort()
  return {
    version: video.version,
    width: video.size.width,
    height: video.size.height,
    fps: video.fps,
    frames: video.frames,
    imageKeys,
  }
}

function imageKind(value) {
  if (typeof value === 'string') return 'base64'
  if (value instanceof Uint8Array) return 'bytes'
  if (value && typeof value === 'object' && Number.isFinite(value.width)) return 'bitmap'
  return typeof value
}

function imageShape(video) {
  return Object.keys(video.images)
    .sort()
    .map((key) => [key, imageKind(video.images[key])])
}

async function rejectionOf(promise) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw Error('Expected the API call to reject')
}

async function settledWithin(promise, ms) {
  let timer = 0
  try {
    return await Promise.race([
      promise.then(
        (value) => ({ state: 'resolved', value }),
        (error) => ({ state: 'rejected', error }),
      ),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ state: 'timeout' }), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

function average(samples) {
  return samples.reduce((sum, value) => sum + value, 0) / samples.length
}

function bytesToBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))
  }
  return btoa(binary)
}

function drawMarker(canvas) {
  const context = canvas.getContext('2d')
  context.fillStyle = '#ff0000'
  context.fillRect(0, 0, 1, 1)
}

function markerAlpha(canvas) {
  return canvas.getContext('2d').getImageData(0, 0, 1, 1).data[3]
}

function waitForEnd(player, ms) {
  return new Promise((resolve) => {
    let timer = 0
    const finish = (ended) => {
      clearTimeout(timer)
      resolve(ended)
    }
    player.onEnd = () => finish(true)
    timer = setTimeout(() => finish(false), ms)
  })
}

async function openRawDatabase(name, version, storeName) {
  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName))
        request.result.createObjectStore(storeName)
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

async function rawGet(name, storeName, key) {
  const database = await openRawDatabase(name, 1, storeName)
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly')
      const request = transaction.objectStore(storeName).get(key)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

function deleteDatabase(name) {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name)
    const finish = () => resolve()
    request.onsuccess = finish
    request.onerror = finish
    request.onblocked = finish
  })
}

export const API_CASE_RUNNERS = {
  async 'boot.exports'({ SVGA, check, parity }) {
    check('global', '全局 SVGA 存在', SVGA !== undefined && typeof SVGA === 'object')
    const keys = Object.keys(SVGA || {}).sort()
    check(
      'keys',
      '导出键恰好为 DB、Parser、Player',
      JSON.stringify(keys) === JSON.stringify(['DB', 'Parser', 'Player']),
      keys.join(', '),
    )
    check('db', '导出 DB', typeof SVGA?.DB === 'function')
    check('parser', '导出 Parser', typeof SVGA?.Parser === 'function')
    check('player', '导出 Player', typeof SVGA?.Player === 'function')
    parity.exports = keys
    parity.types = {
      db: typeof SVGA?.DB,
      parser: typeof SVGA?.Parser,
      player: typeof SVGA?.Player,
    }
    parity.default = 'default' in (SVGA || {})
  },

  async 'boot.constructors'({ SVGA, check, parity }) {
    const parserMethods = ['load', 'destroy']
    const playerMethods = [
      'mount',
      'start',
      'resume',
      'pause',
      'stop',
      'clear',
      'setConfig',
      'destroy',
    ]
    const hasMethods = (value, names) =>
      typeof value === 'function' &&
      names.every((name) => typeof value.prototype[name] === 'function')
    check('parser', 'Parser 原型方法完整', hasMethods(SVGA.Parser, parserMethods))
    check('player', 'Player 原型方法完整', hasMethods(SVGA.Player, playerMethods))
    check('db', 'DB 原型方法完整', hasMethods(SVGA.DB, ['find', 'insert', 'delete']))
    parity.parserMethods = parserMethods.filter(
      (name) => typeof SVGA.Parser.prototype[name] === 'function',
    )
    parity.playerMethods = playerMethods.filter(
      (name) => typeof SVGA.Player.prototype[name] === 'function',
    )
  },

  async 'boot.smoke'({ check, parity, newPlayer, parseFixture, sleep }) {
    const video = await parseFixture()
    check('parsed', '解析得到 Video', video.frames > 0 && video.size.width > 0)
    const player = newPlayer({ loop: false })
    await player.mount(video)
    let started = false
    let processed = 0
    player.onStart = () => {
      started = true
    }
    player.onProcess = () => {
      processed++
    }
    player.start()
    await sleep(120)
    player.stop()
    check(
      'mounted',
      '挂载总帧数正确',
      player.totalFrames === video.frames - 1,
      String(player.totalFrames),
    )
    check('started', '触发 onStart', started)
    check('processed', '播放期间产生更新', processed > 0, String(processed))
    check('videoEntity', '挂载后 videoEntity 指向解析结果', player.videoEntity === video)
    parity.video = videoCore(video)
    parity.started = started
  },

  async 'parser.construct'({ SVGA, check, parity }) {
    const parser = new SVGA.Parser()
    check(
      'methods',
      'load / destroy 可用',
      typeof parser.load === 'function' && typeof parser.destroy === 'function',
    )
    parser.destroy()
    parity.ok = true
  },

  async 'parser.max-inflight-accept'({ SVGA, check, parity }) {
    for (const value of [1, 8]) {
      let parser
      try {
        parser = new SVGA.Parser({ maxInFlight: value })
        check(`accept-${value}`, `maxInFlight: ${value} 被接受`, true)
      } catch (error) {
        check(`accept-${value}`, `maxInFlight: ${value} 被接受`, false, String(error))
      } finally {
        try {
          parser?.destroy()
        } catch {}
      }
    }
    parity.accepted = [1, 8]
  },

  async 'parser.max-inflight-reject'({ SVGA, check, parity }) {
    for (const value of [0, 9, 1.5, '4']) {
      let rejected = false
      let code = null
      try {
        new SVGA.Parser({ maxInFlight: value }).destroy()
      } catch (error) {
        rejected = true
        code = error?.code || null
      }
      check(`reject-${String(value)}`, `maxInFlight: ${String(value)} 被拒绝`, rejected, code || '')
    }
    parity.rejected = [0, 9, 1.5, '4']
  },

  async 'parser.headers'({ check, parity, fixture, newParser }) {
    const url = `/api/lab/echo?fixture=${encodeURIComponent(fixture.name)}`
    const parser = newParser({
      headers: { 'x-lab-instance': 'instance', 'x-lab-override': 'base' },
    })
    const video = await parser.load(url, {
      headers: { 'x-lab-call': 'call', 'x-lab-override': 'call' },
    })
    check('merged', '实例与单次请求头同时到达', video.frames > 0)

    // The echo endpoint only returns bytes when all three headers match, so a
    // missing instance header or a per-call override that loses to the
    // instance value surfaces as a rejection.
    const missingCall = newParser({
      headers: { 'x-lab-instance': 'instance', 'x-lab-override': 'call' },
    })
    const missingCallError = await rejectionOf(missingCall.load(url))
    check('instance', '实例请求头随请求发送', missingCallError !== undefined)

    const overridden = newParser({
      headers: {
        'x-lab-instance': 'instance',
        'x-lab-call': 'call',
        'x-lab-override': 'base',
      },
    })
    const overrideError = await rejectionOf(overridden.load(url))
    check('overridden', '单次请求头覆盖实例值', overrideError !== undefined)
    parity.video = videoCore(video)
  },

  async 'parser.direct'({ check, parity, newParser, fixtureUrl, fixture }) {
    const parser = newParser({ isDisableWebWorker: true })
    const video = await parser.load(fixtureUrl(fixture.name))
    check('parsed', '直接模式解析成功', video.frames > 0)
    parity.video = videoCore(video)
  },

  async 'parser.url-string'({ check, parity, newParser, fixtureUrl, fixture }) {
    const video = await newParser().load(fixtureUrl(fixture.name))
    check('parsed', 'URL 字符串解析成功', video.frames > 0)
    parity.video = videoCore(video)
  },

  async 'parser.url-object'({ check, parity, newParser, fixtureUrl, fixture }) {
    const video = await newParser().load(new URL(fixtureUrl(fixture.name)))
    check('parsed', 'URL 对象解析成功', video.frames > 0)
    parity.video = videoCore(video)
  },

  async 'parser.data-url'({ check, parity, newParser, fixtureBytes, fixture }) {
    const bytes = await fixtureBytes(fixture.name)
    const url = `data:application/octet-stream;base64,${bytesToBase64(bytes)}`
    const video = await newParser().load(url)
    check('parsed', 'data: URL 解析成功', video.frames > 0)
    parity.video = videoCore(video)
  },

  async 'parser.blob-url'({ check, parity, newParser, fixtureBytes, fixture }) {
    const bytes = await fixtureBytes(fixture.name)
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }))
    try {
      const video = await newParser().load(url)
      check('parsed', 'blob: URL 解析成功', video.frames > 0)
      parity.video = videoCore(video)
    } finally {
      URL.revokeObjectURL(url)
    }
  },

  async 'parser.extensionless'({ check, parity, newParser }) {
    const video = await newParser().load('/fixtures/extensionless')
    check('parsed', '无后缀地址解析成功', video.frames > 0)
    parity.video = videoCore(video)
  },

  async 'parser.bytes-uint8'({ check, parity, newParser, fixtureBytes, fixture }) {
    const bytes = await fixtureBytes(fixture.name)
    const length = bytes.byteLength
    const first = bytes[0]
    const video = await newParser().load(bytes)
    check('parsed', 'Uint8Array 解析成功', video.frames > 0)
    check(
      'length',
      '调用方 buffer 未被 detach',
      bytes.byteLength === length,
      String(bytes.byteLength),
    )
    check('content', '调用方 buffer 内容未改变', bytes[0] === first)
    parity.video = videoCore(video)
  },

  async 'parser.bytes-arraybuffer'({ check, parity, newParser, fixtureBytes, fixture }) {
    const bytes = await fixtureBytes(fixture.name)
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    const length = buffer.byteLength
    const video = await newParser().load(buffer)
    check('parsed', 'ArrayBuffer 解析成功', video.frames > 0)
    check('length', '传入 buffer 未被 detach', buffer.byteLength === length)
    parity.video = videoCore(video)
  },

  async 'parser.progress'({ check, parity, newParser, fixtureUrl, fixtureBytes, fixture }) {
    const events = []
    const video = await newParser().load(fixtureUrl(fixture.name), {
      onProgress: (progress) => events.push(progress),
    })
    const bytes = await fixtureBytes(fixture.name)
    const stages = new Set(events.map((event) => event.stage))
    check('parsed', '解析成功', video.frames > 0)
    check('download', '收到 download 阶段', stages.has('download'))
    check('decode', '收到 decode 阶段', stages.has('decode'))
    let monotonic = true
    const last = new Map()
    for (const event of events) {
      const previous = last.get(event.stage)
      if (previous !== undefined && event.loaded < previous) monotonic = false
      last.set(event.stage, event.loaded)
    }
    check('monotonic', '各阶段 loaded 单调不减', monotonic)
    check(
      'final',
      '下载阶段最终字节数与文件一致',
      last.get('download') === bytes.byteLength,
      `${last.get('download')} / ${bytes.byteLength}`,
    )
    check('throttled', '事件数量有界', events.length <= bytes.byteLength + 4, String(events.length))
    parity.video = videoCore(video)
    parity.stages = [...stages].sort()
  },

  async 'parser.abort'({ check, parity, SVGA, fixtureUrl, fixture }) {
    const preParser = new SVGA.Parser()
    const preAborted = new AbortController()
    preAborted.abort()
    const preError = await rejectionOf(
      preParser.load(fixtureUrl(fixture.name), { signal: preAborted.signal }),
    )
    preParser.destroy()
    check('pre', '预先取消立即拒绝 AbortError', preError?.name === 'AbortError', String(preError))

    const inFlight = new AbortController()
    const parser = new SVGA.Parser()
    const url = `/api/lab/delay?ms=300&fixture=${encodeURIComponent(fixture.name)}`
    const pending = parser.load(url, { signal: inFlight.signal })
    setTimeout(() => inFlight.abort(), 40)
    const inFlightError = await rejectionOf(pending)
    check(
      'in-flight',
      '在途请求取消为 AbortError',
      inFlightError?.name === 'AbortError',
      String(inFlightError),
    )

    const queuedParser = new SVGA.Parser({ maxInFlight: 1 })
    const first = queuedParser.load(
      `/api/lab/delay?ms=300&fixture=${encodeURIComponent(fixture.name)}`,
    )
    const queued = new AbortController()
    const second = queuedParser.load(fixtureUrl(fixture.name), { signal: queued.signal })
    setTimeout(() => queued.abort(), 40)
    const queuedError = await rejectionOf(second)
    const firstVideo = await first
    check(
      'queued',
      '排队请求取消为 AbortError',
      queuedError?.name === 'AbortError',
      String(queuedError),
    )
    check('drain', '取消后仍继续处理队首请求', firstVideo.frames > 0)
    parser.destroy()
    queuedParser.destroy()
    parity.aborted = true
  },

  async 'parser.timeout'({ check, parity, newParser, fixtureUrl, fixture }) {
    const parser = newParser()
    const timeoutError = await rejectionOf(
      parser.load(`/api/lab/delay?ms=400&fixture=${encodeURIComponent(fixture.name)}`, {
        timeout: 80,
      }),
    )
    check(
      'timeout',
      '超时拒绝并标记 parser/timeout',
      timeoutError?.code === 'parser/timeout',
      String(timeoutError?.code),
    )
    check(
      'message',
      '超时错误信息明确',
      String(timeoutError?.message || '').includes('Request timeout'),
    )
    const video = await parser.load(fixtureUrl(fixture.name), { timeout: 0 })
    check('disabled', 'timeout: 0 禁用超时并可解析', video.frames > 0)
    parity.video = videoCore(video)
  },

  async 'parser.concurrent'({ check, parity, newParser, fixtureUrl, fixture }) {
    const parser = newParser({ maxInFlight: 2 })
    const order = []
    const slow = parser
      .load(`/api/lab/delay?ms=300&fixture=${encodeURIComponent(fixture.name)}`)
      .then((video) => {
        order.push('slow')
        return video
      })
    const fast = parser.load(fixtureUrl(fixture.name)).then((video) => {
      order.push('fast')
      return video
    })
    const [slowVideo, fastVideo] = await Promise.all([slow, fast])
    check('first', '较慢请求后发先至完成', order[0] === 'fast', order.join(','))
    check('both', '两个请求各自完成', slowVideo.frames > 0 && fastVideo.frames > 0)
    parity.video = videoCore(fastVideo)
    parity.order = order
  },

  async 'parser.http-error'({ check, parity, newParser }) {
    const error = await rejectionOf(newParser().load('/api/lab/status?code=404'))
    check('rejected', '非 2xx 响应拒绝', error !== undefined)
    check(
      'message',
      '错误信息包含状态',
      /404|Not Found/.test(String(error?.message || '')),
      String(error?.message),
    )
    parity.rejected = true
  },

  async 'parser.v1-rejected'({ check, parity, newParser }) {
    const error = await rejectionOf(newParser().load('/fixtures/show.svga'))
    check('rejected', 'SVGA 1.x 被拒绝', error !== undefined)
    check(
      'version',
      '错误信息说明只支持 version@2',
      String(error?.message || '').includes(EXPECTED_VERSION_MESSAGE),
      String(error?.message),
    )
    parity.rejected = true
  },

  async 'parser.invalid-protocol'({ check, parity, newParser }) {
    const error = await rejectionOf(newParser().load('ftp://example.com/file.svga'))
    check('rejected', '非法协议被拒绝', error !== undefined)
    check(
      'code',
      '错误码为 parser/protocol',
      error?.code === 'parser/protocol',
      String(error?.code),
    )
    parity.rejected = true
  },

  async 'parser.invalid-timeout'({ check, parity, newParser, fixtureUrl, fixture }) {
    const error = await rejectionOf(newParser().load(fixtureUrl(fixture.name), { timeout: -1 }))
    check('rejected', '负数 timeout 被拒绝', error !== undefined)
    check('code', '错误码为 parser/config', error?.code === 'parser/config', String(error?.code))
    parity.rejected = true
  },

  async 'parser.destroy-idempotent'({ SVGA, check, parity }) {
    const parser = new SVGA.Parser()
    parser.destroy()
    let repeatThrew = false
    try {
      parser.destroy()
    } catch {
      repeatThrew = true
    }
    check('idempotent', '重复 destroy 不抛错', !repeatThrew)
    parity.idempotent = !repeatThrew
  },

  async 'parser.load-after-destroy'({ SVGA, check, parity, fixtureUrl, fixture }) {
    const parser = new SVGA.Parser()
    parser.destroy()
    const error = await rejectionOf(parser.load(fixtureUrl(fixture.name)))
    check('rejected', 'destroy 后 load 拒绝', error !== undefined)
    check(
      'code',
      '错误码为 parser/destroyed',
      error?.code === 'parser/destroyed',
      String(error?.code),
    )
    parity.rejected = true
  },

  async 'player.construct-canvas'({ SVGA, check, parity, createCanvas }) {
    const canvas = createCanvas()
    const player = new SVGA.Player(canvas)
    check('container', 'config.container 指向传入 Canvas', player.config.container === canvas)
    check('frames', '初始帧数为 0', player.currentFrame === 0 && player.totalFrames === 0)
    player.destroy()
    parity.container = 'canvas'
  },

  async 'player.construct-options'({ SVGA, check, parity, createCanvas }) {
    const canvas = createCanvas()
    const player = new SVGA.Player({ container: canvas, loop: false })
    check('container', '配置对象 container 生效', player.config.container === canvas)
    check('loop', 'loop: false 写入配置', player.config.loop === false)
    player.destroy()
    parity.loop = false
  },

  async 'player.construct-empty'({ SVGA, check, parity }) {
    const player = new SVGA.Player({})
    check(
      'container',
      '空配置使用默认 Canvas',
      player.config.container instanceof HTMLCanvasElement,
    )
    player.destroy()
    parity.container = 'default'
  },

  async 'player.defaults'({ check, parity, createCanvas, SVGA }) {
    const player = new SVGA.Player({ container: createCanvas() })
    const fields = [
      'loop',
      'fillMode',
      'playMode',
      'startFrame',
      'endFrame',
      'loopStartFrame',
      'isCacheFrames',
      'isUseIntersectionObserver',
      'isOpenNoExecutionDelay',
    ]
    const snapshot = {}
    for (const field of fields) snapshot[field] = player.config[field]
    const expected = {
      loop: 0,
      fillMode: 'forwards',
      playMode: 'forwards',
      startFrame: 0,
      endFrame: 0,
      loopStartFrame: 0,
      isCacheFrames: false,
      isUseIntersectionObserver: false,
      isOpenNoExecutionDelay: false,
    }
    check(
      'defaults',
      '默认配置字段正确',
      JSON.stringify(snapshot) === JSON.stringify(expected),
      JSON.stringify(snapshot),
    )
    player.destroy()
    parity.defaults = snapshot
  },

  async 'player.config-frozen'({ SVGA, check, parity, createCanvas }) {
    const player = new SVGA.Player({ container: createCanvas() })
    const snapshot = player.config
    check('frozen', 'config 返回冻结对象', Object.isFrozen(snapshot))
    const before = snapshot.loop
    player.setConfig({ loop: 2 })
    check(
      'snapshot',
      '旧快照不会被 setConfig 修改',
      snapshot.loop === before,
      String(snapshot.loop),
    )
    check('copy', '每次读取返回独立快照', player.config !== snapshot)
    check('updated', '新快照包含更新值', player.config.loop === 2, String(player.config.loop))
    player.destroy()
    parity.frozen = true
  },

  async 'player.config-validation'({ SVGA, check, parity, createCanvas, parseFixture, newPlayer }) {
    const cases = [
      ['loop-negative', { loop: -1 }],
      ['loop-fraction', { loop: 1.5 }],
      ['loop-string', { loop: '1' }],
      ['fill-mode', { fillMode: 'both' }],
      ['play-mode', { playMode: 'backwards' }],
      ['cache-flag', { isCacheFrames: 1 }],
      ['observer-flag', { isUseIntersectionObserver: 'yes' }],
      ['delay-flag', { isOpenNoExecutionDelay: 1 }],
      ['offscreen-flag', { isDisableOffscreenCanvas: 'no' }],
      ['frame-negative', { startFrame: -1 }],
      ['frame-fraction', { endFrame: 1.5 }],
      ['start-after-end', { startFrame: 2, endFrame: 1 }],
      ['segment-overlap', { loop: true, endFrame: 2, loopStartFrame: 2 }],
    ]
    for (const [id, options] of cases) {
      let code = null
      try {
        new SVGA.Player({ container: createCanvas(), ...options }).destroy()
      } catch (error) {
        code = error?.code || null
      }
      check(id, `${id} 被拒绝为 player/config`, code === 'player/config', String(code))
    }

    let containerCode = null
    try {
      new SVGA.Player({ container: document.createElement('div') }).destroy()
    } catch (error) {
      containerCode = error?.code || null
    }
    check(
      'container',
      '非 Canvas 容器被拒绝',
      containerCode === 'player/config',
      String(containerCode),
    )

    const video = await parseFixture()
    const player = newPlayer({})
    await player.mount(video)
    let rangeCode = null
    try {
      player.setConfig({ endFrame: video.frames })
    } catch (error) {
      rangeCode = error?.code || null
    }
    check(
      'mounted-range',
      '挂载后超出总帧数的 endFrame 被拒绝',
      rangeCode === 'player/config',
      String(rangeCode),
    )
    parity.rejected = cases.length + 2
  },

  async 'player.initial-getters'({ SVGA, check, parity, createCanvas }) {
    const player = new SVGA.Player({ container: createCanvas() })
    check('state', '初始 state 为 idle', player.state === 'idle', String(player.state))
    check('isPlaying', '初始 isPlaying 为 false', player.isPlaying === false)
    check('progress', '未挂载 progress 为 0', player.progress === 0, String(player.progress))
    check('frames', '初始帧计数为 0', player.currentFrame === 0 && player.totalFrames === 0)
    player.destroy()
    parity.state = 'idle'
  },

  async 'player.no-delay'({ check, parity, parseFixture, newPlayer, sleep }) {
    const video = await parseFixture()
    const player = newPlayer({ loop: true, isOpenNoExecutionDelay: true })
    await player.mount(video)
    let processed = 0
    player.onProcess = () => {
      processed++
    }
    player.start()
    await sleep(120)
    player.stop()
    check('config', '计时 Worker 配置生效', player.config.isOpenNoExecutionDelay === true)
    check('processed', '计时 Worker 模式产生帧更新', video.frames <= 1 || processed > 0)
    parity.processed = processed > 0
  },

  async 'player.start-unmounted'({ SVGA, check, parity, createCanvas }) {
    const player = new SVGA.Player({ container: createCanvas() })
    let threw = false
    try {
      player.start()
    } catch {
      threw = true
    }
    check('rejected', '未挂载 start 抛错', threw)
    player.destroy()
    parity.rejected = threw
  },

  async 'player.mount-invalid'({ SVGA, check, parity, createCanvas }) {
    const player = new SVGA.Player({ container: createCanvas() })
    const error = await rejectionOf(player.mount({}))
    check('rejected', '非法 Video 挂载被拒绝', error !== undefined)
    player.destroy()
    parity.rejected = true
  },

  async 'player.mount'({ check, parity, parseFixture, newPlayer }) {
    const video = await parseFixture()
    const player = newPlayer({ loop: false })
    await player.mount(video)
    check(
      'frames',
      'totalFrames 为 frames - 1',
      player.totalFrames === video.frames - 1,
      String(player.totalFrames),
    )
    check('entity', 'videoEntity 指向挂载数据', player.videoEntity === video)
    check(
      'canvas',
      'Canvas 内部尺寸等于素材尺寸',
      player.config.container.width === video.size.width &&
        player.config.container.height === video.size.height,
    )
    parity.video = videoCore(video)
    parity.totalFrames = player.totalFrames
  },

  async 'player.remount'({ check, parity, parseFixture, newPlayer }) {
    const video = await parseFixture()
    const player = newPlayer({ loop: false })
    await player.mount(video)
    player.start()
    await new Promise((resolve) => setTimeout(resolve, 40))
    await player.mount(video)
    check('frames', '重复挂载后总帧数保持', player.totalFrames === video.frames - 1)
    check('current', '重复挂载后回到起始帧', player.currentFrame === 0, String(player.currentFrame))
    check('entity', '重复挂载后 videoEntity 有效', player.videoEntity === video)
    parity.video = videoCore(video)
  },

  async 'player.start'({ check, parity, parseFixture, newPlayer, sleep }) {
    const video = await parseFixture()
    const endFrame = Math.min(8, video.frames - 1)
    const player = newPlayer({ loop: false, endFrame })
    await player.mount(video)
    let started = false
    let updated = false
    player.onStart = () => {
      started = true
    }
    player.onProcess = () => {
      updated = true
    }
    player.start()
    await sleep(100)
    player.stop()
    check('mounted', '挂载成功', player.totalFrames === video.frames - 1)
    check('started', '触发 onStart', started)
    check('advanced', '播放推进或立即结束', updated || player.currentFrame !== 0 || endFrame === 0)
    parity.video = videoCore(video)
    parity.started = started
  },

  async 'player.pause-resume'({ check, parity, parseFixture, newPlayer, sleep }) {
    const video = await parseFixture()
    const player = newPlayer({ loop: true })
    await player.mount(video)
    let paused = false
    let resumed = false
    player.onPause = () => {
      paused = true
    }
    player.onResume = () => {
      resumed = true
    }
    player.start()
    await sleep(100)
    player.pause()
    const pausedFrame = player.currentFrame
    await sleep(80)
    const stable = player.currentFrame === pausedFrame
    player.resume()
    await sleep(60)
    player.stop()
    check('paused', '触发 onPause', paused)
    check('stable', '暂停期间当前帧不变', stable, `${pausedFrame} → ${player.currentFrame}`)
    check('resumed', '触发 onResume', resumed)
    parity.paused = paused
    parity.resumed = resumed
    parity.stable = stable
  },

  async 'player.stop'({ check, parity, parseFixture, newPlayer, sleep }) {
    const video = await parseFixture()
    const player = newPlayer({ loop: true })
    await player.mount(video)
    let stopped = false
    player.onStop = () => {
      stopped = true
    }
    player.start()
    await sleep(80)
    player.stop()
    check('stopped', '触发 onStop', stopped)
    check('frame', '停止后回到起始帧', player.currentFrame === 0, String(player.currentFrame))
    parity.stopped = stopped
    parity.frame = player.currentFrame
  },

  async 'player.clear'({ check, parity, newPlayer }) {
    const player = newPlayer({})
    drawMarker(player.config.container)
    const before = markerAlpha(player.config.container)
    player.clear()
    const after = markerAlpha(player.config.container)
    check('before', '测试标记已绘制', before > 0, String(before))
    check('cleared', 'clear 后画布透明', after === 0, String(after))
    parity.cleared = after === 0
  },

  async 'player.end-natural'({ check, parity, parseFixture, newPlayer }) {
    const video = await parseFixture()
    const endFrame = Math.min(2, video.frames - 1)
    // loop: 1 means one pass in both 2.1.x and 2.2.x. 2.1.1 treats
    // loop: false as 0 (infinite), which is covered by the local-only case.
    const player = newPlayer({ loop: 1, endFrame })
    await player.mount(video)
    const ended = waitForEnd(player, 3_000)
    player.start()
    const finished = await ended
    check('ended', '自然播放触发 onEnd', finished)
    check('frames', '总帧数与素材一致', player.totalFrames === video.frames - 1)
    parity.ended = finished
    parity.endFrame = endFrame
  },

  async 'player.loop-false'({ check, parity, parseFixture, newPlayer }) {
    const video = await parseFixture()
    const endFrame = Math.min(2, video.frames - 1)
    const player = newPlayer({ loop: false, endFrame })
    await player.mount(video)
    const ended = waitForEnd(player, 3_000)
    player.start()
    const finished = await ended
    check('ended', 'loop: false 只播放一次并触发 onEnd', finished)
    check('ready', '结束后回到 ready', player.state === 'ready', String(player.state))
    check('not-playing', '结束后 isPlaying 为 false', player.isPlaying === false)
    parity.ended = finished
    parity.loopFalse = true
  },

  async 'player.loop-count'({ check, parity, parseFixture, newPlayer }) {
    const video = await parseFixture()
    const endFrame = Math.min(1, video.frames - 1)
    const player = newPlayer({ loop: 2, endFrame })
    await player.mount(video)
    let count = 0
    let finish = () => {}
    const ended = new Promise((resolve) => {
      finish = resolve
    })
    const timer = setTimeout(() => finish(false), 4_000)
    player.onEnd = () => {
      count++
      player.pause()
      finish(true)
    }
    player.start()
    const finished = await ended
    clearTimeout(timer)
    await new Promise((resolve) => setTimeout(resolve, 60))
    check('ended', '两次循环后触发 onEnd', finished)
    check('once', 'onEnd 只触发一次', count === 1, String(count))
    parity.loop = 2
    parity.endCount = count
  },

  async 'player.events-order'({ check, parity, parseFixture, newPlayer, sleep }) {
    const video = await parseFixture()
    const player = newPlayer({ loop: true })
    await player.mount(video)
    const events = []
    player.onStart = () => events.push('start')
    player.onProcess = () => events.push('process')
    player.onPause = () => events.push('pause')
    player.onResume = () => events.push('resume')
    player.onStop = () => events.push('stop')
    player.onEnd = () => events.push('end')
    player.start()
    await sleep(80)
    player.pause()
    await sleep(30)
    player.resume()
    await sleep(50)
    player.stop()
    const first = (name) => events.indexOf(name)
    const ordered =
      first('start') >= 0 &&
      first('start') < first('pause') &&
      first('pause') < first('resume') &&
      first('resume') < first('stop')
    check('start', '记录 onStart', first('start') >= 0)
    check('process', '记录 onProcess', first('process') >= 0)
    check('order', '事件顺序为 start → pause → resume → stop', ordered, events.join(','))
    check('no-end', '手动停止不触发 onEnd', first('end') === -1)
    parity.events = ['start', 'process', 'pause', 'resume', 'stop'].filter(
      (name) => first(name) >= 0,
    )
  },

  async 'player.step-frames'({ check, parity, parseFixture, newPlayer }) {
    const video = await parseFixture()
    const player = newPlayer({ loop: false })
    await player.mount(video)
    const last = player.totalFrames
    const middle = Math.floor(last / 2)
    player.stepToFrame(0)
    check('zero', '定位到首帧', player.currentFrame === 0)
    player.stepToFrame(middle)
    check('middle', '定位到中间帧', player.currentFrame === middle, String(player.currentFrame))
    player.stepToFrame(last)
    check('last', '定位到末帧', player.currentFrame === last, String(player.currentFrame))
    check('paused', '定位后保持 paused', player.state === 'paused', String(player.state))
    parity.frames = [0, middle, last]
  },

  async 'player.step-and-play'({ check, parity, parseFixture, newPlayer }) {
    const video = await parseFixture()
    const player = newPlayer({ loop: true })
    await player.mount(video)
    const middle = Math.floor(player.totalFrames / 2)
    player.stepToFrame(middle, true)
    check('frame', '定位到目标帧', player.currentFrame >= middle, String(player.currentFrame))
    check('playing', 'andPlay 继续播放', player.isPlaying === true && player.state === 'playing')
    player.pause()
    parity.andPlay = true
  },

  async 'player.step-invalid'({ check, parity, parseFixture, newPlayer }) {
    const video = await parseFixture()
    const player = newPlayer({ loop: false })
    await player.mount(video)
    const invalid = [-1, player.totalFrames + 1, 1.5, '1']
    for (const value of invalid) {
      let code = null
      try {
        player.stepToFrame(value)
      } catch (error) {
        code = error?.code || null
      }
      check(
        `frame-${String(value)}`,
        `帧 ${String(value)} 被拒绝`,
        code === 'player/config',
        String(code),
      )
    }
    let andPlayCode = null
    try {
      player.stepToFrame(0, 'yes')
    } catch (error) {
      andPlayCode = error?.code || null
    }
    check('and-play', '非布尔 andPlay 被拒绝', andPlayCode === 'player/config', String(andPlayCode))
    parity.rejected = invalid.length + 1
  },

  async 'player.setconfig-dynamic'({ check, parity, parseFixture, newPlayer, sleep }) {
    const video = await parseFixture()
    const player = newPlayer({ loop: true })
    await player.mount(video)
    player.start()
    await sleep(50)
    player.setConfig({ loop: false })
    check('updated', '播放中 setConfig 更新 loop', player.config.loop === false)
    player.stop()
    parity.loop = false
  },

  async 'player.offscreen-toggle'({ check, parity, parseFixture, newPlayer, sleep }) {
    const video = await parseFixture()
    const player = newPlayer({ isDisableOffscreenCanvas: true, loop: true })
    const initial = player.config.isDisableOffscreenCanvas
    await player.mount(video)
    player.start()
    await sleep(60)
    player.pause()
    player.setConfig({ isDisableOffscreenCanvas: false })
    const updated = player.config.isDisableOffscreenCanvas
    player.stepToFrame(0)
    player.start()
    await sleep(50)
    player.stop()
    check('initial', '初始禁用 OffscreenCanvas', initial === true)
    check('updated', '运行中恢复 OffscreenCanvas', updated === false)
    check('redraw', '切换后仍可定位与播放', player.currentFrame === 0, String(player.currentFrame))
    parity.offscreen = { initial, updated }
  },

  async 'player.frame-cache'({ check, parity, parseFixture, newPlayer }) {
    const video = await parseFixture()
    const endFrame = Math.min(2, video.frames - 1)
    const player = newPlayer({ loop: 1, isCacheFrames: true, endFrame })
    await player.mount(video)
    const first = waitForEnd(player, 3_000)
    player.start()
    const firstEnded = await first
    const second = waitForEnd(player, 3_000)
    player.start()
    const secondEnded = await second
    check('first', '首次播放结束', firstEnded)
    check('second', '缓存帧重复播放结束', secondEnded)
    parity.ended = firstEnded && secondEnded
  },

  async 'player.progress'({ check, parity, parseFixture, newPlayer }) {
    const video = await parseFixture()
    const player = newPlayer({ loop: false })
    await player.mount(video)
    const expectedFirst = 1 / (player.totalFrames + 1)
    check(
      'initial',
      '挂载后 progress 为 1/(totalFrames+1)',
      Math.abs(player.progress - expectedFirst) < 1e-9,
      String(player.progress),
    )
    const seen = []
    player.onProcess = (value) => seen.push(value)
    const middle = Math.floor(player.totalFrames / 2)
    for (const frame of [0, middle, player.totalFrames]) {
      player.stepToFrame(frame)
      check(
        `frame-${frame}`,
        `第 ${frame} 帧 progress 与回调一致`,
        seen[seen.length - 1] === player.progress,
        `${seen[seen.length - 1]} / ${player.progress}`,
      )
    }
    check('last', '末帧 progress 为 1', player.progress === 1, String(player.progress))
    parity.progress = seen
  },

  async 'player.destroy'({ check, parity, parseFixture, newPlayer, sleep }) {
    const video = await parseFixture()
    const player = newPlayer({ loop: true })
    await player.mount(video)
    player.start()
    await sleep(50)
    drawMarker(player.config.container)
    player.destroy()
    check('entity', '销毁后 videoEntity 清空', player.videoEntity == null)
    check('canvas', '销毁后画布清空', markerAlpha(player.config.container) === 0)
    parity.entity = player.videoEntity == null
  },

  async 'player.destroy-idempotent'({ check, parity, parseFixture, newPlayer }) {
    const video = await parseFixture()
    const player = newPlayer({ loop: true })
    await player.mount(video)
    player.destroy()
    let threw = false
    try {
      player.destroy()
    } catch {
      threw = true
    }
    check('repeat', '重复 destroy 不抛错', !threw)
    check('state', '销毁后 state 为 destroyed', player.state === 'destroyed', String(player.state))
    check('frames', '销毁后帧计数归零', player.currentFrame === 0 && player.totalFrames === 0)
    parity.state = player.state
  },

  async 'player.destroyed-ops'({ check, parity, parseFixture, newPlayer }) {
    const video = await parseFixture()
    const player = newPlayer({ loop: true })
    await player.mount(video)
    player.destroy()
    const operations = [
      ['start', () => player.start()],
      ['pause', () => player.pause()],
      ['resume', () => player.resume()],
      ['stop', () => player.stop()],
      ['step', () => player.stepToFrame(0)],
      ['setconfig', () => player.setConfig({ loop: 2 })],
    ]
    for (const [id, operation] of operations) {
      let code = null
      try {
        operation()
      } catch (error) {
        code = error?.code || null
      }
      check(id, `${id} 被拒绝为 player/destroyed`, code === 'player/destroyed', String(code))
    }
    const mountError = await rejectionOf(player.mount(video))
    check(
      'mount',
      'mount 拒绝为 player/destroyed',
      mountError?.code === 'player/destroyed',
      String(mountError?.code),
    )
    parity.rejected = true
  },

  async 'db.find-missing'({ SVGA, check, parity, uniqueName }) {
    const name = uniqueName('svga-api-lab-missing')
    const db = new SVGA.DB({ name, version: 1, storeName: 'files' })
    const found = await db.find('missing')
    check('undefined', '缺失 key 返回 undefined', found === undefined)
    await deleteDatabase(name)
    parity.found = found === undefined
  },

  async 'db.lazy-open'({ SVGA, check, parity, uniqueName }) {
    if (typeof indexedDB.databases !== 'function') {
      check('supported', '当前浏览器不提供 indexedDB.databases()', true, '跳过')
      parity.supported = false
      return
    }
    const name = uniqueName('svga-api-lab-lazy')
    const before = await indexedDB.databases()
    const createdBefore = before.some((database) => database.name === name)
    const db = new SVGA.DB({ name, version: 1, storeName: 'files' })
    const afterConstruct = await indexedDB.databases()
    const createdOnConstruct = afterConstruct.some((database) => database.name === name)
    await db.find('missing')
    const afterFirstUse = await indexedDB.databases()
    const createdOnUse = afterFirstUse.some((database) => database.name === name)
    check('before', '构造前数据库不存在', !createdBefore)
    check('lazy', '构造不会打开数据库', !createdOnConstruct)
    check('opened', '首次读取后数据库存在', createdOnUse)
    await deleteDatabase(name)
    parity.supported = true
  },

  async 'db.insert-find'({ SVGA, check, parity, parseFixture, uniqueName }) {
    const video = await parseFixture()
    const name = uniqueName('svga-api-lab-roundtrip')
    const db = new SVGA.DB({ name, version: 1, storeName: 'files' })
    await db.insert('video', video)
    const found = await db.find('video')
    check('found', 'insert 后可 find', found !== undefined)
    check('version', 'version 往返一致', found?.version === video.version)
    check(
      'size',
      'size 往返一致',
      found?.size?.width === video.size.width && found?.size?.height === video.size.height,
    )
    check('fps', 'fps 往返一致', found?.fps === video.fps)
    check('frames', 'frames 往返一致', found?.frames === video.frames)
    check(
      'images',
      '图片 key 集合往返一致',
      JSON.stringify(Object.keys(found?.images || {}).sort()) ===
        JSON.stringify(Object.keys(video.images).sort()),
    )
    parity.video = found === undefined ? null : videoCore(found)
    await deleteDatabase(name)
  },

  async 'db.image-bytes'({ SVGA, check, parity, parseFixture, uniqueName }) {
    const video = await parseFixture()
    const name = uniqueName('svga-api-lab-images')
    const db = new SVGA.DB({ name, version: 1, storeName: 'files' })
    await db.insert('video', video)
    const found = await db.find('video')
    const keys = Object.keys(video.images).sort()
    check('found', '记录可读取', found !== undefined)
    check(
      'bytes',
      '图片值为 Uint8Array',
      keys.every((key) => found?.images?.[key] instanceof Uint8Array),
    )
    check(
      'length',
      '图片字节长度一致',
      keys.every((key) => found?.images?.[key]?.byteLength === video.images[key].byteLength),
    )
    parity.images = found === undefined ? [] : imageShape(found)
    await deleteDatabase(name)
  },

  async 'db.keys'({ SVGA, check, parity, parseFixture, uniqueName }) {
    const video = await parseFixture()
    const name = uniqueName('svga-api-lab-keys')
    const db = new SVGA.DB({ name, version: 1, storeName: 'files' })
    await db.insert(42, video)
    await db.insert('alpha', video)
    const numeric = await db.find(42)
    const text = await db.find('alpha')
    check('numeric', '数字 key 可往返', numeric !== undefined)
    check('string', '字符串 key 可往返', text !== undefined)
    parity.keys = ['number', 'string']
    await deleteDatabase(name)
  },

  async 'db.delete'({ SVGA, check, parity, parseFixture, uniqueName }) {
    const video = await parseFixture()
    const name = uniqueName('svga-api-lab-delete')
    const db = new SVGA.DB({ name, version: 1, storeName: 'files' })
    await db.insert('video', video)
    await db.delete('video')
    const found = await db.find('video')
    check('deleted', 'delete 后 find 为 undefined', found === undefined)
    parity.deleted = found === undefined
    await deleteDatabase(name)
  },

  async 'db.replace-elements'({ SVGA, check, parity, parseFixture, uniqueName }) {
    const video = await parseFixture()
    const canvas = document.createElement('canvas')
    video.replaceElements.replaced = canvas
    video.dynamicElements.dynamic = canvas
    const name = uniqueName('svga-api-lab-elements')
    const db = new SVGA.DB({ name, version: 1, storeName: 'files' })
    await db.insert('video', video)
    const found = await db.find('video')
    check(
      'replace',
      'replaceElements 不持久化',
      Object.keys(found?.replaceElements || {}).length === 0,
    )
    check(
      'dynamic',
      'dynamicElements 不持久化',
      Object.keys(found?.dynamicElements || {}).length === 0,
    )
    parity.elements = {
      replace: Object.keys(found?.replaceElements || {}).length,
      dynamic: Object.keys(found?.dynamicElements || {}).length,
    }
    await deleteDatabase(name)
  },

  async 'db.corrupt-cleanup'({ SVGA, check, parity, uniqueName }) {
    const name = uniqueName('svga-api-lab-corrupt')
    const raw = await openRawDatabase(name, 1, 'files')
    await new Promise((resolve, reject) => {
      const transaction = raw.transaction('files', 'readwrite')
      transaction.objectStore('files').put('not a video', 'bad')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    raw.close()
    const db = new SVGA.DB({ name, version: 1, storeName: 'files' })
    const found = await db.find('bad')
    check('miss', '损坏记录按未命中处理', found === undefined)
    const stored = await rawGet(name, 'files', 'bad')
    check('removed', '损坏记录被同一事务清理', stored === undefined)
    parity.cleaned = stored === undefined
    await deleteDatabase(name)
  },

  async 'db.unavailable'({ SVGA, check, parity, uniqueName, skip }) {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'indexedDB')
    const hadOwn = descriptor !== undefined
    let overridden = false
    try {
      Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined })
      overridden = window.indexedDB === undefined
    } catch {}
    if (!overridden) {
      skip('当前浏览器不允许临时移除 indexedDB')
      return
    }
    try {
      const db = new SVGA.DB({
        name: uniqueName('svga-api-lab-unavailable'),
        version: 1,
        storeName: 'files',
      })
      const error = await rejectionOf(db.find('missing'))
      check('rejected', 'IndexedDB 不可用时 find 拒绝', error !== undefined)
      check('code', '错误码为 db/failure', error?.code === 'db/failure', String(error?.code))
      parity.rejected = true
    } finally {
      if (hadOwn) Object.defineProperty(window, 'indexedDB', descriptor)
      else delete window.indexedDB
    }
  },

  async 'db.blocked-upgrade'({ SVGA, check, parity, uniqueName, skip }) {
    if (typeof indexedDB === 'undefined') {
      skip('当前浏览器不提供 IndexedDB')
      return
    }
    const name = uniqueName('svga-api-lab-blocked')
    const blocker = await openRawDatabase(name, 1, 'files')
    try {
      const db = new SVGA.DB({ name, version: 2, storeName: 'files-v2' })
      const outcome = await settledWithin(db.find('missing'), 4_000)
      check('rejected', '升级被阻塞时拒绝而非挂起', outcome.state === 'rejected', outcome.state)
      check(
        'code',
        '错误码为 db/failure',
        outcome.state === 'rejected' && outcome.error?.code === 'db/failure',
        String(outcome.state === 'rejected' ? outcome.error?.code : outcome.state),
      )
      parity.rejected = outcome.state === 'rejected'
    } finally {
      blocker.close()
      await deleteDatabase(name)
    }
  },

  async 'timing.parser-construct'({ SVGA, check, timing }) {
    const samples = []
    for (let index = 0; index < 3; index++) {
      const started = performance.now()
      const parser = new SVGA.Parser()
      parser.destroy()
      samples.push(performance.now() - started)
    }
    check('constructed', 'Parser 构造与销毁成功', samples.every(Number.isFinite))
    timing('parserConstructMs', average(samples))
  },

  async 'timing.parser-url'({ check, timing, newParser, fixtureBytes, fixture }) {
    const bytes = await fixtureBytes(fixture.name)
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }))
    try {
      const parser = newParser()
      const started = performance.now()
      const video = await parser.load(url)
      timing('parserUrlMs', performance.now() - started)
      check('parsed', 'Blob URL 解析成功', video.frames > 0)
    } finally {
      URL.revokeObjectURL(url)
    }
  },

  async 'timing.parser-bytes'({ check, timing, newParser, fixtureBytes, fixture }) {
    const bytes = await fixtureBytes(fixture.name)
    const parser = newParser()
    const started = performance.now()
    const video = await parser.load(bytes)
    timing('parserBytesMs', performance.now() - started)
    check('parsed', '字节输入解析成功', video.frames > 0)
  },

  async 'timing.player-construct'({ SVGA, check, timing, createCanvas }) {
    const canvas = createCanvas()
    const samples = []
    for (let index = 0; index < 3; index++) {
      const started = performance.now()
      const player = new SVGA.Player({ container: canvas })
      player.destroy()
      samples.push(performance.now() - started)
    }
    check('constructed', 'Player 构造与销毁成功', samples.every(Number.isFinite))
    timing('playerConstructMs', average(samples))
  },

  async 'timing.player-mount'({ check, timing, parseFixture, newPlayer }) {
    const video = await parseFixture()
    const player = newPlayer({ loop: false })
    const started = performance.now()
    await player.mount(video)
    timing('mountMs', performance.now() - started)
    check('mounted', '挂载成功', player.totalFrames === video.frames - 1)
  },

  async 'timing.player-start'({ check, timing, parseFixture, newPlayer, nextPaint }) {
    const video = await parseFixture()
    const player = newPlayer({ loop: true })
    await player.mount(video)
    const started = performance.now()
    player.start()
    await nextPaint()
    timing('firstPaintMs', performance.now() - started)
    player.stop()
    check('started', '启动并绘制', video.frames > 0)
  },

  async 'timing.player-controls'({ check, timing, parseFixture, newPlayer, sleep }) {
    const video = await parseFixture()
    const player = newPlayer({ loop: true })
    await player.mount(video)
    player.start()
    await sleep(60)
    const started = performance.now()
    player.pause()
    player.resume()
    player.stop()
    timing('controlsMs', performance.now() - started)
    check('controlled', '暂停、继续、停止成功', video.frames > 0)
  },

  async 'timing.step-to-frame'({ check, timing, parseFixture, newPlayer }) {
    const video = await parseFixture()
    const player = newPlayer({ loop: false })
    await player.mount(video)
    const middle = Math.floor(player.totalFrames / 2)
    const started = performance.now()
    player.stepToFrame(middle)
    timing('stepToFrameMs', performance.now() - started)
    check('located', '定位成功', player.currentFrame === middle)
  },

  async 'timing.setconfig'({ check, timing, parseFixture, newPlayer }) {
    const video = await parseFixture()
    const player = newPlayer({ loop: true })
    await player.mount(video)
    const started = performance.now()
    player.setConfig({ loop: false })
    timing('setConfigMs', performance.now() - started)
    check('updated', '配置更新成功', player.config.loop === false)
  },

  async 'timing.db'({ SVGA, check, timing, parseFixture, uniqueName }) {
    const video = await parseFixture()
    const name = uniqueName('svga-api-lab-timing')
    const db = new SVGA.DB({ name, version: 1, storeName: 'files' })
    let started = performance.now()
    await db.insert('video', video)
    timing('dbInsertMs', performance.now() - started)
    started = performance.now()
    const found = await db.find('video')
    timing('dbFindMs', performance.now() - started)
    started = performance.now()
    await db.delete('video')
    timing('dbDeleteMs', performance.now() - started)
    check('roundtrip', 'insert/find/delete 成功', found !== undefined)
    await deleteDatabase(name)
  },

  async 'timing.playback-sample'({
    check,
    parity,
    timing,
    options,
    parseFixture,
    newPlayer,
    sleep,
  }) {
    const video = await parseFixture()
    const player = newPlayer({ loop: false })
    await player.mount(video)
    const targetFps = video.fps
    const sampleMs = Number.isFinite(options.sampleMs) ? options.sampleMs : 1_200
    let updates = 0
    let advanced = 0
    let skipped = 0
    let lastFrame = player.currentFrame
    let longTaskCount = 0
    const supported =
      typeof PerformanceObserver !== 'undefined' &&
      PerformanceObserver.supportedEntryTypes?.includes('longtask')
    const observer = supported
      ? new PerformanceObserver((list) => {
          for (const _entry of list.getEntries()) longTaskCount++
        })
      : null
    observer?.observe({ type: 'longtask' })
    const finishPromise = new Promise((resolve) => {
      player.onEnd = () => resolve()
    })
    player.onProcess = () => {
      const frame = player.currentFrame
      const delta = Math.abs(frame - lastFrame)
      if (delta > 0) {
        updates++
        advanced += delta
        skipped += Math.max(0, delta - 1)
      }
      lastFrame = frame
    }
    const started = performance.now()
    player.start()
    await Promise.race([finishPromise, sleep(sampleMs)])
    const elapsed = Math.max(0, performance.now() - started)
    player.pause()
    observer?.disconnect()
    check('updated', '播放期间产生帧更新', video.frames <= 1 || updates > 0, String(updates))
    parity.targetFps = targetFps
    parity.updated = updates > 0
    timing('actualFps', elapsed > 0 ? (advanced / elapsed) * 1_000 : 0)
    timing('skippedFrames', skipped)
    timing('longTaskCount', longTaskCount)
  },
}
