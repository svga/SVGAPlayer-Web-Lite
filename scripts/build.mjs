import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { gzipSync } from 'node:zlib'

import commonjs from '@rollup/plugin-commonjs'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser'
import { rollup } from 'rollup'

const execFileAsync = promisify(execFile)
const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = resolve(projectDir, 'dist')
const buildConfigPath = resolve(projectDir, 'tsconfig.build.json')
const projectNodeModules = resolve(projectDir, 'node_modules')
const workerPlaceholder = '#PARSER_V2_INLINE_WROKER#'
const maxBundleRawBytes = 90112
const maxBundleGzipBytes = 25600
const publicDeclarations = [
  'index.d.ts',
  'db.d.ts',
  'parser.d.ts',
  'player/index.d.ts',
  'types.d.ts'
]
const outputs = [
  { file: 'index.min.js', format: 'umd', name: 'SVGA' },
  { file: 'index.cjs', format: 'cjs' },
  { file: 'index.mjs', format: 'es' }
]

const require = createRequire(import.meta.url)
const typescriptPackagePath = require.resolve('typescript/package.json')
const typescriptPackage = JSON.parse(await readFile(typescriptPackagePath, 'utf8'))
const typescriptCli = resolve(dirname(typescriptPackagePath), typescriptPackage.bin.tsc)

const failOnWarning = warning => {
  throw new Error(`Rollup warning (${warning.code}): ${warning.message}`)
}

const inputPlugins = () => [
  nodeResolve({
    browser: true,
    preferBuiltins: false,
    modulePaths: [projectNodeModules]
  }),
  commonjs()
]

const minify = () => terser({
  compress: { ecma: 2017, inline: 1, passes: 2 },
  ecma: 2017,
  format: { ecma: 2017 },
  mangle: { eval: true }
})

const inlineWorker = workerCode => ({
  name: 'inline-parser-worker',
  renderChunk (code) {
    const quotedPlaceholders = [JSON.stringify(workerPlaceholder), `'${workerPlaceholder}'`]
    const matches = quotedPlaceholders.reduce((count, placeholder) => {
      return count + code.split(placeholder).length - 1
    }, 0)

    if (matches !== 1) {
      throw new Error(`Expected one inline worker placeholder, found ${matches}`)
    }

    const workerLiteral = JSON.stringify(workerCode)
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029')

    return {
      code: quotedPlaceholders.reduce(
        (output, placeholder) => output.replace(placeholder, workerLiteral),
        code
      ),
      map: null
    }
  }
})

const outputPlugins = workerCode => [
  inlineWorker(workerCode),
  minify()
]

async function emitTypeScript (temporaryDir) {
  const outputDir = resolve(temporaryDir, 'javascript')
  const declarationDir = resolve(temporaryDir, 'declarations')
  await execFileAsync(process.execPath, [
    typescriptCli,
    '--project', buildConfigPath,
    '--outDir', outputDir,
    '--declarationDir', declarationDir
  ], {
    cwd: projectDir,
    maxBuffer: 20 * 1024 * 1024
  })
  return { outputDir, declarationDir }
}

async function generateWorker (parserEntry) {
  const bundle = await rollup({
    input: parserEntry,
    onwarn: failOnWarning,
    plugins: inputPlugins()
  })

  try {
    const { output } = await bundle.generate({
      format: 'iife',
      plugins: [minify()]
    })
    const chunks = output.filter(item => item.type === 'chunk')
    if (chunks.length !== 1) throw new Error(`Expected one parser worker chunk, found ${chunks.length}`)
    return chunks[0].code
  } finally {
    await bundle.close()
  }
}

async function copyPublicDeclarations (declarationDir) {
  await Promise.all(publicDeclarations.map(file => readFile(resolve(declarationDir, file))))
  await Promise.all(publicDeclarations.map(async file => {
    const destination = resolve(distDir, file)
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(resolve(declarationDir, file), destination)
  }))
}

async function verifyArtifacts () {
  for (const output of outputs) {
    const bytes = await readFile(resolve(distDir, output.file))
    const rawSize = bytes.byteLength
    const gzipSize = gzipSync(bytes, { level: 9 }).byteLength
    if (bytes.includes(workerPlaceholder)) throw new Error(`${output.file} contains the worker placeholder`)
    if (rawSize >= maxBundleRawBytes || gzipSize >= maxBundleGzipBytes) {
      throw new Error(`${output.file} exceeds bundle limits: ${rawSize} raw / ${gzipSize} gzip`)
    }
  }
}

async function build () {
  const temporaryDir = await mkdtemp(resolve(tmpdir(), 'svga-build-'))
  try {
    const { outputDir, declarationDir } = await emitTypeScript(temporaryDir)
    const workerCode = await generateWorker(resolve(outputDir, 'parser/index.js'))
    await rm(distDir, { recursive: true, force: true })
    const bundle = await rollup({
      input: resolve(outputDir, 'index.js'),
      onwarn: failOnWarning,
      plugins: inputPlugins()
    })
    try {
      for (const output of outputs) {
        await bundle.write({
          exports: 'named',
          file: resolve(distDir, output.file),
          format: output.format,
          name: output.name,
          plugins: outputPlugins(workerCode),
          sourcemap: false
        })
      }
    } finally {
      await bundle.close()
    }
    await copyPublicDeclarations(declarationDir)
    await verifyArtifacts()
  } finally {
    await rm(temporaryDir, { force: true, recursive: true })
  }
}

await build()
