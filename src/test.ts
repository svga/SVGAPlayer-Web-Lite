import { PLAYER_FILL_MODE, PLAYER_PLAY_MODE } from 'types'
import { DB, SVGAPlayer } from './index'

const canvas = document.getElementById('canvas') as HTMLCanvasElement

/**
 * 基本使用
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TESTCASE1 = async (): Promise<void> => {
  const url = '/svga/shape-path-undefined.svga'
  // const url = '/svga/11.svga'
  // const url = '/svga/TwitterHeart.svga'
  // const url = '/svga/loading-1.svga'
  // const url = '/svga/kaola.svga'
  const player = new SVGAPlayer({
    container: canvas,
    loop: 1
  })
  const svga = await player.parse(url)
  console.log(svga)
  await player.compile()
  player.play()
}

/**
 * 事件、回调
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TESTCASE2 = async (): Promise<void> => {
  const url = '/svga/angel.svga'
  let player = new SVGAPlayer(canvas)
  console.time('load')
  await player.parse(url)
  console.timeEnd('load')
  console.time('compile')
  await player.compile()
  console.timeEnd('compile')
  player.on('start', () => console.log('onStart'))
  player.on('resume', () => console.log('onResume'))
  player.on('pause', () => console.log('onPause'))
  player.on('stop', () => console.log('onStop'))
  player.on('process', () => console.log('onProcess'))
  player.on('end', () => console.log('onEnd'))
  player.on('error', error => console.error(error))
  ;(window as any).start = () => player.play()
  ;(window as any).pause = () => player.pause()
  ;(window as any).resume = () => player.resume()
  ;(window as any).stop = () => player.stop()
  ;(window as any).clear = () => player.clear()
  ;(window as any).destroy = () => {
    player.destroy()
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
  const player = new SVGAPlayer(canvas)
  const svga = await player.parse(url)

  svga.replaceElements['99'] = image
  svga.dynamicElements.banner = fontCanvas

  await player.compile()
  player.play()
}

/**
 * DB
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TESTCASE4 = async (): Promise<void> => {
  const url = '/svga/angel.svga'
  const db = new DB()
  const player = new SVGAPlayer({
    container: canvas,
    parserOptions: {
      isDisableImageBitmapShim: true
    }
  })
  let svga = await db.find(url)
  console.log('db', svga)
  if (svga === undefined) {
    svga = await player.parse(url)
    await db.insert(url, svga)
  } else {
    await player.parse(svga)
  }
  await player.compile()
  player.play()
}

/**
 * 多项设置项
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TESTCASE5 = async (): Promise<void> => {
  const url = '/svga/angel.svga'
  const player = new SVGAPlayer({
    container: canvas,
    loop: 0,
    isCacheFrames: true,
    isUseIntersectionObserver: true,
    playMode: PLAYER_PLAY_MODE.FALLBACKS,
    fillMode: PLAYER_FILL_MODE.BACKWARDS,
    startFrame: 10,
    endFrame: 40
  })
  await player.parse(url)
  await player.compile()
  player.play()
}

/**
 * 往来顺序播放
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TESTCASE6 = async (): Promise<void> => {
  const url = '/svga/angel.svga'
  const player = new SVGAPlayer({
    container: canvas,
    loop: 1,
    playMode: PLAYER_PLAY_MODE.FORWARDS
  })
  const svga = await player.parse(url)
  console.log(svga)
  await player.compile()
  player.play()
  player.on('end', () => {
    console.log('onEnd', player.currentFrame)
    const playMode = player.config.playMode === PLAYER_PLAY_MODE.FORWARDS ? PLAYER_PLAY_MODE.FALLBACKS : PLAYER_PLAY_MODE.FORWARDS
    player.setConfig({
      loop: 1,
      playMode
    })
    player.play()
  })
}

/**
 * 捕捉错误
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TESTCASE7 = async (): Promise<void> => {
  const url = '/svga/undefined.svga'
  try {
    const player = new SVGAPlayer(canvas)
    await player.parse(url)
    await player.compile()
    player.play()
  } catch (error) {
    console.error('Catch >>>>', error)
  }
}

/**
 * 重设配置
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TESTCASE8 = async (): Promise<void> => {
  const url = '/svga/angel.svga'
  const player = new SVGAPlayer(canvas)
  await player.parse(url)
  await player.compile()
  player.setConfig({
    loop: 1,
    startFrame: 0,
    endFrame: 1
  })
  player.play()

  setTimeout(() => {
    console.log('start')
    player.setConfig({
      loop: 0,
      startFrame: 0,
      endFrame: 0
    })
    player.play()
  }, 5000)
}

Promise.all([
  TESTCASE1()
  // TESTCASE2()
  // TESTCASE3()
  // TESTCASE4()
  // TESTCASE5()
  // TESTCASE6()
  // TESTCASE7()
  // TESTCASE8()
]).catch(error => console.error(error))
