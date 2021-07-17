import { Parser, Player, DB } from './index'

const TESTCASE1 = async (): Promise<void> => {
  const url = '/svga/angel.svga'
  // const url = '/svga/TwitterHeart.svga'
  // const url = '/svga/loading-1.svga'
  // const url = '/svga/kaola.svga'
  const parser = new Parser()
  const svga = await parser.load(url)
  console.log(svga)
  const canvas = document.getElementById('canvas') as HTMLCanvasElement
  const player = new Player({
    container: canvas,
    loop: 0,
    isCacheFrames: true,
    isUseIntersectionObserver: true
  })
  await player.mount(svga)
  player.start()
}

const TESTCASE2 = async (): Promise<void> => {
  const url = '/svga/angel.svga'
  const parser = new Parser()
  const canvas = document.getElementById('canvas') as HTMLCanvasElement
  const player = new Player(canvas)
  console.time('load')
  const svga = await parser.load(url)
  console.timeEnd('load')
  console.time('load')
  console.time('mount')
  await player.mount(svga)
  console.timeEnd('mount')
  ;(window as any).start = () => player.start()
  ;(window as any).pause = () => player.pause()
  ;(window as any).resume = () => player.resume()
  ;(window as any).stop = () => player.stop()
  ;(window as any).clear = () => player.clear()
  player.onStart = () => console.log('onStart')
  player.onResume = () => console.log('onResume')
  player.onPause = () => console.log('onPause')
  player.onStop = () => console.log('onStop')
  player.onProcess = () => console.log('onProcess')
  player.onEnd = () => console.log('onEnd')
}

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

  const canvas = document.getElementById('canvas') as HTMLCanvasElement
  const player = new Player(canvas)
  await player.mount(svga)
  player.start()
}

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
  const canvas = document.getElementById('canvas') as HTMLCanvasElement
  const player = new Player(canvas)
  await player.mount(svga)
  player.start()
}

Promise.all([
  TESTCASE1()
  // TESTCASE2()
  // TESTCASE3()
  // TESTCASE4()
]).catch(error => console.error(error))
