import { deflateSync, inflateSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Root } = require('protobufjs')

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const protoPath = resolve(rootDir, 'src/parser/svga-proto.ts')
const rectFillOutputPath = resolve(rootDir, '__test__/svga/rect-fill.svga')
const rectStrokeOutputPath = resolve(rootDir, '__test__/svga/rect-stroke.svga')
const roundedRectFillOutputPath = resolve(rootDir, '__test__/svga/rounded-rect-fill.svga')
const roundedRectStrokeOutputPath = resolve(rootDir, '__test__/svga/rounded-rect-stroke.svga')
const ellipseFillOutputPath = resolve(rootDir, '__test__/svga/ellipse-fill.svga')
const ellipseStrokeOutputPath = resolve(rootDir, '__test__/svga/ellipse-stroke.svga')

function loadSvgaProtoJson () {
  const source = readFileSync(protoPath, 'utf8')
  return Function(`${source.replace(/^export default\s*/, 'return ')}`)()
}

function createRectFillMovie () {
  const transform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }

  return {
    version: '2.0',
    params: {
      viewBoxWidth: 120,
      viewBoxHeight: 120,
      fps: 20,
      frames: 1
    },
    images: {},
    sprites: [
      {
        imageKey: 'shape-only',
        frames: [
          {
            alpha: 1,
            layout: { x: 0, y: 0, width: 120, height: 120 },
            transform,
            clipPath: '',
            shapes: [
              {
                type: 1,
                rect: { x: 20, y: 30, width: 70, height: 45, cornerRadius: 0 },
                styles: {
                  fill: { r: 1, g: 0, b: 0, a: 1 }
                },
                transform
              }
            ]
          }
        ]
      }
    ]
  }
}

function createRectStrokeMovie () {
  const transform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }

  return {
    version: '2.0',
    params: {
      viewBoxWidth: 120,
      viewBoxHeight: 120,
      fps: 20,
      frames: 1
    },
    images: {},
    sprites: [
      {
        imageKey: 'shape-only',
        frames: [
          {
            alpha: 1,
            layout: { x: 0, y: 0, width: 120, height: 120 },
            transform,
            clipPath: '',
            shapes: [
              {
                type: 1,
                rect: { x: 24, y: 28, width: 72, height: 56, cornerRadius: 0 },
                styles: {
                  stroke: { r: 0, g: 0, b: 0, a: 1 },
                  strokeWidth: 10
                },
                transform
              }
            ]
          }
        ]
      }
    ]
  }
}

function createRoundedRectFillMovie () {
  const transform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }

  return {
    version: '2.0',
    params: {
      viewBoxWidth: 120,
      viewBoxHeight: 120,
      fps: 20,
      frames: 1
    },
    images: {},
    sprites: [
      {
        imageKey: 'shape-only',
        frames: [
          {
            alpha: 1,
            layout: { x: 0, y: 0, width: 120, height: 120 },
            transform,
            clipPath: '',
            shapes: [
              {
                type: 1,
                rect: { x: 20, y: 30, width: 70, height: 45, cornerRadius: 14 },
                styles: {
                  fill: { r: 0, g: 0.45, b: 1, a: 1 }
                },
                transform
              }
            ]
          }
        ]
      }
    ]
  }
}

function createRoundedRectStrokeMovie () {
  const transform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }

  return {
    version: '2.0',
    params: {
      viewBoxWidth: 120,
      viewBoxHeight: 120,
      fps: 20,
      frames: 1
    },
    images: {},
    sprites: [
      {
        imageKey: 'shape-only',
        frames: [
          {
            alpha: 1,
            layout: { x: 0, y: 0, width: 120, height: 120 },
            transform,
            clipPath: '',
            shapes: [
              {
                type: 1,
                rect: { x: 24, y: 28, width: 72, height: 56, cornerRadius: 16 },
                styles: {
                  stroke: { r: 0, g: 0, b: 0, a: 1 },
                  strokeWidth: 10
                },
                transform
              }
            ]
          }
        ]
      }
    ]
  }
}

