import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { runInNewContext } from 'node:vm'
import { gzipSync } from 'node:zlib'

import { parse } from 'acorn'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import { rollup } from 'rollup'

import {
  distDir,
  EXPECTED_EXPORTS,
  EXPECTED_PACK_FILES,
  MAX_BUNDLE_GZIP_BYTES,
  MAX_BUNDLE_RAW_BYTES,
  MAX_TARBALL_BYTES,
  MAX_UNPACKED_BYTES,
  projectDir,
} from './lib/contract.mjs'

const execFileAsync = promisify(execFile)
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const require = createRequire(import.meta.url)
const typescriptPackagePath = require.resolve('typescript/package.json')
const typescriptPackage = JSON.parse(await readFile(typescriptPackagePath, 'utf8'))
const typescriptCli = resolve(dirname(typescriptPackagePath), typescriptPackage.bin.tsc)

async function runNpm(args, cwd = projectDir) {
  return await execFileAsync(npmCommand, args, {
    cwd,
    env: { ...process.env, CI: '1' },
    maxBuffer: 20 * 1024 * 1024,
  })
}

async function runTypeScript(args, cwd) {
  return await execFileAsync(process.execPath, [typescriptCli, ...args], {
    cwd,
    maxBuffer: 20 * 1024 * 1024,
  })
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await listFiles(path)))
    else if (entry.isFile()) files.push(path)
  }
  return files.sort()
}

async function snapshotBuild() {
  const files = await listFiles(distDir)
  return await Promise.all(
    files.map(async (path) => {
      const bytes = await readFile(path)
      return {
        path: relative(distDir, path).replaceAll('\\', '/'),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      }
    }),
  )
}

async function verifyDeterministicBuilds() {
  await runNpm(['run', 'build'])
  const first = await snapshotBuild()
  await runNpm(['run', 'build'])
  const second = await snapshotBuild()
  assert.deepEqual(second, first, 'Two consecutive builds produced different files or hashes')
  return first
}

function verifySyntax(installedPackageDir) {
  const syntaxTargets = [
    ['dist/index.min.js', 2017, 'script'],
    ['dist/index.cjs', 2017, 'script'],
    ['dist/index.mjs', 2017, 'module'],
  ]
  return Promise.all(
    syntaxTargets.map(async ([path, ecmaVersion, sourceType]) => {
      const source = await readFile(join(installedPackageDir, path), 'utf8')
      const program = parse(source, { ecmaVersion, sourceType })
      if (sourceType === 'module') {
        assert(
          program.body.some((node) => node.type.startsWith('Export')),
          'ESM bundle has no export syntax',
        )
      }
    }),
  )
}

async function verifyBundleSizes(installedPackageDir) {
  for (const path of ['dist/index.min.js', 'dist/index.cjs', 'dist/index.mjs']) {
    const bytes = await readFile(join(installedPackageDir, path))
    const rawSize = bytes.byteLength
    const gzipSize = gzipSync(bytes, { level: 9 }).byteLength
    assert(rawSize < MAX_BUNDLE_RAW_BYTES, `${path} exceeds the 88 KiB raw bundle limit`)
    assert(gzipSize < MAX_BUNDLE_GZIP_BYTES, `${path} exceeds the 25 KiB gzip bundle limit`)
  }
}

function assertExports(exports, format) {
  assert.deepEqual(
    Object.keys(exports).sort(),
    EXPECTED_EXPORTS,
    `${format} exports do not match the public API`,
  )
}

function verifyCjsConsumer(consumerDir) {
  const requireFromConsumer = createRequire(join(consumerDir, 'verify-cjs.cjs'))
  assertExports(requireFromConsumer('svga'), 'CJS')
}

async function verifyEsmConsumer(consumerDir) {
  const entry = join(consumerDir, 'consumer.mjs')
  await writeFile(entry, "export { DB, Parser, Player } from 'svga'\n")
  assertExports(await import(pathToFileURL(entry).href), 'ESM')
}

async function verifyUmdConsumer(installedPackageDir) {
  const code = await readFile(join(installedPackageDir, 'dist/index.min.js'), 'utf8')
  const context = Object.create(null)
  context.globalThis = context
  context.self = context
  context.window = context
  runInNewContext(code, context, { filename: 'index.min.js' })
  assertExports(context.SVGA, 'UMD global')
}

const consumerSource = [
  "import { DB, Parser, Player, type DBOptions, type ParserConfigOptions, type ParserLoadOptions, type ParserProgress, type PlayerConfig, type PlayerConfigOptions, type PlayerState, type Video } from 'svga'",
  'const publicApi: [typeof DB, typeof Parser, typeof Player] = [DB, Parser, Player]',
  'declare const publicTypes: [DBOptions, ParserConfigOptions, ParserLoadOptions, ParserProgress, PlayerConfig, PlayerConfigOptions, PlayerState, Video]',
  "const options: PlayerConfigOptions = { container: document.createElement('canvas'), fillMode: 'backwards', playMode: 'fallbacks', isDisableOffscreenCanvas: true }",
  'const player = new Player(options)',
  'const progress: number = player.progress',
  'const state: PlayerState = player.state',
  'const playing: boolean = player.isPlaying',
  'player.onProcess = value => { const current: number = value; void current }',
  'player.onProcess = () => {}',
  'player.stepToFrame(0)',
  'player.setConfig({ isDisableOffscreenCanvas: false })',
  'void progress',
  'void state',
  'void playing',
  'void publicApi',
  'void publicTypes',
  '',
].join('\n')

