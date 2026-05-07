import { injectParser } from './inject-parser.mjs'

export const inlineParser = {
  name: 'inline-parser',
  writeBundle () {
    injectParser()
  }
}