function createEllipseFillMovie () {
  const transform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }

  return {
    version: '2.0',
    params: {
      viewBoxWidth: 120,
      viewBoxHeight: 120,
      fps: 20,
      frames: 1
    },
    images: {},
    sprites: [
      {
        imageKey: 'shape-only',
        frames: [
          {
            alpha: 1,
            layout: { x: 0, y: 0, width: 120, height: 120 },
            transform,
            clipPath: '',
            shapes: [
              {
                type: 2,
                ellipse: { x: 60, y: 60, radiusX: 36, radiusY: 24 },
                styles: {
                  fill: { r: 0.2, g: 0.85, b: 0.35, a: 1 }
                },
                transform
              }
            ]
          }
        ]
      }
    ]
  }
}

function createEllipseStrokeMovie () {
  const transform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }

  return {
    version: '2.0',
    params: {
      viewBoxWidth: 120,
      viewBoxHeight: 120,
      fps: 20,
      frames: 1
    },
    images: {},
    sprites: [
      {
        imageKey: 'shape-only',
        frames: [
          {
            alpha: 1,
            layout: { x: 0, y: 0, width: 120, height: 120 },
            transform,
            clipPath: '',
            shapes: [
              {
                type: 2,
                ellipse: { x: 60, y: 60, radiusX: 34, radiusY: 22 },
                styles: {
                  stroke: { r: 0, g: 0, b: 0, a: 1 },
                  strokeWidth: 8
                },
                transform
              }
            ]
          }
        ]
      }
    ]
  }
}

function varint (value) {
  const bytes = []
  let current = value >>> 0
  while (current > 127) {
    bytes.push((current & 0x7F) | 0x80)
    current >>>= 7
  }
  bytes.push(current)
  return Buffer.from(bytes)
}

function key (fieldId, wireType) {
  return varint((fieldId << 3) | wireType)
}

function fieldBytes (fieldId, bytes) {
  return Buffer.concat([key(fieldId, 2), varint(bytes.length), bytes])
}

function fieldFloat (fieldId, value) {
  const bytes = Buffer.allocUnsafe(4)
  bytes.writeFloatLE(value, 0)
  return Buffer.concat([key(fieldId, 5), bytes])
}

function fieldInt32 (fieldId, value) {
  return Buffer.concat([key(fieldId, 0), varint(value)])
}

function fieldString (fieldId, value) {
  return fieldBytes(fieldId, Buffer.from(value, 'utf8'))
}

function encodeTransform (transform) {
  return Buffer.concat([
    fieldFloat(1, transform.a),
    fieldFloat(2, transform.b),
    fieldFloat(3, transform.c),
    fieldFloat(4, transform.d),
    fieldFloat(5, transform.tx),
    fieldFloat(6, transform.ty)
  ])
}

function encodeLayout (layout) {
  return Buffer.concat([
    fieldFloat(1, layout.x),
    fieldFloat(2, layout.y),
    fieldFloat(3, layout.width),
    fieldFloat(4, layout.height)
  ])
}

function encodeRect (rect) {
  return Buffer.concat([
    fieldFloat(1, rect.x),
    fieldFloat(2, rect.y),
    fieldFloat(3, rect.width),
    fieldFloat(4, rect.height),
    fieldFloat(5, rect.cornerRadius)
  ])
}

function encodeEllipse (ellipse) {
  return Buffer.concat([
    fieldFloat(1, ellipse.x),
    fieldFloat(2, ellipse.y),
    fieldFloat(3, ellipse.radiusX),
    fieldFloat(4, ellipse.radiusY)
  ])
}

function encodeRgba (rgba) {
  return Buffer.concat([
    fieldFloat(1, rgba.r),
    fieldFloat(2, rgba.g),
    fieldFloat(3, rgba.b),
    fieldFloat(4, rgba.a)
  ])
}

function encodeShapeStyle (styles) {
  const fields = []
  if (styles.fill != null) fields.push(fieldBytes(1, encodeRgba(styles.fill)))
  if (styles.stroke != null) fields.push(fieldBytes(2, encodeRgba(styles.stroke)))
  if (styles.strokeWidth != null) fields.push(fieldFloat(3, styles.strokeWidth))
  return Buffer.concat(fields)
}

function encodeShape (shape) {
  const fields = [fieldInt32(1, shape.type)]
  if (shape.rect != null) fields.push(fieldBytes(3, encodeRect(shape.rect)))
  if (shape.ellipse != null) fields.push(fieldBytes(4, encodeEllipse(shape.ellipse)))
  fields.push(
    fieldBytes(10, encodeShapeStyle(shape.styles)),
    fieldBytes(11, encodeTransform(shape.transform))
  )
  return Buffer.concat(fields)
}