async function verifyTypeScriptConsumer(consumerDir) {
  await writeFile(join(consumerDir, 'consumer.ts'), consumerSource)
  await writeFile(join(consumerDir, 'consumer.mts'), consumerSource)
  await writeFile(
    join(consumerDir, 'consumer-deep-import.ts'),
    [
      '// @ts-expect-error svga exposes only its root entry point',
      "import 'svga/dist/index.mjs'",
      '',
    ].join('\n'),
  )
  const matrix = [
    { name: 'bundler', entry: 'consumer.ts', module: 'ESNext', moduleResolution: 'bundler' },
    { name: 'node16', entry: 'consumer.ts', module: 'Node16', moduleResolution: 'Node16' },
    { name: 'node16-esm', entry: 'consumer.mts', module: 'Node16', moduleResolution: 'Node16' },
    { name: 'nodenext', entry: 'consumer.mts', module: 'NodeNext', moduleResolution: 'NodeNext' },
    {
      name: 'nodenext-cjs',
      entry: 'consumer.ts',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
    },
  ]
  for (const variant of matrix) {
    await writeFile(
      join(consumerDir, `tsconfig.${variant.name}.json`),
      JSON.stringify(
        {
          compilerOptions: {
            lib: ['ES2017', 'DOM'],
            module: variant.module,
            moduleResolution: variant.moduleResolution,
            noEmit: true,
            strict: true,
            target: 'ES2017',
          },
          files: [variant.entry, 'consumer-deep-import.ts'],
        },
        null,
        2,
      ),
    )
    await runTypeScript(['--project', `tsconfig.${variant.name}.json`], consumerDir)
  }
}

async function verifyRollupConsumer(consumerDir) {
  const entry = join(consumerDir, 'rollup-consumer.mjs')
  await writeFile(
    entry,
    [
      "import { Player } from 'svga'",
      'export const createPlayer = canvas => new Player({ container: canvas, isDisableOffscreenCanvas: true })',
      '',
    ].join('\n'),
  )
  const warnings = []
  const bundle = await rollup({
    input: entry,
    onwarn: (warning) => warnings.push(warning.message),
    plugins: [
      nodeResolve({
        browser: true,
        modulePaths: [join(consumerDir, 'node_modules')],
        preferBuiltins: false,
      }),
    ],
  })
  try {
    const generated = await bundle.generate({ format: 'es' })
    const chunks = generated.output.filter((output) => output.type === 'chunk')
    assert.equal(chunks.length, 1, 'Rollup consumer did not produce exactly one JavaScript chunk')
    assert.deepEqual(chunks[0].imports, [], 'Rollup consumer left unresolved imports')
    assert.deepEqual(
      chunks[0].exports,
      ['createPlayer'],
      'Rollup consumer lost its public entry export',
    )
    assert.equal(warnings.length, 0, `Rollup consumer emitted warnings: ${warnings.join('; ')}`)
  } finally {
    await bundle.close()
  }
}

const viteConfigSource = [
  'export default {',
  "  build: { emptyOutDir: true, outDir: process.env.SVGA_VITE_OUT, target: 'es2017' },",
  "  logLevel: 'warn',",
  '}',
  '',
].join('\n')

const viteAppSource = [
  "import { Player, type PlayerConfigOptions } from 'svga'",
  "const canvas = document.createElement('canvas')",
  'const options: PlayerConfigOptions = { container: canvas, isDisableOffscreenCanvas: true }',
  'const player = new Player(options)',
  'player.onProcess = progress => { document.body.dataset.progress = String(progress) }',
  'player.setConfig({ isDisableOffscreenCanvas: false })',
  "document.querySelector('#app')?.append(canvas)",
  'void player.progress',
  'void player.state',
  '',
].join('\n')

async function prepareViteConsumer(consumerDir) {
  await mkdir(join(consumerDir, 'src'), { recursive: true })
  await writeFile(
    join(consumerDir, 'index.html'),
    '<!doctype html><div id="app"></div><script type="module" src="/src/main.ts"></script>\n',
  )
  await writeFile(join(consumerDir, 'src/main.ts'), viteAppSource)
  await writeFile(join(consumerDir, 'vite.config.mjs'), viteConfigSource)
}

async function verifyViteConsumer(consumerDir, label, cli) {
  const outDir = `dist-${label}`
  await execFileAsync(process.execPath, [cli, 'build', '--config', 'vite.config.mjs'], {
    cwd: consumerDir,
    env: { ...process.env, SVGA_VITE_OUT: outDir },
    maxBuffer: 20 * 1024 * 1024,
  })
  const assets = await listFiles(join(consumerDir, outDir))
  assert(
    assets.some((path) => path.endsWith('.js')),
    `Vite ${label} consumer produced no JavaScript asset`,
  )
}

