import { readFile, rm } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import commonjs from '@rollup/plugin-commonjs'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser'
import typescript from '@rollup/plugin-typescript'
import { rollup } from 'rollup'
import ts from 'typescript'

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = resolve(projectDir, 'dist')
const tsconfigPath = resolve(projectDir, 'tsconfig.json')
const workerPlaceholder = '#PARSER_V2_INLINE_WROKER#'
const maxBundleRawBytes = 61440
const maxBundleGzipBytes = 18432

const inputPlugins = () => [
  nodeResolve({ browser: true, preferBuiltins: false }),
  commonjs(),
  typescript({
    tsconfig: tsconfigPath,
    compilerOptions: {
      declaration: false,
      declarationMap: false
    }
  })
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

const generateWorker = async () => {
  const bundle = await rollup({
    input: resolve(projectDir, 'src/parser/index.ts'),
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

const diagnosticHost = {
  getCanonicalFileName: fileName => fileName,
  getCurrentDirectory: () => projectDir,
  getNewLine: () => '\n'
}

const emitDeclarations = () => {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  if (configFile.error !== undefined) {
    throw new Error(ts.formatDiagnostic(configFile.error, diagnosticHost))
  }

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, projectDir)
  const sourceDir = resolve(projectDir, 'src')
  const sourceFiles = parsed.fileNames.filter(fileName => {
    const sourceRelativePath = relative(sourceDir, fileName)
    return sourceRelativePath !== '' && !sourceRelativePath.startsWith('..')
  })
  const program = ts.createProgram(sourceFiles, {
    ...parsed.options,
    declaration: true,
    declarationDir: distDir,
    declarationMap: false,
    emitDeclarationOnly: true,
    noEmit: false,
    rootDir: sourceDir
  })
  const diagnostics = ts.getPreEmitDiagnostics(program)
  if (diagnostics.length > 0) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, diagnosticHost))
  }

  const result = program.emit()
  if (result.emitSkipped) throw new Error('TypeScript skipped declaration emit')
}

await rm(distDir, { recursive: true, force: true })

const workerCode = await generateWorker()
const bundle = await rollup({
  input: resolve(projectDir, 'src/index.ts'),
  plugins: inputPlugins()
})

const outputs = [
  { file: 'index.min.js', format: 'umd', name: 'SVGA' },
  { file: 'index.cjs.min.js', format: 'cjs' },
  { file: 'index.esm.min.js', format: 'es' }
]

const verifyArtifacts = async () => {
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

emitDeclarations()
await verifyArtifacts()