function encodeFrame (frame) {
  return Buffer.concat([
    fieldFloat(1, frame.alpha),
    fieldBytes(2, encodeLayout(frame.layout)),
    fieldBytes(3, encodeTransform(frame.transform)),
    fieldString(4, frame.clipPath),
    ...frame.shapes.map(shape => fieldBytes(5, encodeShape(shape)))
  ])
}

function encodeSprite (sprite) {
  return Buffer.concat([
    fieldString(1, sprite.imageKey),
    ...sprite.frames.map(frame => fieldBytes(2, encodeFrame(frame)))
  ])
}

function encodeMovieParams (params) {
  return Buffer.concat([
    fieldFloat(1, params.viewBoxWidth),
    fieldFloat(2, params.viewBoxHeight),
    fieldInt32(3, params.fps),
    fieldInt32(4, params.frames)
  ])
}

function encodeMovie (movie) {
  return Buffer.concat([
    fieldString(1, movie.version),
    fieldBytes(2, encodeMovieParams(movie.params)),
    ...movie.sprites.map(sprite => fieldBytes(4, encodeSprite(sprite)))
  ])
}

const proto = Root.fromJSON(loadSvgaProtoJson())
const MovieEntity = proto.lookupType('com.opensource.svga.MovieEntity')

function writeMovie (outputPath, movie) {
  const encoded = encodeMovie(movie)
  const compressed = deflateSync(Buffer.from(encoded))
  writeFileSync(outputPath, compressed)
  return MovieEntity.decode(inflateSync(compressed))
}

const rectFill = writeMovie(rectFillOutputPath, createRectFillMovie())
const rectFillShape = rectFill.sprites[0]?.frames[0]?.shapes[0]
if (rectFillShape?.type !== 1 || rectFillShape.rect?.cornerRadius !== 0 || rectFillShape.styles?.fill == null) {
  throw new Error('Generated rect-fill.svga did not decode into the expected filled RECT shape')
}

const rectStroke = writeMovie(rectStrokeOutputPath, createRectStrokeMovie())
const rectStrokeShape = rectStroke.sprites[0]?.frames[0]?.shapes[0]
const rectStrokeStyle = rectStrokeShape?.styles
if (
  rectStrokeShape?.type !== 1 ||
  rectStrokeShape.rect?.cornerRadius !== 0 ||
  rectStrokeStyle?.stroke == null ||
  rectStrokeStyle.strokeWidth == null ||
  rectStrokeStyle.strokeWidth <= 0 ||
  Object.prototype.hasOwnProperty.call(rectStrokeStyle, 'lineCap') ||
  Object.prototype.hasOwnProperty.call(rectStrokeStyle, 'lineJoin') ||
  Object.prototype.hasOwnProperty.call(rectStrokeStyle, 'miterLimit') ||
  Object.prototype.hasOwnProperty.call(rectStrokeStyle, 'lineDashI') ||
  Object.prototype.hasOwnProperty.call(rectStrokeStyle, 'lineDashII') ||
  Object.prototype.hasOwnProperty.call(rectStrokeStyle, 'lineDashIII')
) {
  throw new Error('Generated rect-stroke.svga did not decode into the expected stroked RECT shape')
}

const roundedRectFill = writeMovie(roundedRectFillOutputPath, createRoundedRectFillMovie())
const roundedRectFillShape = roundedRectFill.sprites[0]?.frames[0]?.shapes[0]
const roundedRectFillStyle = roundedRectFillShape?.styles
if (
  roundedRectFillShape?.type !== 1 ||
  roundedRectFillShape.rect?.cornerRadius == null ||
  roundedRectFillShape.rect.cornerRadius <= 0 ||
  roundedRectFillStyle?.fill == null ||
  roundedRectFillStyle.stroke != null ||
  Object.prototype.hasOwnProperty.call(roundedRectFillStyle, 'strokeWidth')
) {
  throw new Error('Generated rounded-rect-fill.svga did not decode into the expected filled rounded RECT shape')
}

