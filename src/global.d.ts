import { MockWebWorker } from './types'

declare global {
  interface Window {
    SVGAParserMockWorker: undefined | MockWebWorker
  }
}
