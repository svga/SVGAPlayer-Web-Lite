import {
  Bitmap,
  DynamicElement,
  Rect,
  ReplaceElement,
  Transform
} from '../../types'
import {
  CompiledAnimation,
  createWebGLRenderCapabilities,
  FrameRenderCommand,
  RenderCapabilities,
  ShapeRenderCommand
} from '../compiler/types'
import { RenderBackend } from './types'

interface TextureEntry {
  texture: WebGLTexture
  width: number
  height: number
}

type WebGLContextState = 'ready' | 'lost' | 'failed' | 'destroyed'

type Color = [number, number, number, number]

interface Point {
  x: number
  y: number
}

interface RoundedRect extends Rect {
  cornerRadius: number
}

const ROUNDED_RECT_CORNER_SEGMENTS = 8

function webglCapabilities (): RenderCapabilities {
  return createWebGLRenderCapabilities()
}

async function loadBitmap (image: string | Bitmap): Promise<Bitmap> {
  if (typeof image !== 'string') {
    return image
  }

  return await awaitImage(`data:image/png;base64,${image}`)
}

async function awaitImage (src: string): Promise<HTMLImageElement> {
  return await new Promise(resolve => {
    const img = document.createElement('img')
    img.src = src
    img.onload = () => resolve(img)
  })
}

function createShader (gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (shader === null) throw new Error('[SVGA WebGL] Unable to create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    const info = gl.getShaderInfoLog(shader) ?? 'unknown shader error'
    gl.deleteShader(shader)
    throw new Error(`[SVGA WebGL] ${info}`)
  }
  return shader
}

function createProgram (
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const program = gl.createProgram()
  if (program === null) throw new Error('[SVGA WebGL] Unable to create program')

  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource)

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)

  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
    const info = gl.getProgramInfoLog(program) ?? 'unknown program error'
    gl.deleteProgram(program)
    throw new Error(`[SVGA WebGL] ${info}`)
  }

  return program
}

function transformMatrix (transform: Transform | undefined): Float32Array {
  const current = transform ?? { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
  return new Float32Array([
    current.a, current.b, 0,
    current.c, current.d, 0,
    current.tx, current.ty, 1
  ])
}

function composeTransforms (
  parent: Transform | undefined,
  child: Transform | undefined
): Transform | undefined {
  if (parent === undefined) return child
  if (child === undefined) return parent

  return {
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    tx: parent.a * child.tx + parent.c * child.ty + parent.tx,
    ty: parent.b * child.tx + parent.d * child.ty + parent.ty
  }
}

function parseRgbaColor (value: string): Color | null {
  const match = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/.exec(value)
  if (match === null) return null

  const red = Number(match[1])
  const green = Number(match[2])
  const blue = Number(match[3])
  const alpha = Number(match[4])
  if ([red, green, blue, alpha].some(component => !Number.isFinite(component))) return null

  return [
    Math.max(0, Math.min(1, red / 255)),
    Math.max(0, Math.min(1, green / 255)),
    Math.max(0, Math.min(1, blue / 255)),
    Math.max(0, Math.min(1, alpha))
  ]
}

function drawRectVertices (rect: Rect): Float32Array {
  const x = rect.x
  const y = rect.y
  return new Float32Array([
    x, y,
    x + rect.width, y,
    x, y + rect.height,
    x, y + rect.height,
    x + rect.width, y,
    x + rect.width, y + rect.height
  ])
}

function drawRectStrokeVertices (rect: Rect, strokeWidth: number): Float32Array | null {
  if (rect.width <= 0 || rect.height <= 0 || strokeWidth <= 0) return null

  const half = strokeWidth / 2
  const outerLeft = rect.x - half
  const outerTop = rect.y - half
  const outerRight = rect.x + rect.width + half
  const outerBottom = rect.y + rect.height + half
  const innerLeft = rect.x + half
  const innerTop = rect.y + half
  const innerRight = rect.x + rect.width - half
  const innerBottom = rect.y + rect.height - half

  if (innerLeft >= innerRight || innerTop >= innerBottom) return null

  const vertices: number[] = []
  const pushQuad = (left: number, top: number, right: number, bottom: number): void => {
    vertices.push(
      left, top,
      right, top,
      left, bottom,
      left, bottom,
      right, top,
      right, bottom
    )
  }

  pushQuad(outerLeft, outerTop, outerRight, innerTop)
  pushQuad(innerRight, innerTop, outerRight, innerBottom)
  pushQuad(outerLeft, innerBottom, outerRight, outerBottom)
  pushQuad(outerLeft, innerTop, innerLeft, innerBottom)

  return new Float32Array(vertices)
}

function clampedRadius (rect: RoundedRect): number {
  return Math.max(0, Math.min(rect.cornerRadius, rect.width / 2, rect.height / 2))
}

function roundedRectPerimeter (
  rect: RoundedRect,
  segments: number = ROUNDED_RECT_CORNER_SEGMENTS,
  keepSegmentedCorners: boolean = false
): Point[] | null {
  if (rect.width <= 0 || rect.height <= 0) return null

  const radius = clampedRadius(rect)
  const left = rect.x
  const top = rect.y
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height

  if (radius <= 0 && !keepSegmentedCorners) {
    return [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom }
    ]
  }

  const points: Point[] = []
  const pushArc = (
    centerX: number,
    centerY: number,
    startAngle: number,
    endAngle: number
  ): void => {
    for (let index = 0; index <= segments; index++) {
      const angle = startAngle + (endAngle - startAngle) * (index / segments)
      points.push({
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius
      })
    }
  }

  pushArc(right - radius, top + radius, -Math.PI / 2, 0)
  pushArc(right - radius, bottom - radius, 0, Math.PI / 2)
  pushArc(left + radius, bottom - radius, Math.PI / 2, Math.PI)
  pushArc(left + radius, top + radius, Math.PI, Math.PI * 1.5)

  return points
}

