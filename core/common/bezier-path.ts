export default class BezierPath {
  _d?: Number
  _transform?: any
  _styles?: any

  constructor (d?: Number, transform?: any, styles?: any) {
    this._d = d
    this._transform = transform
    this._styles = styles
  }
}
