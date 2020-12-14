interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface Transform {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

interface VideoSize {
  width: number
  height: number
}

enum SVGA_VERSION {
  VERSION_1_0 = '1.0',
  VERSION_1_5 = '1.5',
  VERSION_2_0 = '2.0',
}

interface FrameEntity {
  alpha: number
  transform: Transform
  nx: number
  ny: number
  layout: Rect
  maskPath: any;
  shapes: Array<any>
}

interface SpriteEntity {
  imageKey: string
  frames: FrameEntity[]
}

type DynamicElement = CanvasImageSource | {
  source: CanvasImageSource,
  fit: 'contain' | 'cover' | 'fill' | 'none'
}

interface VideoEntity {
  version: SVGA_VERSION
  videoSize: VideoSize
  FPS: number
  frames: number
  images: { [key: string]: any }
  dynamicElements: { [key: string]: DynamicElement }
  sprites: Array<any>
}
