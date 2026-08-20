import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { gzipSync } from 'node:zlib'

const executeFile = promisify(execFile)
const numericIdentifier = '(?:0|[1-9]\\d*)'
const prereleaseIdentifier = '(?:0|[1-9]\\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)'
const strictSemver = new RegExp(`^${numericIdentifier}\\.${numericIdentifier}\\.${numericIdentifier}(?:-${prereleaseIdentifier}(?:\\.${prereleaseIdentifier})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`)

function allowedBaseline (baseline) {
  return baseline === 'latest' || baseline === 'local' || strictSemver.test(baseline)
}

export function parseBaselineOptions (arguments_ = []) {
  if (arguments_.length === 0) return { baseline: 'latest' }
  if (arguments_.length !== 2 || arguments_[0] !== '--baseline') {
    throw new Error('Usage: --baseline <latest|local|exact semver>')
  }

  const baseline = arguments_[1]
  if (allowedBaseline(baseline)) return { baseline }
  throw new Error('Baseline must be latest, local, or an exact semver')
}

async function defaultRun (command, arguments_, options = {}) {
  const { stdout } = await executeFile(command, arguments_, {
    cwd: options.cwd,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true
  })
  return stdout
}

function packageIntegrity (bytes) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`
}

async function readJson (path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

async function inspectRuntime (directory, metadata) {
  const manifest = await readJson(join(directory, 'package.json'))
  if (!manifest || manifest.name !== 'svga' || typeof manifest.version !== 'string') return null
  if (metadata.expectedVersion && manifest.version !== metadata.expectedVersion) return null
  const file = join(directory, 'dist/index.min.js')
  let bytes
  try {
    bytes = await readFile(file)
  } catch {
    return null
  }

  const runtime = {
    version: manifest.version,
    source: metadata.source,
    url: metadata.url,
    bytes: bytes.length,
    gzipBytes: gzipSync(bytes).length,
    integrity: metadata.integrity || packageIntegrity(bytes),
    cacheState: metadata.cacheState,
    ...(metadata.onlineConfirmed === undefined ? {} : { onlineConfirmed: metadata.onlineConfirmed }),
    ...(metadata.warning ? { warning: metadata.warning } : {}),
  }
  Object.defineProperty(runtime, 'runtimePath', { value: file, enumerable: false, writable: true })
  return runtime
}

async function localVersion (projectDir) {
  const manifest = await readJson(join(projectDir, 'package.json'))
  return manifest?.name === 'svga' && typeof manifest.version === 'string' ? manifest.version : null
}

async function metadataForDirectory ({ directory, expectedVersion, source, url, cacheState, integrity, onlineConfirmed, projectDir }) {
  const runtime = await inspectRuntime(directory, { expectedVersion, source, url, cacheState, integrity, onlineConfirmed })
  if (!runtime) return null
  const currentVersion = await localVersion(projectDir)
  if (url === '/runtime/baseline.js' && currentVersion === runtime.version) runtime.warning = 'Baseline version is the same as local runtime.'
  return runtime
}

function readNpmMetadata (output) {
  const parsed = JSON.parse(String(output))
  const value = Array.isArray(parsed) ? parsed[0] : parsed
  const version = value?.version
  const integrity = value?.['dist.integrity'] || value?.dist?.integrity
  if (typeof version !== 'string' || !strictSemver.test(version) || typeof integrity !== 'string' || integrity.length === 0) {
    throw new Error('npm did not return a valid svga version and integrity')
  }
  return { version, integrity }
}

async function resolveFromNpm (spec, dependencies) {
  const output = await dependencies.run('npm', ['view', `svga@${spec}`, 'version', 'dist.integrity', '--json', '--ignore-scripts'], { cwd: dependencies.projectDir })
  return readNpmMetadata(output)
}

async function cacheLatest (cacheDir) {
  const latest = await readJson(join(cacheDir, 'latest.json'))
  if (!latest || !strictSemver.test(latest.version) || typeof latest.integrity !== 'string') return null
  return latest
}

async function writeLatest (cacheDir, latest) {
  await mkdir(cacheDir, { recursive: true })
  const path = join(cacheDir, 'latest.json')
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify({ ...latest, resolvedAt: new Date().toISOString() })}\n`)
  await rename(temporary, path)
}

function packedFilename (output) {
  const parsed = JSON.parse(String(output))
  const entry = Array.isArray(parsed) ? parsed[0] : parsed
  if (!entry || typeof entry.filename !== 'string' || basename(entry.filename) !== entry.filename) {
    throw new Error('npm pack did not return a package filename')
  }
  return entry.filename
}

