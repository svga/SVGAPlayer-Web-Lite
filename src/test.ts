import { PLAYER_FILL_MODE, PLAYER_PLAY_MODE } from 'types'
import { Parser, Player, DB } from './index'

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

/**
 * 重设配置
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TESTCASE8 = async (): Promise<void> => {
  const url = '/svga/angel.svga'
  const parser = new Parser()
  const svga = await parser.load(url)
  const player = new Player(canvas)
  await player.mount(svga)
  player.setConfig({
    loop: 1,
    startFrame: 0,
    endFrame: 1
  })
  player.start()

  setTimeout(() => {
    console.log('start')
    player.setConfig({
      loop: 0,
      startFrame: 0,
      endFrame: 0
    })
    player.start()
  }, 5000)
}

// --- Mocks and Spies for Long Animation Frame Tests ---
let originalPerformanceObserver: any
let originalConsoleWarn: any

// Define Mock Types for LoAF
type MockLoafPerformanceEntry = {
  name: string;
  entryType: string;
  startTime: number;
  duration: number;
  renderingTime?: number;
  scripts?: Array<any>;
  // Potential other fields from PerformanceLongAnimationFrameTiming if needed by tests
  toJSON?: () => any; // PerformanceEntry has a toJSON method
};
type MockLoafEntries = { getEntries: () => Array<MockLoafPerformanceEntry> };

// Minimal interface for the observer argument in the callback
interface IMockPerformanceObserver {
  disconnect: () => void;
  observe: (options?: any) => void;
  takeRecords: () => MockLoafPerformanceEntry[];
}
type MockPerformanceObserverCallback = (entries: MockLoafEntries, observer: IMockPerformanceObserver) => void;

// This global variable will hold the *instance* of MockPerformanceObserver
let mockPerformanceObserverInstance: MockPerformanceObserver | null;

// This global flag tracks if the constructor of MockPerformanceObserver was called
let performanceObserverConstructed: boolean;
let consoleWarnCalledWith: any[] | null;

// Helper to reset spies
function resetSpies() {
  performanceObserverConstructed = false;
  mockPerformanceObserverInstance = null; // Reset the instance
  consoleWarnCalledWith = null;
}

// Mock PerformanceObserver
class MockPerformanceObserver implements IMockPerformanceObserver {
  observeCalled: boolean = false;
  disconnectCalled: boolean = false;
  observedOptions: any = null;
  callback: MockPerformanceObserverCallback;

  constructor(callback: MockPerformanceObserverCallback) {
    performanceObserverConstructed = true; // Global spy for constructor call
    this.callback = callback;
    // DO NOT set the global mockPerformanceObserverInstance here directly to `this`.
    // Instead, the player will replace window.PerformanceObserver with this class,
    // and when `new window.PerformanceObserver()` is called, this constructor runs.
    // The instance created by `new` will be what `player.longAnimationFrameObserver` holds.
    // We need to assign `this` to the global `mockPerformanceObserverInstance`
    // so our tests can access its state (observeCalled, etc.).
    mockPerformanceObserverInstance = this; // Assign the created instance to the global spy
    console.log('[MockPerformanceObserver] constructed');
  }

  observe(options?: any): void {
    this.observeCalled = true;
    this.observedOptions = options;
    // console.log('[MockPerformanceObserver] observe called with:', options); // Keep for debugging if needed
  }

  disconnect(): void {
    this.disconnectCalled = true;
    // console.log('[MockPerformanceObserver] disconnect called'); // Keep for debugging if needed
  }

  takeRecords(): MockLoafPerformanceEntry[] {
    return [];
  }

  static supportedEntryTypes = ['long-animation-frame']; // Default to supported
}


async function TESTCASE_LONG_ANIM_FRAMES_DISABLED(): Promise<void> {
  console.log('%cTESTCASE_LONG_ANIM_FRAMES_DISABLED: Start', 'color: blue; font-weight: bold;');
  resetSpies();

  originalPerformanceObserver = window.PerformanceObserver;
  (window as any).PerformanceObserver = MockPerformanceObserver;

  const player = new Player(canvas); // Default: enableLongAnimationFrameLogging = false
  await player.mount({
    version: "2.0",
    size: { width: 100, height: 100 },
    fps: 20,
    frames: 10,
    images: {},
    replaceElements: {},
    dynamicElements: {},
    sprites: []
  });

  player.start(); // Call start to potentially trigger observer logic if it were enabled

  if (performanceObserverConstructed) {
    console.error('TESTCASE_LONG_ANIM_FRAMES_DISABLED: Failed. Observer was constructed.');
  } else {
    console.log('%cTESTCASE_LONG_ANIM_FRAMES_DISABLED: Passed. Observer was not constructed.', 'color: green; font-weight: bold;');
  }

  (window as any).PerformanceObserver = originalPerformanceObserver;
  console.log('%cTESTCASE_LONG_ANIM_FRAMES_DISABLED: End', 'color: blue; font-weight: bold;');
}

async function TESTCASE_LONG_ANIM_FRAMES_ENABLED_API_AVAILABLE(): Promise<void> {
  console.log('%cTESTCASE_LONG_ANIM_FRAMES_ENABLED_API_AVAILABLE: Start', 'color: blue; font-weight: bold;');
  resetSpies();

  originalPerformanceObserver = window.PerformanceObserver;
  originalConsoleWarn = console.warn;

  (window as any).PerformanceObserver = MockPerformanceObserver;
  MockPerformanceObserver.supportedEntryTypes = ['long-animation-frame']; // Ensure it's supported

  console.warn = (...args: any[]) => {
    consoleWarnCalledWith = args;
    // console.log('[MockConsoleWarn] called with:', args);
  };

  const player = new Player({ container: canvas, enableLongAnimationFrameLogging: true });
  await player.mount({
    version: "2.0",
    size: { width: 100, height: 100 },
    fps: 20,
    frames: 10,
    images: {},
    replaceElements: {},
    dynamicElements: {},
    sprites: []
  });

  console.log('Player created with LoAF logging enabled.');
  if (!performanceObserverConstructed || !mockPerformanceObserverInstance) {
    console.error('TESTCASE_LONG_ANIM_FRAMES_ENABLED_API_AVAILABLE: Failed. Observer not constructed or instance not set.');
    (window as any).PerformanceObserver = originalPerformanceObserver;
    console.warn = originalConsoleWarn;
    return;
  }
  console.log('Expected: PerformanceObserver constructed. Actual:', performanceObserverConstructed);


  player.start();
  console.log('player.start() called');
  if (!mockPerformanceObserverInstance.observeCalled) {
    console.error('TESTCASE_LONG_ANIM_FRAMES_ENABLED_API_AVAILABLE: Failed. observe was not called on start.');
  } else {
    console.log('Expected: observeCalled === true. Actual:', mockPerformanceObserverInstance.observeCalled);
    console.log('Expected: observedOptions type === "long-animation-frame". Actual:', mockPerformanceObserverInstance.observedOptions?.type);
  }


  // Simulate a long animation frame
  if (mockPerformanceObserverInstance && mockPerformanceObserverInstance.callback) {
    console.log('Simulating long animation frame entry...');
    const mockEntry: MockLoafPerformanceEntry = {
      name: 'long-animation-frame',
      entryType: 'long-animation-frame',
      startTime: 100,
      duration: 200,
      renderingTime: 150,
      scripts: [{
        sourceURL: 'test.js',
        sourceFunctionName: 'testFunc',
        sourceCharPosition: 10,
        duration: 50,
        executionType: 'script'
      }],
      toJSON: function() { return this; }
    };

    mockPerformanceObserverInstance.callback(
      { getEntries: () => [mockEntry] },
      mockPerformanceObserverInstance // Pass the instance itself as the observer argument
    );
    if (!consoleWarnCalledWith) console.error('TESTCASE_LONG_ANIM_FRAMES_ENABLED_API_AVAILABLE: Failed. console.warn not called for mock entry.');
    else console.log('Expected: console.warn WAS called. Actual: true');
  }

  // Test disconnect on stop
  if (!mockPerformanceObserverInstance) throw new Error("mockPerformanceObserverInstance is null before stop test");
  mockPerformanceObserverInstance.disconnectCalled = false; // Reset before action
  player.stop();
  console.log('player.stop() called');
  if (!mockPerformanceObserverInstance.disconnectCalled) {
     console.error('TESTCASE_LONG_ANIM_FRAMES_ENABLED_API_AVAILABLE: Failed. disconnect was not called on stop.');
  } else {
    console.log('Expected: disconnectCalled === true (after stop). Actual:', mockPerformanceObserverInstance.disconnectCalled);
  }

  // Test disconnect on destroy
  // Player needs to be "started" again for observer to be active before destroy
  // or ensure observer is not disconnected by stop if we want to test destroy independently.
  // Current player logic: stop disconnects. So, to test destroy's disconnect, we'd need to re-init/re-start.
  // For simplicity, we'll assume `setConfig` or `start` would re-initialize the observer if needed.
  // Let's create a new player instance for a clean destroy test or re-setup the observer.
  // Given the current setup, player.destroy() will call disconnect.
  // If it was already disconnected by player.stop(), this is fine, it's just a second safe call.
  if (!mockPerformanceObserverInstance) throw new Error("mockPerformanceObserverInstance is null before destroy test");
  mockPerformanceObserverInstance.disconnectCalled = false; // Reset
  player.destroy(); // This player instance still has the same observer reference
  console.log('player.destroy() called');
   if (!mockPerformanceObserverInstance.disconnectCalled && player.config.enableLongAnimationFrameLogging) {
    // If logging was enabled, destroy should attempt a disconnect.
    // However, the global `mockPerformanceObserverInstance` might be from an old player if not careful.
    // The `player.longAnimationFrameObserver` is set to null in destroy.
    // The key is that `destroy` on *that player's observer* was called.
    // Our global spy `mockPerformanceObserverInstance` will reflect the last instance created.
    // This test might be tricky if multiple player instances are used without care.
    // For this test structure, we assume one player and one observer instance active in the spy.
    console.error('TESTCASE_LONG_ANIM_FRAMES_ENABLED_API_AVAILABLE: Failed. disconnect was not called on destroy by the spied instance.');
  } else {
    // If logging was disabled, or if disconnect was called, this is okay.
    // The player.destroy() sets its internal observer to null.
    // The global spy will hold the state of the *last* observer instance created.
    console.log('Expected: disconnectCalled === true (after destroy, if observer existed and was active). Actual:', mockPerformanceObserverInstance.disconnectCalled);
  }


  // Simplified overall check for this test case
  if (performanceObserverConstructed &&
      mockPerformanceObserverInstance &&
      mockPerformanceObserverInstance.observeCalled &&
      consoleWarnCalledWith) {
    console.log('%cTESTCASE_LONG_ANIM_FRAMES_ENABLED_API_AVAILABLE: Passed (core checks)', 'color: green; font-weight: bold;');
  } else {
    console.error('TESTCASE_LONG_ANIM_FRAMES_ENABLED_API_AVAILABLE: Failed. Check logs.');
  }

  (window as any).PerformanceObserver = originalPerformanceObserver;
  console.warn = originalConsoleWarn;
  console.log('%cTESTCASE_LONG_ANIM_FRAMES_ENABLED_API_AVAILABLE: End', 'color: blue; font-weight: bold;');
}

async function TESTCASE_LONG_ANIM_FRAMES_ENABLED_API_UNAVAILABLE_UNDEFINED(): Promise<void> {
  console.log('%cTESTCASE_LONG_ANIM_FRAMES_ENABLED_API_UNAVAILABLE_UNDEFINED: Start', 'color: blue; font-weight: bold;');
  resetSpies();

  originalPerformanceObserver = window.PerformanceObserver;
  (window as any).PerformanceObserver = undefined; // API is undefined

  const player = new Player({ container: canvas, enableLongAnimationFrameLogging: true });
  await player.mount({
      version: "2.0",
      size: { width: 100, height: 100 },
      fps: 20,
      frames: 10,
      images: {},
      replaceElements: {},
      dynamicElements: {},
      sprites: []
  });
  player.start(); // Attempt to trigger observer creation

  if (performanceObserverConstructed) {
    console.error('TESTCASE_LONG_ANIM_FRAMES_ENABLED_API_UNAVAILABLE_UNDEFINED: Failed. Observer was constructed.');
  } else {
    console.log('%cTESTCASE_LONG_ANIM_FRAMES_ENABLED_API_UNAVAILABLE_UNDEFINED: Passed. Observer was not constructed.', 'color: green; font-weight: bold;');
  }

  (window as any).PerformanceObserver = originalPerformanceObserver;
  console.log('%cTESTCASE_LONG_ANIM_FRAMES_ENABLED_API_UNAVAILABLE_UNDEFINED: End', 'color: blue; font-weight: bold;');
}

async function TESTCASE_LONG_ANIM_FRAMES_ENABLED_API_UNAVAILABLE_UNSUPPORTED(): Promise<void> {
  console.log('%cTESTCASE_LONG_ANIM_FRAMES_ENABLED_API_UNAVAILABLE_UNSUPPORTED: Start', 'color: blue; font-weight: bold;');
  resetSpies();

  originalPerformanceObserver = window.PerformanceObserver;
  (window as any).PerformanceObserver = MockPerformanceObserver; // Provide the mock class
  MockPerformanceObserver.supportedEntryTypes = ['paint']; // Does not include 'long-animation-frame'

  const player = new Player({ container: canvas, enableLongAnimationFrameLogging: true });
  await player.mount({
      version: "2.0",
      size: { width: 100, height: 100 },
      fps: 20,
      frames: 10,
      images: {},
      replaceElements: {},
      dynamicElements: {},
      sprites: []
  });
  player.start(); // Attempt to trigger observer creation

  if (performanceObserverConstructed) {
     // This case is tricky. The Player's `initLongAnimationFrameObserver` has a runtime check.
     // If MockPerformanceObserver is assigned to window.PerformanceObserver, the constructor
     // of MockPerformanceObserver will run if `typeof window.PerformanceObserver === 'function'` is true.
     // However, the *next* check in Player.ts is `!window.PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')`.
     // This should prevent the *assignment* `this.longAnimationFrameObserver = new PerformanceObserver(...)`.
     // So, `performanceObserverConstructed` (our global spy set in mock constructor) might be true,
     // but `player.longAnimationFrameObserver` should be null.
     // The key is that no *observation* for 'long-animation-frame' should occur.
    console.error('TESTCASE_LONG_ANIM_FRAMES_ENABLED_API_UNAVAILABLE_UNSUPPORTED: Failed. Observer was constructed.');
  } else {
    console.log('%cTESTCASE_LONG_ANIM_FRAMES_ENABLED_API_UNAVAILABLE_UNSUPPORTED: Passed. Observer was not constructed.', 'color: green; font-weight: bold;');
  }

  // Restore static property for other tests if they run in the same suite sequentially without full page reloads
  MockPerformanceObserver.supportedEntryTypes = ['long-animation-frame'];
  (window as any).PerformanceObserver = originalPerformanceObserver;
  console.log('%cTESTCASE_LONG_ANIM_FRAMES_ENABLED_API_UNAVAILABLE_UNSUPPORTED: End', 'color: blue; font-weight: bold;');
}


Promise.all([
  // TESTCASE1(),
  // TESTCASE2(),
  // TESTCASE3(),
  // TESTCASE4(),
  // TESTCASE5(),
  // TESTCASE6(),
  // TESTCASE7(),
  // TESTCASE8(),
  TESTCASE_LONG_ANIM_FRAMES_DISABLED(),
  TESTCASE_LONG_ANIM_FRAMES_ENABLED_API_AVAILABLE(),
  TESTCASE_LONG_ANIM_FRAMES_ENABLED_API_UNAVAILABLE_UNDEFINED(),
  TESTCASE_LONG_ANIM_FRAMES_ENABLED_API_UNAVAILABLE_UNSUPPORTED()
]).catch(error => console.error(error))
