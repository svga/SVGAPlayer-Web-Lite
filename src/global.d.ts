import { MockWebWorker } from './types'

declare global {
  interface Window {
    SVGAParserMockWorker: undefined | MockWebWorker
    Parser?: typeof import('./index').Parser
    Player?: typeof import('./index').Player
    DB?: typeof import('./index').DB
    start?: () => void
    pause?: () => void
    resume?: () => void
    clear?: () => void
    destroy?: () => void
  }
}
