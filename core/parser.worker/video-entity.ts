import SpriteEntity from './sprite-entity'

export default class VideoEntity implements VideoEntity {
  public version: string
  public videoSize: VideoSize = { width: 0, height: 0 }
  public FPS: number
  public frames: number
  public images = {}
  public dynamicElements = {}
  public sprites: Array<SpriteEntity> = []

  constructor (spec: any, images: any) {
    this.version = spec.version
    this.videoSize.width = spec.params.viewBoxWidth || 0.0
    this.videoSize.height = spec.params.viewBoxHeight || 0.0
    this.FPS = spec.params.fps || 20
    this.frames = spec.params.frames || 0

    spec.sprites instanceof Array && (this.sprites = spec.sprites.map((obj: any) => {
      return new SpriteEntity(obj)
    }))

    images && (this.images = images)
  }
}
