import {
  Bitmap,
  DynamicElement,
  Rect,
  ReplaceElement,
  Transform
} from '../../types'
import {
  CompiledAnimation,
  FrameRenderCommand,
  RenderCapabilities
} from '../compiler/types'
import { RenderBackend } from './types'

interface TextureEntry {
  texture: WebGLTexture
  width: number
  height: number
}

type WebGLContextState = 'ready' | 'lost' | 'failed' | 'destroyed'

function webglCapabilities (): RenderCapabilities {
  return {
    imageRendering: true,
    dynamicTextures: true,
    shapeFill: false,
    shapeFillHoles: false,
    shapeStroke: false,
    lineDash: false,
    masks: false,
    snapshot: false,
    unsupportedPathCommands: false
  }
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
  private positionBuffer: WebGLBuffer | null = null
  private texCoordBuffer: WebGLBuffer | null = null
  private textures: { [key: string]: TextureEntry } = {}
  private positionLocation: number = -1
  private texCoordLocation: number = -1
  private resolutionLocation: WebGLUniformLocation | null = null
  private matrixLocation: WebGLUniformLocation | null = null
  private alphaLocation: WebGLUniformLocation | null = null
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

    const gl = this.getGl()
    const program = this.getProgram()
    const resolutionLocation = this.getUniformLocation(this.resolutionLocation, 'u_resolution')
    this.clear()
    gl.useProgram(program)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.uniform2f(resolutionLocation, this.canvas.width, this.canvas.height)

    animation.frames[frame]?.forEach(command => this.drawCommand(animation, command))
  }

  public clear (): void {
    if (this.contextState !== 'ready') return
    const gl = this.getGl()
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
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
    const positionBuffer = gl.createBuffer()
    const texCoordBuffer = gl.createBuffer()

    if (positionBuffer === null || texCoordBuffer === null) {
      throw new Error('[SVGA WebGL] Unable to create buffers')
    }

    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
    const matrixLocation = gl.getUniformLocation(program, 'u_matrix')
    const alphaLocation = gl.getUniformLocation(program, 'u_alpha')
    if (resolutionLocation === null || matrixLocation === null || alphaLocation === null) {
      throw new Error('[SVGA WebGL] Unable to resolve shader uniforms')
    }

    this.program = program
    this.positionBuffer = positionBuffer
    this.texCoordBuffer = texCoordBuffer
    this.positionLocation = gl.getAttribLocation(program, 'a_position')
    this.texCoordLocation = gl.getAttribLocation(program, 'a_texCoord')
    this.resolutionLocation = resolutionLocation
    this.matrixLocation = matrixLocation
    this.alphaLocation = alphaLocation

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, TEX_COORDS, gl.STATIC_DRAW)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
  }

  private drawCommand (animation: CompiledAnimation, command: FrameRenderCommand): void {
    if (command.mask !== null || command.shapes.length > 0) {
      throw new Error('[SVGA WebGL Unsupported] Shapes and masks require CanvasBackend fallback')
    }

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
  }

  private drawTexture (
    texture: TextureEntry,
    rect: Rect,
    transform: Transform | undefined,
    alpha: number
  ): void {
    const gl = this.getGl()
    const positionBuffer = this.getBuffer(this.positionBuffer, 'position')
    const texCoordBuffer = this.getBuffer(this.texCoordBuffer, 'texture coordinate')
    const matrixLocation = this.getUniformLocation(this.matrixLocation, 'u_matrix')
    const alphaLocation = this.getUniformLocation(this.alphaLocation, 'u_alpha')

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
    this.positionBuffer = null
    this.texCoordBuffer = null
    this.positionLocation = -1
    this.texCoordLocation = -1
    this.resolutionLocation = null
    this.matrixLocation = null
    this.alphaLocation = null
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
