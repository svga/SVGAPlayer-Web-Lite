import BezierPath from './bezier-path'

export default class RectPath extends BezierPath {
  _x?: Number
  _y?: Number
  _width?: Number
  _height?: Number
  _cornerRadius?: Number

  constructor (x?: Number, y?: Number, width?: Number, height?: Number, cornerRadius?: Number, transform?: String, styles?: any) {
    super()

    this._x = x
    this._y = y
    this._width = width
    this._height = height
    this._cornerRadius = cornerRadius
    this._transform = transform
    this._styles = styles
  }
}
