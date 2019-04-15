export default class BezierPath {
  _d?: Number
  _transform?: String
  _styles?: any

  constructor (d?: Number, transform?: String, styles?: any) {
    this._d = d
    this._transform = transform
    this._styles = styles
  }
}
