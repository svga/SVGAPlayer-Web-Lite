import { PLAYER_FILL_MODE, PLAYER_PLAY_MODE } from 'types'
import { Parser, Player, DB } from './index'

const canvas = document.getElementById('canvas') as HTMLCanvasElement

/**
 * 基本使用
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TESTCASE1 = async (): Promise<void> => {
  // const url = '/svga/angel.svga'
  const url = '/svga/11.svga'
  // const url = '/svga/TwitterHeart.svga'
  // const url = '/svga/loading-1.svga'
  // const url = '/svga/kaola.svga'
  const parser = new Parser()
  const svga = await parser.load(url)
  console.log(svga)
  if (canvas !== null) {
    const player = new Player({
      container: canvas,
      loop: 1
    })
    await player.mount(svga)
    player.start()
  }
}

/**
 * 事件、回调
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TESTCASE2 = async (): Promise<void> => {
  const url = '/svga/angel.svga'
  let parser = new Parser()
  let player = new Player(canvas)
  console.time('load')
  let svga = await parser.load(url)
  console.timeEnd('load')
  console.time('load')
  console.time('mount')
  await player.mount(svga)
  console.timeEnd('mount')
  player.onStart = () => console.log('onStart')
  player.onResume = () => console.log('onResume')
  player.onPause = () => console.log('onPause')
  player.onStop = () => console.log('onStop')
  player.onProcess = () => console.log('onProcess')
  player.onEnd = () => console.log('onEnd')
  ;(window as any).start = () => player.start()
  ;(window as any).pause = () => player.pause()
  ;(window as any).resume = () => player.resume()
  ;(window as any).stop = () => player.stop()
  ;(window as any).clear = () => player.clear()
  ;(window as any).destroy = () => {
    parser.destroy()
    player.destroy()
    ;(svga as any) = null
    ;(parser as any) = null
    ;(player as any) = null
  }
}

/**
 * 替换、动态元素
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TESTCASE3 = async (): Promise<void> => {
  const text = 'hello gg'
  const fontCanvas = document.createElement('canvas')
  fontCanvas.width = 200
  fontCanvas.height = 50
  const fontContext = fontCanvas.getContext('2d')
  if (fontContext === null) throw new Error('fontContext undefined')
  fontContext.font = '30px Arial'
  fontContext.textAlign = 'center'
  fontContext.textBaseline = 'middle'
  fontContext.fillStyle = 'red'
  fontContext.fillText(text, fontCanvas.width / 2, fontCanvas.height / 2)

  const image = new Image()
  image.src = 'https://ovo-oss.duowan.com/upload/1626079061448.png'

  const url = '/svga/kingset.svga'
  const parser = new Parser()
  const svga = await parser.load(url)

  svga.replaceElements['99'] = image
  svga.dynamicElements.banner = fontCanvas

  const player = new Player(canvas)
  await player.mount(svga)
  player.start()
}

/**
 * DB
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TESTCASE4 = async (): Promise<void> => {
  const url = '/svga/angel.svga'
  const db = new DB()
  let svga = await db.find(url)
  console.log('db', svga)
  if (svga === undefined) {
    const parser = new Parser({ isDisableImageBitmapShim: true })
    svga = await parser.load(url)
    await db.insert(url, svga)
  }
  const player = new Player(canvas)
  await player.mount(svga)
  player.start()
}

/**
 * 多项设置项
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TESTCASE5 = async (): Promise<void> => {
  const url = '/svga/angel.svga'
  const parser = new Parser()
  const svga = await parser.load(url)
  const player = new Player({
    container: canvas,
    loop: 0,
    isCacheFrames: true,
    isUseIntersectionObserver: true,
    playMode: PLAYER_PLAY_MODE.FALLBACKS,
    fillMode: PLAYER_FILL_MODE.BACKWARDS,
    startFrame: 10,
    endFrame: 40
  })
  await player.mount(svga)
  player.start()
}

/**
 * 往来顺序播放
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TESTCASE6 = async (): Promise<void> => {
  const url = '/svga/angel.svga'
  const parser = new Parser()
  const svga = await parser.load(url)
  console.log(svga)
  const player = new Player({
    container: canvas,
    loop: 1,
    playMode: PLAYER_PLAY_MODE.FORWARDS
  })
  await player.mount(svga)
  player.start()
  player.onEnd = () => {
    console.log('onEnd', player.currentFrame)
    const playMode = player.config.playMode === PLAYER_PLAY_MODE.FORWARDS ? PLAYER_PLAY_MODE.FALLBACKS : PLAYER_PLAY_MODE.FORWARDS
    player.setConfig({
      loop: 1,
      playMode
    })
    player.start()
  }
}

/**
 * 捕捉错误
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TESTCASE7 = async (): Promise<void> => {
  const url = '/svga/undefined.svga'
  try {
    const parser = new Parser()
    // const parser = new Parser({ isDisableWebWorker: true })
    const svga = await parser.load(url)
    const player = new Player(canvas)
    await player.mount(svga)
    player.start()
  } catch (error) {
    console.error('Catch >>>>', error)
  }
}

Promise.all([
  TESTCASE1()
  // TESTCASE2()
  // TESTCASE3()
  // TESTCASE4()
  // TESTCASE5()
  // TESTCASE6()
  // TESTCASE7()
]).catch(error => console.error(error))