function drawRoundedRectVertices (rect: RoundedRect): Float32Array | null {
  const points = roundedRectPerimeter(rect)
  if (points === null || points.length < 3) return null

  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  const vertices: number[] = []

  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length]
    vertices.push(
      centerX, centerY,
      point.x, point.y,
      next.x, next.y
    )
  })

  return new Float32Array(vertices)
}

function drawRoundedRectStrokeVertices (
  rect: RoundedRect,
  strokeWidth: number
): Float32Array | null {
  if (rect.width <= 0 || rect.height <= 0 || strokeWidth <= 0) return null

  const half = strokeWidth / 2
  const radius = clampedRadius(rect)
  const outer = {
    x: rect.x - half,
    y: rect.y - half,
    width: rect.width + strokeWidth,
    height: rect.height + strokeWidth,
    cornerRadius: radius + half
  }
  const inner = {
    x: rect.x + half,
    y: rect.y + half,
    width: rect.width - strokeWidth,
    height: rect.height - strokeWidth,
    cornerRadius: Math.max(0, radius - half)
  }

  if (inner.width <= 0 || inner.height <= 0) return null

  const outerPoints = roundedRectPerimeter(outer, ROUNDED_RECT_CORNER_SEGMENTS, true)
  const innerPoints = roundedRectPerimeter(inner, ROUNDED_RECT_CORNER_SEGMENTS, true)
  if (
    outerPoints === null ||
    innerPoints === null ||
    outerPoints.length !== innerPoints.length ||
    outerPoints.length < 2
  ) {
    return null
  }

  const vertices: number[] = []
  outerPoints.forEach((outerPoint, index) => {
    const nextIndex = (index + 1) % outerPoints.length
    const nextOuter = outerPoints[nextIndex]
    const innerPoint = innerPoints[index]
    const nextInner = innerPoints[nextIndex]
    vertices.push(
      outerPoint.x, outerPoint.y,
      nextOuter.x, nextOuter.y,
      innerPoint.x, innerPoint.y,
      innerPoint.x, innerPoint.y,
      nextOuter.x, nextOuter.y,
      nextInner.x, nextInner.y
    )
  })

  return new Float32Array(vertices)
}

