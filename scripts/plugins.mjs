import { injectParser } from './inject-parser.mjs'

let inlineParserTimer = null

export const inlineParser = {
  name: 'inline-parser',
  load (id) {
    if (inlineParserTimer) clearTimeout(inlineParserTimer)
    inlineParserTimer = setTimeout(injectParser, 800)
  }
}