const roundedRectStroke = writeMovie(roundedRectStrokeOutputPath, createRoundedRectStrokeMovie())
const roundedRectStrokeShape = roundedRectStroke.sprites[0]?.frames[0]?.shapes[0]
const roundedRectStrokeStyle = roundedRectStrokeShape?.styles
if (
  roundedRectStrokeShape?.type !== 1 ||
  roundedRectStrokeShape.rect?.cornerRadius == null ||
  roundedRectStrokeShape.rect.cornerRadius <= 0 ||
  roundedRectStrokeStyle?.fill != null ||
  roundedRectStrokeStyle?.stroke == null ||
  roundedRectStrokeStyle.strokeWidth == null ||
  roundedRectStrokeStyle.strokeWidth <= 0 ||
  Object.prototype.hasOwnProperty.call(roundedRectStrokeStyle, 'lineCap') ||
  Object.prototype.hasOwnProperty.call(roundedRectStrokeStyle, 'lineJoin') ||
  Object.prototype.hasOwnProperty.call(roundedRectStrokeStyle, 'miterLimit') ||
  Object.prototype.hasOwnProperty.call(roundedRectStrokeStyle, 'lineDashI') ||
  Object.prototype.hasOwnProperty.call(roundedRectStrokeStyle, 'lineDashII') ||
  Object.prototype.hasOwnProperty.call(roundedRectStrokeStyle, 'lineDashIII')
) {
  throw new Error('Generated rounded-rect-stroke.svga did not decode into the expected stroked rounded RECT shape')
}

const ellipseFill = writeMovie(ellipseFillOutputPath, createEllipseFillMovie())
const ellipseFillShape = ellipseFill.sprites[0]?.frames[0]?.shapes[0]
const ellipseFillStyle = ellipseFillShape?.styles
if (
  ellipseFillShape?.type !== 2 ||
  ellipseFillShape.ellipse?.radiusX == null ||
  ellipseFillShape.ellipse.radiusX <= 0 ||
  ellipseFillShape.ellipse.radiusY == null ||
  ellipseFillShape.ellipse.radiusY <= 0 ||
  ellipseFillStyle?.fill == null ||
  ellipseFillStyle.stroke != null ||
  Object.prototype.hasOwnProperty.call(ellipseFillStyle, 'strokeWidth')
) {
  throw new Error('Generated ellipse-fill.svga did not decode into the expected filled ELLIPSE shape')
}

const ellipseStroke = writeMovie(ellipseStrokeOutputPath, createEllipseStrokeMovie())
const ellipseStrokeShape = ellipseStroke.sprites[0]?.frames[0]?.shapes[0]
const ellipseStrokeStyle = ellipseStrokeShape?.styles
if (
  ellipseStrokeShape?.type !== 2 ||
  ellipseStrokeShape.ellipse?.radiusX == null ||
  ellipseStrokeShape.ellipse.radiusX <= 0 ||
  ellipseStrokeShape.ellipse.radiusY == null ||
  ellipseStrokeShape.ellipse.radiusY <= 0 ||
  ellipseStrokeStyle?.fill != null ||
  ellipseStrokeStyle?.stroke == null ||
  ellipseStrokeStyle.strokeWidth == null ||
  ellipseStrokeStyle.strokeWidth <= 0 ||
  Object.prototype.hasOwnProperty.call(ellipseStrokeStyle, 'lineCap') ||
  Object.prototype.hasOwnProperty.call(ellipseStrokeStyle, 'lineJoin') ||
  Object.prototype.hasOwnProperty.call(ellipseStrokeStyle, 'miterLimit') ||
  Object.prototype.hasOwnProperty.call(ellipseStrokeStyle, 'lineDashI') ||
  Object.prototype.hasOwnProperty.call(ellipseStrokeStyle, 'lineDashII') ||
  Object.prototype.hasOwnProperty.call(ellipseStrokeStyle, 'lineDashIII')
) {
  throw new Error('Generated ellipse-stroke.svga did not decode into the expected stroked ELLIPSE shape')
}

console.log(`Wrote ${rectFillOutputPath}`)
console.log(`Wrote ${rectStrokeOutputPath}`)
console.log(`Wrote ${roundedRectFillOutputPath}`)
console.log(`Wrote ${roundedRectStrokeOutputPath}`)
console.log(`Wrote ${ellipseFillOutputPath}`)
console.log(`Wrote ${ellipseStrokeOutputPath}`)
