import FrameEntity from './frame-entity'

export default class SpriteEntity implements SpriteEntity {
  public imageKey?: string
  public frames: Array<FrameEntity> = []

  constructor (spec: any) {
    this.imageKey = spec.imageKey

    spec.frames && (this.frames = spec.frames.map((obj: any) => {
      return new FrameEntity(obj)
    }))
  }
}
