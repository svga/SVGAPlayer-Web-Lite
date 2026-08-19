import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

import { parse } from 'acorn'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import { rollup } from 'rollup'
import ts from 'typescript'

const execFileAsync = promisify(execFile)
const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = resolve(projectDir, 'dist')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const expectedExports = ['DB', 'Parser', 'Player']
const expectedPackFiles = [
  'LICENSE',
  'README.md',
  'THIRD_PARTY_NOTICES',
  'dist/db.d.ts',
  'dist/index.cjs.min.js',
  'dist/index.d.ts',
  'dist/index.esm.min.js',
  'dist/index.min.js',
  'dist/parser.d.ts',
  'dist/parser/index.d.ts',
  'dist/parser/svga-proto.d.ts',
  'dist/parser/video-entity.d.ts',
  'dist/player/animator.d.ts',
  'dist/player/index.d.ts',
  'dist/player/render.d.ts',
  'dist/test.d.ts',
  'dist/types.d.ts',
  'dist/utils.d.ts',
  'package.json'
].sort()

async function runNpm (args, cwd = projectDir) {
  return await execFileAsync(npmCommand, args, {
    cwd,
    env: { ...process.env, CI: '1' },
    maxBuffer: 20 * 1024 * 1024
  })
}

async function listFiles (directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listFiles(path))
    else if (entry.isFile()) files.push(path)
  }
  return files.sort()
}

async function snapshotBuild () {
  const files = await listFiles(distDir)
  return await Promise.all(files.map(async path => {
    const bytes = await readFile(path)
    return {
      path: relative(distDir, path).replaceAll('\\', '/'),
      sha256: createHash('sha256').update(bytes).digest('hex')
    }
  }))
}

async function verifyDeterministicBuilds () {
  await runNpm(['run', 'build'])
  const first = await snapshotBuild()
  await runNpm(['run', 'build'])
  const second = await snapshotBuild()
  assert.deepEqual(second, first, 'Two consecutive builds produced different files or hashes')
  return first
}

function verifySyntax (installedPackageDir) {
  const syntaxTargets = [
    ['dist/index.min.js', 2017, 'script'],
    ['dist/index.cjs.min.js', 2017, 'script'],
    ['dist/index.esm.min.js', 2017, 'module']
  ]
  return Promise.all(syntaxTargets.map(async ([path, ecmaVersion, sourceType]) => {
    const source = await readFile(join(installedPackageDir, path), 'utf8')
    const program = parse(source, { ecmaVersion, sourceType })
    if (sourceType === 'module') {
      assert(program.body.some(node => node.type.startsWith('Export')), 'ESM bundle has no export syntax')
    }
  }))
}

function verifyCjsConsumer (consumerDir) {
  const requireFromConsumer = createRequire(join(consumerDir, 'verify-cjs.cjs'))
  const exports = requireFromConsumer('svga')
  assert.deepEqual(Object.keys(exports).sort(), expectedExports, 'CJS exports do not match the public API')
}

async function verifyEsmConsumer (consumerDir) {
  const entry = join(consumerDir, 'consumer.mjs')
  const warnings = []
  await writeFile(entry, [
    "import { DB, Parser, Player } from 'svga'",
    'export { DB, Parser, Player }',
    ''
  ].join('\n'))
  const bundle = await rollup({
    input: entry,
    onwarn (warning) {
      warnings.push(warning)
    },
    plugins: [nodeResolve({ browser: true, preferBuiltins: false })]
  })
  try {
    const { output } = await bundle.generate({ format: 'es' })
    const unexpectedWarnings = warnings.filter(warning => warning.code !== 'EVAL')
    assert.deepEqual(
      unexpectedWarnings,
      [],
      `ESM consumer emitted unexpected Rollup warnings: ${unexpectedWarnings.map(warning => warning.message).join('; ')}`
    )
    const chunks = output.filter(item => item.type === 'chunk')
    assert.equal(chunks.length, 1, 'ESM consumer did not produce exactly one bundle')
    assert.deepEqual(chunks[0].exports.sort(), expectedExports, 'ESM consumer exports do not match the public API')
    parse(chunks[0].code, { ecmaVersion: 'latest', sourceType: 'module' })
  } finally {
    await bundle.close()
  }
}