async function verifyWebpackConsumer(consumerDir) {
  const webpackCli = join(projectDir, 'node_modules/webpack-cli/bin/cli.js')
  await writeFile(
    join(consumerDir, 'webpack-entry.js'),
    [
      "import { Player } from 'svga'",
      'export const createPlayer = canvas => new Player({ container: canvas, isDisableOffscreenCanvas: true })',
      '',
    ].join('\n'),
  )
  await writeFile(
    join(consumerDir, 'webpack.config.cjs'),
    [
      "const { resolve } = require('node:path')",
      'module.exports = {',
      "  mode: 'production',",
      "  target: ['web', 'es2017'],",
      "  entry: resolve(__dirname, 'webpack-entry.js'),",
      "  output: { filename: 'bundle.js', path: resolve(__dirname, 'dist-webpack') },",
      '}',
      '',
    ].join('\n'),
  )
  await execFileAsync(process.execPath, [webpackCli, '--config', 'webpack.config.cjs'], {
    cwd: consumerDir,
    maxBuffer: 20 * 1024 * 1024,
  })
  const assets = await listFiles(join(consumerDir, 'dist-webpack'))
  assert(
    assets.some((path) => path.endsWith('.js')),
    'Webpack 5 consumer produced no JavaScript asset',
  )
}

async function verifyPackageLinters(archive) {
  await execFileAsync(process.execPath, [
    join(projectDir, 'node_modules/publint/src/cli.js'),
    archive,
    '--strict',
  ])
  const { stdout } = await execFileAsync(process.execPath, [
    join(projectDir, 'node_modules/@arethetypeswrong/cli/dist/index.js'),
    archive,
    '--profile',
    'strict',
    '--no-emoji',
    '--no-color',
  ])
  assert(stdout.includes('No problems found'), `Are the types wrong reported problems:\n${stdout}`)
}

async function verifyDeepImportsAreRejected(consumerDir) {
  const requireFromConsumer = createRequire(join(consumerDir, 'verify-deep-import.cjs'))
  assert.throws(
    () => requireFromConsumer('svga/dist/db'),
    (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    'CommonJS deep import was not rejected',
  )
  await assert.rejects(
    import('svga/dist/db'),
    (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    'ESM deep import was not rejected',
  )
}

async function verifyPackedConsumer(archive, tempDir) {
  const consumerDir = join(tempDir, 'consumer')
  await mkdir(consumerDir)
  await writeFile(
    join(consumerDir, 'package.json'),
    JSON.stringify(
      {
        name: 'svga-package-consumer',
        private: true,
        version: '1.0.0',
      },
      null,
      2,
    ),
  )
  await runNpm(
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
      '--omit=dev',
      archive,
    ],
    consumerDir,
  )

  const installedPackageDir = join(consumerDir, 'node_modules/svga')
  await verifySyntax(installedPackageDir)
  await verifyBundleSizes(installedPackageDir)
  verifyCjsConsumer(consumerDir)
  await verifyEsmConsumer(consumerDir)
  await verifyUmdConsumer(installedPackageDir)
  await verifyTypeScriptConsumer(consumerDir)
  await verifyRollupConsumer(consumerDir)
  await prepareViteConsumer(consumerDir)
  await verifyViteConsumer(consumerDir, 'vite8', join(projectDir, 'node_modules/vite/bin/vite.js'))
  await verifyViteConsumer(consumerDir, 'vite4', join(projectDir, 'node_modules/vite4/bin/vite.js'))
  await verifyWebpackConsumer(consumerDir)
  await verifyDeepImportsAreRejected(consumerDir)
}

async function main() {
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
      packDir,
    ])
    const parsedPackResult = JSON.parse(stdout)
    const packResult = Array.isArray(parsedPackResult)
      ? parsedPackResult
      : Object.values(parsedPackResult)
    assert.equal(packResult.length, 1, 'npm pack did not produce exactly one archive')
    const manifest = packResult[0]
    const packFiles = manifest.files.map((file) => file.path).sort()
    assert.deepEqual(packFiles, EXPECTED_PACK_FILES, 'npm pack file list is not exact')
    assert(
      manifest.size < MAX_TARBALL_BYTES,
      `tarball exceeds the ${MAX_TARBALL_BYTES} byte budget`,
    )
    assert(
      manifest.unpackedSize < MAX_UNPACKED_BYTES,
      `unpacked package exceeds the ${MAX_UNPACKED_BYTES} byte budget`,
    )
    const archive = join(packDir, manifest.filename)
    const archiveHash = createHash('sha256')
      .update(await readFile(archive))
      .digest('hex')
    await verifyPackageLinters(archive)
    await verifyPackedConsumer(archive, tempDir)
    console.log(
      `Package verification passed: ${build.length} deterministic build files, ${packFiles.length} packed files`,
    )
    console.log(
      `Tarball: ${manifest.size} bytes raw, ${manifest.unpackedSize} bytes unpacked, sha256 ${archiveHash}`,
    )
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
}

await main()