const TEX_COORDS = new Float32Array([
  0, 0,
  1, 0,
  0, 1,
  0, 1,
  1, 0,
  1, 1
])

const VERTEX_SOURCE = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
uniform vec2 u_resolution;
uniform mat3 u_matrix;
varying vec2 v_texCoord;

void main() {
  vec3 position = u_matrix * vec3(a_position, 1.0);
  vec2 zeroToOne = position.xy / u_resolution;
  vec2 clipSpace = zeroToOne * 2.0 - 1.0;
  gl_Position = vec4(clipSpace.x, -clipSpace.y, 0, 1);
  v_texCoord = a_texCoord;
}
`

const FRAGMENT_SOURCE = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_alpha;
varying vec2 v_texCoord;

void main() {
  vec4 color = texture2D(u_texture, v_texCoord);
  gl_FragColor = vec4(color.rgb, color.a * u_alpha);
}
`

const SOLID_VERTEX_SOURCE = `
attribute vec2 a_position;
uniform vec2 u_resolution;
uniform mat3 u_matrix;

void main() {
  vec3 position = u_matrix * vec3(a_position, 1.0);
  vec2 zeroToOne = position.xy / u_resolution;
  vec2 clipSpace = zeroToOne * 2.0 - 1.0;
  gl_Position = vec4(clipSpace.x, -clipSpace.y, 0, 1);
}
`

const SOLID_FRAGMENT_SOURCE = `
precision mediump float;
uniform vec4 u_color;

void main() {
  gl_FragColor = u_color;
}
`

export function getWebGLCapabilities (): RenderCapabilities {
  return webglCapabilities()
}

export function isWebGLAvailable (container: HTMLCanvasElement): boolean {
  if (typeof document === 'undefined') return false
  const canvas = document.createElement('canvas')
  canvas.width = container.width
  canvas.height = container.height
  const gl = canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')
  return gl !== null
}

export class WebGLBackend implements RenderBackend {
  public readonly type = 'webgl' as const
  public readonly capabilities = webglCapabilities()

  private readonly canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext | null = null
  private program: WebGLProgram | null = null
  private solidProgram: WebGLProgram | null = null
  private positionBuffer: WebGLBuffer | null = null
  private texCoordBuffer: WebGLBuffer | null = null
  private textures: { [key: string]: TextureEntry } = {}
  private positionLocation: number = -1
  private texCoordLocation: number = -1
  private solidPositionLocation: number = -1
  private resolutionLocation: WebGLUniformLocation | null = null
  private matrixLocation: WebGLUniformLocation | null = null
  private alphaLocation: WebGLUniformLocation | null = null
  private solidResolutionLocation: WebGLUniformLocation | null = null
  private solidMatrixLocation: WebGLUniformLocation | null = null
  private solidColorLocation: WebGLUniformLocation | null = null
  private animation: CompiledAnimation | null = null
  private contextState: WebGLContextState = 'ready'
  private restoreError: Error | null = null

