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
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { runInNewContext } from 'node:vm'
import { gzipSync } from 'node:zlib'

import { parse } from 'acorn'

const execFileAsync = promisify(execFile)
const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = resolve(projectDir, 'dist')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const expectedExports = ['DB', 'Parser', 'Player']
const maxBundleRawBytes = 90112
const maxBundleGzipBytes = 25600
const expectedPackFiles = [
  'LICENSE',
  'README.md',
  'THIRD_PARTY_NOTICES',
  'dist/db.d.ts',
  'dist/index.cjs',
  'dist/index.d.ts',
  'dist/index.min.js',
  'dist/index.mjs',
  'dist/parser.d.ts',
  'dist/player/index.d.ts',
  'dist/types.d.ts',
  'package.json'
].sort()

const require = createRequire(import.meta.url)
const typescriptPackagePath = require.resolve('typescript/package.json')
const typescriptPackage = JSON.parse(await readFile(typescriptPackagePath, 'utf8'))
const typescriptCli = resolve(dirname(typescriptPackagePath), typescriptPackage.bin.tsc)

async function runNpm (args, cwd = projectDir) {
  return await execFileAsync(npmCommand, args, {
    cwd,
    env: { ...process.env, CI: '1' },
    maxBuffer: 20 * 1024 * 1024
  })
}

async function runTypeScript (args, cwd) {
  return await execFileAsync(process.execPath, [typescriptCli, ...args], {
    cwd,
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
    ['dist/index.cjs', 2017, 'script'],
    ['dist/index.mjs', 2017, 'module']
  ]
  return Promise.all(syntaxTargets.map(async ([path, ecmaVersion, sourceType]) => {
    const source = await readFile(join(installedPackageDir, path), 'utf8')
    const program = parse(source, { ecmaVersion, sourceType })
    if (sourceType === 'module') {
      assert(program.body.some(node => node.type.startsWith('Export')), 'ESM bundle has no export syntax')
    }
  }))
}

async function verifyBundleSizes (installedPackageDir) {
  for (const path of ['dist/index.min.js', 'dist/index.cjs', 'dist/index.mjs']) {
    const bytes = await readFile(join(installedPackageDir, path))
    const rawSize = bytes.byteLength
    const gzipSize = gzipSync(bytes, { level: 9 }).byteLength
    assert(rawSize < maxBundleRawBytes, `${path} exceeds the 88 KiB raw bundle limit`)
    assert(gzipSize < maxBundleGzipBytes, `${path} exceeds the 25 KiB gzip bundle limit`)
  }
}

function assertExports (exports, format) {
  assert.deepEqual(Object.keys(exports).sort(), expectedExports, `${format} exports do not match the public API`)
}

function verifyCjsConsumer (consumerDir) {
  const requireFromConsumer = createRequire(join(consumerDir, 'verify-cjs.cjs'))
  assertExports(requireFromConsumer('svga'), 'CJS')
}

async function verifyEsmConsumer (consumerDir) {
  const entry = join(consumerDir, 'consumer.mjs')
  await writeFile(entry, "export { DB, Parser, Player } from 'svga'\n")
  assertExports(await import(pathToFileURL(entry).href), 'ESM')
}

async function verifyUmdConsumer (installedPackageDir) {
  const code = await readFile(join(installedPackageDir, 'dist/index.min.js'), 'utf8')
  const context = Object.create(null)
  context.globalThis = context
  context.self = context
  context.window = context
  runInNewContext(code, context, { filename: 'index.min.js' })
  assertExports(context.SVGA, 'UMD global')
}

async function verifyTypeScriptConsumer (consumerDir) {
  await writeFile(join(consumerDir, 'consumer.ts'), [
    "import { DB, Parser, Player, type DBOptions, type ParserConfigOptions, type PlayerConfig, type PlayerConfigOptions, type Video } from 'svga'",
    'const publicApi: [typeof DB, typeof Parser, typeof Player] = [DB, Parser, Player]',
    'declare const publicTypes: [DBOptions, ParserConfigOptions, PlayerConfig, PlayerConfigOptions, Video]',
    "const options: PlayerConfigOptions = { container: document.createElement('canvas'), fillMode: 'backwards', playMode: 'fallbacks' }",
    'new Player(options)',
    'void publicApi',
    'void publicTypes',
    ''
  ].join('\n'))
  await writeFile(join(consumerDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      lib: ['ES2017', 'DOM'],
      module: 'ESNext',
      moduleResolution: 'bundler',
      noEmit: true,
      strict: true,
      target: 'ES2017'
    },
    files: ['consumer.ts']
  }, null, 2))
  await runTypeScript(['--project', 'tsconfig.json'], consumerDir)
}

async function verifyDeepImportsAreRejected (consumerDir) {
  const requireFromConsumer = createRequire(join(consumerDir, 'verify-deep-import.cjs'))
  assert.throws(
    () => requireFromConsumer('svga/dist/db'),
    error => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    'CommonJS deep import was not rejected'
  )
  await assert.rejects(
    import('svga/dist/db'),
    error => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    'ESM deep import was not rejected'
  )
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
  await verifyBundleSizes(installedPackageDir)
  verifyCjsConsumer(consumerDir)
  await verifyEsmConsumer(consumerDir)
  await verifyUmdConsumer(installedPackageDir)
  await verifyTypeScriptConsumer(consumerDir)
  await verifyDeepImportsAreRejected(consumerDir)
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
    await verifyPackedConsumer(join(packDir, packResult[0].filename), tempDir)
    console.log(`Package verification passed: ${build.length} deterministic build files, ${packFiles.length} packed files`)
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
}

await main()
