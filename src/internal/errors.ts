export type ParserErrorCode =
  | 'parser/destroyed'
  | 'parser/timeout'
  | 'parser/protocol'
  | 'parser/config'
  | 'parser/response'
  | 'parser/worker'
  | 'parser/fetch'
  | 'parser/limit'
  | 'parser/version'
  | 'parser/wire'
  | 'parser/decode'

export type PlayerErrorCode =
  | 'player/destroyed'
  | 'player/config'
  | 'player/image'
  | 'player/render'
  | 'player/video'

export type VideoErrorCode = `video/${string}`

export type DBErrorCode = 'db/failure'

export type SVGAErrorCode = ParserErrorCode | PlayerErrorCode | VideoErrorCode | DBErrorCode

/**
 * Base class for the library's typed failures. `name` stays `Error` so the
 * public error surface matches earlier releases; callers can branch on `code`.
 */
export class SVGAError<Code extends string = SVGAErrorCode> extends Error {
  readonly code: Code
  readonly cause?: unknown

  constructor(code: Code, message: string, cause?: unknown) {
    super(message)
    this.code = code
    if (cause !== undefined) this.cause = cause
  }
}

export class ParserError extends SVGAError<ParserErrorCode> {}
export class PlayerError extends SVGAError<PlayerErrorCode> {}
export class VideoError extends SVGAError<VideoErrorCode> {}
export class DBError extends SVGAError<DBErrorCode> {}
