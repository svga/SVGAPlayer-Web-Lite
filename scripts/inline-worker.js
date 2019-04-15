const path = require('path')
const fs = require('fs-extra')
const del = require('del')

module.exports = function (env) {
  const coreFile = path.resolve(__dirname, `../${env === 'test' ? 'tests' : ''}/svga.lite.min.js`)
  const parserWorkerFile = path.resolve(__dirname, `../${env === 'test' ? 'tests' : ''}/parser.worker.min.js`)
  const parser1xFile = path.resolve(__dirname, `../${env === 'test' ? 'tests' : ''}/parser.1x.js`)
  const parser1xWorkerFile = path.resolve(__dirname, `../${env === 'test' ? 'tests' : ''}/parser1x.worker.min.js`)

  const distFile = env === 'test' ? path.resolve(__dirname, '../tests/svga.lite.min.js') : coreFile
  const distParser1xFile = env === 'test' ? path.resolve(__dirname, '../tests/parser.1x.js') : parser1xFile

  const core = fs.readFileSync(coreFile, 'utf8')
  const parserWorker = fs.readFileSync(parserWorkerFile, 'utf8')
  const parser1x = fs.readFileSync(parser1xFile, 'utf8')
  const parser1xWorker = fs.readFileSync(parser1xWorkerFile, 'utf8')

  fs.writeFileSync(distFile, core.replace('"#INLINE_PARSER_WROKER#"', JSON.stringify(parserWorker).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')), 'utf8')
  fs.writeFileSync(distParser1xFile, parser1x.replace('"#INLINE_PARSER1x_WROKER#"', JSON.stringify(parser1xWorker).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')), 'utf8')

  env !== 'test' && del.sync(parserWorkerFile, { force: true })
  env !== 'test' && del.sync(parser1xWorkerFile, { force: true })
}