  constructor (canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.canvas.addEventListener('webglcontextlost', this.handleContextLost)
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored)
    this.initializeContext()
    this.initializeResources()
  }

  public async prepare (animation: CompiledAnimation): Promise<void> {
    this.animation = animation
    if (this.contextState === 'lost') return
    if (this.contextState === 'failed') throw this.restoreError ?? new Error('[SVGA WebGL] Context restore failed')

    this.disposeTextures()
    await this.uploadStaticResources(animation)
  }

  public async refresh (animation: CompiledAnimation): Promise<void> {
    this.animation = animation
  }

  private async uploadStaticResources (animation: CompiledAnimation): Promise<void> {
    const loaders: Array<Promise<void>> = []
    const images = animation.resources.images

    Object.keys(images).forEach(key => {
      loaders.push(
        loadBitmap(images[key]).then(bitmap => {
          if (this.contextState !== 'ready') return
          this.textures[key] = this.createTexture(bitmap)
        })
      )
    })

    await Promise.all(loaders)
  }

  public resize (width: number, height: number): void {
    this.canvas.width = width
    this.canvas.height = height
    if (this.contextState !== 'ready') return
    this.getGl().viewport(0, 0, width, height)
  }

  public renderFrame (animation: CompiledAnimation, frame: number): void {
    if (this.contextState === 'lost' || this.contextState === 'destroyed') return
    if (this.contextState === 'failed') {
      throw this.restoreError ?? new Error('[SVGA WebGL] Context restore failed')
    }

    this.clear()
    const gl = this.getGl()
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    animation.frames[frame]?.forEach(command => this.drawCommand(animation, command))
  }

  public clear (): void {
    if (this.contextState !== 'ready') return
    const gl = this.getGl()
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  public snapshot (): HTMLCanvasElement {
    return this.canvas
  }

  public destroy (): void {
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored)
    this.disposeResources(this.contextState !== 'lost')
    this.animation = null
    this.contextState = 'destroyed'
  }

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault()
    this.contextState = 'lost'
    this.restoreError = null
    this.clearResourceReferences()
  }

  private readonly handleContextRestored = (): void => {
    this.rebuildAfterRestore().catch(error => {
      this.contextState = 'failed'
      this.restoreError = error instanceof Error ? error : new Error(String(error))
    })
  }

  private async rebuildAfterRestore (): Promise<void> {
    if (this.contextState === 'destroyed') return

    this.initializeContext()
    this.initializeResources()
    this.contextState = 'ready'

    const animation = this.animation
    if (animation !== null) {
      this.resize(animation.size.width, animation.size.height)
      await this.uploadStaticResources(animation)
    }

    this.restoreError = null
  }

  private initializeContext (): void {
    const gl = this.canvas.getContext('webgl') ?? this.canvas.getContext('experimental-webgl')
    if (gl === null) throw new Error('[SVGA WebGL Unsupported] WebGL context is unavailable')
    this.gl = gl as WebGLRenderingContext
  }

  private initializeResources (): void {
    const gl = this.getGl()
    const program = createProgram(gl, VERTEX_SOURCE, FRAGMENT_SOURCE)
    const solidProgram = createProgram(gl, SOLID_VERTEX_SOURCE, SOLID_FRAGMENT_SOURCE)
    const positionBuffer = gl.createBuffer()
    const texCoordBuffer = gl.createBuffer()

    if (positionBuffer === null || texCoordBuffer === null) {
      throw new Error('[SVGA WebGL] Unable to create buffers')
    }

    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
    const matrixLocation = gl.getUniformLocation(program, 'u_matrix')
    const alphaLocation = gl.getUniformLocation(program, 'u_alpha')
    const solidResolutionLocation = gl.getUniformLocation(solidProgram, 'u_resolution')
    const solidMatrixLocation = gl.getUniformLocation(solidProgram, 'u_matrix')
    const solidColorLocation = gl.getUniformLocation(solidProgram, 'u_color')
    if (
      resolutionLocation === null ||
      matrixLocation === null ||
      alphaLocation === null ||
      solidResolutionLocation === null ||
      solidMatrixLocation === null ||
      solidColorLocation === null
    ) {
      throw new Error('[SVGA WebGL] Unable to resolve shader uniforms')
    }

    this.program = program
    this.solidProgram = solidProgram
    this.positionBuffer = positionBuffer
    this.texCoordBuffer = texCoordBuffer
    this.positionLocation = gl.getAttribLocation(program, 'a_position')
    this.texCoordLocation = gl.getAttribLocation(program, 'a_texCoord')
    this.solidPositionLocation = gl.getAttribLocation(solidProgram, 'a_position')
    this.resolutionLocation = resolutionLocation
    this.matrixLocation = matrixLocation
    this.alphaLocation = alphaLocation
    this.solidResolutionLocation = solidResolutionLocation
    this.solidMatrixLocation = solidMatrixLocation
    this.solidColorLocation = solidColorLocation

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, TEX_COORDS, gl.STATIC_DRAW)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
  }

  private drawCommand (animation: CompiledAnimation, command: FrameRenderCommand): void {
    const replaceElement = animation.resources.replaceElements[command.imageKey]
    const dynamicElement = animation.resources.dynamicElements[command.imageKey]
    const baseTexture = replaceElement !== undefined ? this.createTexture(replaceElement) : this.textures[command.imageKey]

    if (baseTexture !== undefined) {
      this.drawTexture(baseTexture, command.layout, command.transform, command.alpha)
      if (replaceElement !== undefined) this.deleteTexture(baseTexture)
    }

    if (dynamicElement !== undefined) {
      const dynamicTexture = this.createTexture(dynamicElement)
      this.drawTexture(dynamicTexture, {
        x: (command.layout.width - dynamicElement.width) / 2,
        y: (command.layout.height - dynamicElement.height) / 2,
        width: dynamicElement.width,
        height: dynamicElement.height
      }, command.transform, command.alpha)
      this.deleteTexture(dynamicTexture)
    }

    command.shapes.forEach(shape => this.drawShape(animation, command, shape))
  }

  private drawShape (
    animation: CompiledAnimation,
    command: FrameRenderCommand,
    shape: ShapeRenderCommand
  ): void {
    const geometry = animation.geometries[shape.geometryId]
    if (geometry.type !== 'rect') return
    if (geometry.width <= 0 || geometry.height <= 0) return

    const transform = composeTransforms(command.transform, shape.transform)
    const isRoundedRect = geometry.cornerRadius > 0

    if (shape.styles.fill !== null) {
      const fillColor = parseRgbaColor(shape.styles.fill)
      const fillVertices = isRoundedRect
        ? drawRoundedRectVertices(geometry)
        : drawRectVertices(geometry)
      if (fillColor !== null) {
        if (fillVertices !== null) {
          this.drawSolidVertices(
            fillVertices,
            transform,
            [
              fillColor[0],
              fillColor[1],
              fillColor[2],
              fillColor[3] * command.alpha
            ]
          )
        }
      }
    }

    if (
      shape.styles.stroke === null ||
      shape.styles.strokeWidth === null ||
      shape.styles.lineCap !== null ||
      shape.styles.lineJoin !== null ||
      shape.styles.miterLimit !== null ||
      (shape.styles.lineDash !== null && shape.styles.lineDash.length > 0)
    ) {
      return
    }

    const strokeColor = parseRgbaColor(shape.styles.stroke)
    const strokeVertices = strokeColor === null
      ? null
      : isRoundedRect
        ? drawRoundedRectStrokeVertices(geometry, shape.styles.strokeWidth)
        : drawRectStrokeVertices(geometry, shape.styles.strokeWidth)
    if (strokeColor === null || strokeVertices === null) return

    this.drawSolidVertices(
      strokeVertices,
      transform,
      [
        strokeColor[0],
        strokeColor[1],
        strokeColor[2],
        strokeColor[3] * command.alpha
      ]
    )
  }

  private drawTexture (
    texture: TextureEntry,
    rect: Rect,
    transform: Transform | undefined,
    alpha: number
  ): void {
    const gl = this.getGl()
    const program = this.getProgram()
    const positionBuffer = this.getBuffer(this.positionBuffer, 'position')
    const texCoordBuffer = this.getBuffer(this.texCoordBuffer, 'texture coordinate')
    const resolutionLocation = this.getUniformLocation(this.resolutionLocation, 'u_resolution')
    const matrixLocation = this.getUniformLocation(this.matrixLocation, 'u_matrix')
    const alphaLocation = this.getUniformLocation(this.alphaLocation, 'u_alpha')

    gl.useProgram(program)
    gl.uniform2f(resolutionLocation, this.canvas.width, this.canvas.height)
    gl.bindTexture(gl.TEXTURE_2D, texture.texture)
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, drawRectVertices(rect), gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(this.positionLocation)
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer)
    gl.enableVertexAttribArray(this.texCoordLocation)
    gl.vertexAttribPointer(this.texCoordLocation, 2, gl.FLOAT, false, 0, 0)

    gl.uniformMatrix3fv(matrixLocation, false, transformMatrix(transform))
    gl.uniform1f(alphaLocation, alpha)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  private drawSolidVertices (
    vertices: Float32Array,
    transform: Transform | undefined,
    color: Color
  ): void {
    const gl = this.getGl()
    const program = this.getSolidProgram()
    const positionBuffer = this.getBuffer(this.positionBuffer, 'position')
    const resolutionLocation = this.getUniformLocation(this.solidResolutionLocation, 'u_resolution')
    const matrixLocation = this.getUniformLocation(this.solidMatrixLocation, 'u_matrix')
    const colorLocation = this.getUniformLocation(this.solidColorLocation, 'u_color')

    gl.useProgram(program)
    gl.uniform2f(resolutionLocation, this.canvas.width, this.canvas.height)
    if (this.texCoordLocation >= 0 && this.texCoordLocation !== this.solidPositionLocation) {
      gl.disableVertexAttribArray(this.texCoordLocation)
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(this.solidPositionLocation)
    gl.vertexAttribPointer(this.solidPositionLocation, 2, gl.FLOAT, false, 0, 0)
    gl.uniformMatrix3fv(matrixLocation, false, transformMatrix(transform))
    gl.uniform4f(colorLocation, color[0], color[1], color[2], color[3])
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 2)
  }

  private createTexture (source: Bitmap | ReplaceElement | DynamicElement): TextureEntry {
    const gl = this.getGl()
    const texture = gl.createTexture()
    if (texture === null) throw new Error('[SVGA WebGL] Unable to create texture')

    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as any)

    return {
      texture,
      width: source.width,
      height: source.height
    }
  }

  private disposeResources (canUseGl: boolean): void {
    if (canUseGl) {
      this.disposeTextures()

      const gl = this.gl
      if (gl !== null) {
        if (this.positionBuffer !== null) gl.deleteBuffer(this.positionBuffer)
        if (this.texCoordBuffer !== null) gl.deleteBuffer(this.texCoordBuffer)
        if (this.program !== null) gl.deleteProgram(this.program)
        if (this.solidProgram !== null) gl.deleteProgram(this.solidProgram)
      }
    }

    this.clearResourceReferences()
  }

  private disposeTextures (): void {
    Object.keys(this.textures).forEach(key => {
      this.deleteTexture(this.textures[key])
    })
    this.textures = {}
  }

  private deleteTexture (entry: TextureEntry): void {
    const gl = this.gl
    if (gl === null || gl.isContextLost()) return
    gl.deleteTexture(entry.texture)
  }

  private clearResourceReferences (): void {
    this.textures = {}
    this.program = null
    this.solidProgram = null
    this.positionBuffer = null
    this.texCoordBuffer = null
    this.positionLocation = -1
    this.texCoordLocation = -1
    this.solidPositionLocation = -1
    this.resolutionLocation = null
    this.matrixLocation = null
    this.alphaLocation = null
    this.solidResolutionLocation = null
    this.solidMatrixLocation = null
    this.solidColorLocation = null
  }

  private getGl (): WebGLRenderingContext {
    if (this.gl === null || this.gl.isContextLost()) {
      throw new Error('[SVGA WebGL] Context is not available')
    }
    return this.gl
  }

  private getProgram (): WebGLProgram {
    if (this.program === null) throw new Error('[SVGA WebGL] Program is not available')
    return this.program
  }

  private getSolidProgram (): WebGLProgram {
    if (this.solidProgram === null) throw new Error('[SVGA WebGL] Solid program is not available')
    return this.solidProgram
  }

  private getBuffer (buffer: WebGLBuffer | null, name: string): WebGLBuffer {
    if (buffer === null) throw new Error(`[SVGA WebGL] ${name} buffer is not available`)
    return buffer
  }

  private getUniformLocation (
    location: WebGLUniformLocation | null,
    name: string
  ): WebGLUniformLocation {
    if (location === null) throw new Error(`[SVGA WebGL] ${name} uniform is not available`)
    return location
  }
}
