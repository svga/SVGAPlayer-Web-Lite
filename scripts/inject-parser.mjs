import fs from 'fs'
import glob from 'glob'

const IS_TEST_ENV = process.env.NODE_ENV === 'test'
const IS_PRODUCTION_ENV = process.env.NODE_ENV === 'production'

export const injectParser = () => {
  const queue = []

  if (IS_TEST_ENV) {
    queue.push({
      parserFile: '__test__/parser.js',
      indexFile: '__test__/index.js',
      distFile: '__test__/test.js'
    })
  }

  if (IS_PRODUCTION_ENV) {
    for (const item of glob.sync('dist/index.*')) {
      queue.push({
        parserFile: 'dist/parser.js',
        indexFile: item,
        distFile: item
      })
    }
  }

  for (const item of queue) {
    const parserCode = fs.readFileSync(item.parserFile, 'utf8')
    const indexCode = fs.readFileSync(item.indexFile, 'utf8')
    const distCode = JSON.stringify(parserCode).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
    fs.writeFileSync(item.distFile, indexCode.replace('"#PARSER_V2_INLINE_WROKER#"', distCode).replace('\'#PARSER_V2_INLINE_WROKER#\'', distCode), 'utf8')
  }
}

if (IS_PRODUCTION_ENV) injectParser()