async function downloadRuntime (version, integrity, dependencies) {
  const { cacheDir, projectDir, run } = dependencies
  const versionsDir = join(cacheDir, 'versions')
  const target = join(versionsDir, version)
  const staging = await mkdtemp(join(tmpdir(), `svga-visual-${process.pid}-`))
  const unpacked = join(staging, 'package')
  try {
    const packed = await run('npm', ['pack', `svga@${version}`, '--ignore-scripts', '--json', '--pack-destination', staging], { cwd: projectDir })
    const archive = join(staging, packedFilename(packed))
    await mkdir(unpacked, { recursive: true })
    await run('tar', ['-xzf', archive, '-C', unpacked, '--strip-components=1'], { cwd: projectDir })
    const validated = await metadataForDirectory({
      directory: unpacked, expectedVersion: version, source: 'npm', url: '/runtime/baseline.js',
      cacheState: 'downloaded', integrity, onlineConfirmed: true, projectDir
    })
    if (!validated) throw new Error('Downloaded package is not svga with a matching dist/index.min.js')
    await mkdir(versionsDir, { recursive: true })
    await rm(target, { force: true, recursive: true })
    await rename(unpacked, target)
    validated.runtimePath = join(target, 'dist/index.min.js')
    return validated
  } finally {
    await rm(staging, { force: true, recursive: true })
  }
}

export async function prepareBaselineRuntime (request, suppliedDependencies = {}) {
  const baseline = request?.baseline
  if (typeof baseline !== 'string' || !allowedBaseline(baseline)) {
    throw new Error('Baseline must be latest, local, or an exact semver')
  }
  const projectDir = resolve(suppliedDependencies.projectDir || resolve(import.meta.dirname, '..'))
  const cacheDir = resolve(suppliedDependencies.cacheDir || join(projectDir, 'node_modules/.cache/svga-visual'))
  const dependencies = { projectDir, cacheDir, run: suppliedDependencies.run || defaultRun }

  if (baseline === 'local') {
    return await metadataForDirectory({
      directory: projectDir, source: 'local', url: '/runtime/baseline.js', cacheState: 'local', projectDir
    })
  }

  if (baseline === 'latest') {
    try {
      const latest = await resolveFromNpm('latest', dependencies)
      const cached = await metadataForDirectory({
        directory: join(cacheDir, 'versions', latest.version), expectedVersion: latest.version, source: 'npm',
        url: '/runtime/baseline.js', cacheState: 'confirmed-cache', integrity: latest.integrity,
        onlineConfirmed: true, projectDir
      })
      const runtime = cached || await downloadRuntime(latest.version, latest.integrity, dependencies)
      await writeLatest(cacheDir, latest)
      return runtime
    } catch {
      const latest = await cacheLatest(cacheDir)
      if (!latest) return null
      return await metadataForDirectory({
        directory: join(cacheDir, 'versions', latest.version), expectedVersion: latest.version, source: 'npm',
        url: '/runtime/baseline.js', cacheState: 'stale-cache', integrity: latest.integrity,
        onlineConfirmed: false, projectDir
      })
    }
  }

  const cached = await metadataForDirectory({
    directory: join(cacheDir, 'versions', baseline), expectedVersion: baseline, source: 'npm',
    url: '/runtime/baseline.js', cacheState: 'cache', projectDir
  })
  if (cached) return cached

  try {
    const resolved = await resolveFromNpm(baseline, dependencies)
    if (resolved.version !== baseline) throw new Error('npm resolved a version different from the requested baseline')
    return await downloadRuntime(resolved.version, resolved.integrity, dependencies)
  } catch {
    return null
  }
}

async function gitValue (run, projectDir, arguments_) {
  try {
    return String(await run('git', arguments_, { cwd: projectDir })).trim()
  } catch {
    return null
  }
}

export async function createRuntimeMetadata (suppliedDependencies = {}) {
  const projectDir = resolve(suppliedDependencies.projectDir || resolve(import.meta.dirname, '..'))
  const run = suppliedDependencies.run || defaultRun
  const runtime = await metadataForDirectory({
    directory: projectDir, source: 'local', url: '/runtime/local.js', cacheState: 'local', projectDir
  })
  if (!runtime) throw new Error('Local svga runtime dist/index.min.js is unavailable or invalid')
  runtime.gitCommit = await gitValue(run, projectDir, ['rev-parse', '--short', 'HEAD'])
  const status = await gitValue(run, projectDir, ['status', '--porcelain'])
  runtime.dirty = status === null ? null : status.length > 0
  return runtime
}