async function verifyUmdConsumer (installedPackageDir) {
  const code = await readFile(join(installedPackageDir, 'dist/index.min.js'), 'utf8')
  const context = Object.create(null)
  context.globalThis = context
  context.self = context
  context.window = context
  runInNewContext(code, context, { filename: 'index.min.js' })
  assert.deepEqual(Object.keys(context.SVGA).sort(), expectedExports, 'UMD global exports do not match the public API')
}

async function verifyTypeScriptConsumer (consumerDir) {
  const entry = join(consumerDir, 'consumer.ts')
  const outputDir = join(consumerDir, 'typescript-output')
  await writeFile(entry, `
import { DB, Parser, Player } from 'svga'
import { DB as DeepDB } from 'svga/dist/db'
import { Parser as DeepParser } from 'svga/dist/parser'
import 'svga/dist/parser/index'
import proto from 'svga/dist/parser/svga-proto'
import { VideoEntity } from 'svga/dist/parser/video-entity'
import { Animator } from 'svga/dist/player/animator'
import { Player as DeepPlayer } from 'svga/dist/player/index'
import render from 'svga/dist/player/render'
import 'svga/dist/test'
import type { ParserConfigOptions, Video } from 'svga/dist/types'
import { Utils } from 'svga/dist/utils'

const options: ParserConfigOptions = { isDisableWebWorker: true }
const parser: Parser = new DeepParser(options)
const database: DB = new DeepDB()
const player: Player = new DeepPlayer(document.createElement('canvas'))
const publicApi: [typeof DB, typeof Parser, typeof Player] = [DB, Parser, Player]
const video: Video | undefined = player.videoEntity
const declarations = [proto, VideoEntity, Animator, render, Utils, publicApi, video]
void [parser, database, declarations]
`)
  const program = ts.createProgram([entry], {
    lib: ['lib.es2017.d.ts', 'lib.dom.d.ts', 'lib.webworker.d.ts'],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmitOnError: true,
    outDir: outputDir,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2017
  })
  const emitted = program.emit()
  const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emitted.diagnostics]
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: fileName => fileName,
      getCurrentDirectory: () => consumerDir,
      getNewLine: () => '\n'
    })
  )
  assert.equal(emitted.emitSkipped, false, 'TypeScript consumer emit was skipped')
}

async function verifyPackedConsumer (archive, tempDir) {
  const consumerDir = join(tempDir, 'consumer')
  await mkdir(consumerDir)
  await writeFile(join(consumerDir, 'package.json'), JSON.stringify({
    name: 'svga-package-consumer',
    private: true,
    version: '1.0.0'
  }, null, 2))
  await runNpm([
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--no-package-lock',
    '--omit=dev',
    archive
  ], consumerDir)

  const installedPackageDir = join(consumerDir, 'node_modules/svga')
  await verifySyntax(installedPackageDir)
  verifyCjsConsumer(consumerDir)
  await verifyEsmConsumer(consumerDir)
  await verifyUmdConsumer(installedPackageDir)
  await verifyTypeScriptConsumer(consumerDir)
}

async function main () {
  const tempDir = await mkdtemp(join(tmpdir(), 'svga-package-'))
  try {
    const build = await verifyDeterministicBuilds()
    const packDir = join(tempDir, 'pack')
    await mkdir(packDir)
    const { stdout } = await runNpm([
      'pack',
      '--json',
      '--ignore-scripts',
      '--pack-destination',
      packDir
    ])
    const parsedPackResult = JSON.parse(stdout)
    const packResult = Array.isArray(parsedPackResult)
      ? parsedPackResult
      : Object.values(parsedPackResult)
    assert.equal(packResult.length, 1, 'npm pack did not produce exactly one archive')
    const packFiles = packResult[0].files.map(file => file.path).sort()
    assert.deepEqual(packFiles, expectedPackFiles, 'npm pack file list is not exact')
    const archive = join(packDir, packResult[0].filename)
    await verifyPackedConsumer(archive, tempDir)
    console.log(`Package verification passed: ${build.length} deterministic build files, ${packFiles.length} packed files`)
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
}

await main()
