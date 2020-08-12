import BezierPath from './bezier-path'

export default class EllipsePath extends BezierPath {
  _x?: Number
  _y?: Number
  _transform?: any
  _styles?: any
  _radiusX?: Number
  _radiusY?: Number

  constructor (x?: Number, y?: Number, radiusX?: Number, radiusY?: Number, transform?: String, styles?: any) {
    super()

    this._x = x
    this._y = y
    this._radiusX = radiusX
    this._radiusY = radiusY
    this._transform = transform
    this._styles = styles
  }
}
