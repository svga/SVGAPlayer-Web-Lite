import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { gzipSync } from 'node:zlib'
import { parse } from 'acorn'

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

function scriptIntegrity (bytes) {
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
  const source = bytes.toString('utf8')
  try {
    parse(source, { ecmaVersion: 'latest', sourceType: 'script' })
  } catch {
    return null
  }
  const hasUmdExports = /\btypeof\s+exports\b/.test(source) && /\btypeof\s+module\b/.test(source)
  const hasSvgaNamespace = /\.SVGA\s*=/.test(source)
  const hasPlayerAndParserExports = /\.Parser\s*=/.test(source) && /\.Player\s*=/.test(source)
  if (!hasUmdExports || !hasSvgaNamespace || !hasPlayerAndParserExports) return null

  const calculatedScriptIntegrity = scriptIntegrity(bytes)
  if (metadata.expectedScriptIntegrity && metadata.expectedScriptIntegrity !== calculatedScriptIntegrity) return null

  const runtime = {
    version: manifest.version,
    source: metadata.source,
    url: metadata.url,
    bytes: bytes.length,
    gzipBytes: gzipSync(bytes).length,
    integrity: metadata.integrity || null,
    scriptIntegrity: calculatedScriptIntegrity,
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

async function metadataForDirectory ({ directory, expectedVersion, expectedScriptIntegrity, source, url, cacheState, integrity, onlineConfirmed, projectDir }) {
  const runtime = await inspectRuntime(directory, { expectedVersion, expectedScriptIntegrity, source, url, cacheState, integrity, onlineConfirmed })
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
  if (!latest || !strictSemver.test(latest.version) || typeof latest.integrity !== 'string' || typeof latest.scriptIntegrity !== 'string') return null
  return latest
}

async function writeJsonAtomically (path, value) {
  const parent = dirname(path)
  await mkdir(parent, { recursive: true })
  const temporaryDirectory = await mkdtemp(join(parent, `.${basename(path)}-`))
  const temporary = join(temporaryDirectory, basename(path))
  try {
    await writeFile(temporary, `${JSON.stringify(value)}\n`)
    await rename(temporary, path)
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true })
  }
}

async function writeLatest (cacheDir, latest) {
  await writeJsonAtomically(join(cacheDir, 'latest.json'), { ...latest, resolvedAt: new Date().toISOString() })
}

async function writeCacheMetadata (directory, metadata) {
  await writeJsonAtomically(join(directory, 'metadata.json'), metadata)
}

async function cachedRuntime ({ cacheDir, version, cacheState, onlineConfirmed, expectedIntegrity, expectedScriptIntegrity, projectDir }) {
  const directory = join(cacheDir, 'versions', version)
  const cached = await readJson(join(directory, 'metadata.json'))
  if (!cached || cached.version !== version || typeof cached.integrity !== 'string' || typeof cached.scriptIntegrity !== 'string') return null
  if (expectedIntegrity && cached.integrity !== expectedIntegrity) return null
  if (expectedScriptIntegrity && cached.scriptIntegrity !== expectedScriptIntegrity) return null
  return await metadataForDirectory({
    directory, expectedVersion: version, expectedScriptIntegrity: cached.scriptIntegrity, source: 'npm',
    url: '/runtime/baseline.js', cacheState, integrity: cached.integrity, onlineConfirmed, projectDir
  })
}

function packedFilename (output) {
  const parsed = JSON.parse(String(output))
  const entry = Array.isArray(parsed)
    ? parsed[0]
    : typeof parsed?.filename === 'string'
      ? parsed
      : Object.values(parsed || {}).find(value => value && typeof value === 'object' && typeof value.filename === 'string')
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
    await writeCacheMetadata(unpacked, {
      version,
      integrity,
      scriptIntegrity: validated.scriptIntegrity
    })
    await mkdir(versionsDir, { recursive: true })
    const existing = await cachedRuntime({
      cacheDir, version, cacheState: 'confirmed-cache', onlineConfirmed: true, projectDir
    })
    if (existing) {
      if (existing.integrity !== integrity) {
        throw new Error(`Refusing to replace validated cache for ${version} with a conflicting package integrity`)
      }
      return existing
    }
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
      const cached = await cachedRuntime({
        cacheDir, version: latest.version, cacheState: 'confirmed-cache', onlineConfirmed: true, projectDir
      })
      if (cached && cached.integrity !== latest.integrity) {
        throw new Error(`Refusing to replace validated cache for ${latest.version} with a conflicting package integrity`)
      }
      const runtime = cached || await downloadRuntime(latest.version, latest.integrity, dependencies)
      await writeLatest(cacheDir, {
        version: runtime.version,
        integrity: runtime.integrity,
        scriptIntegrity: runtime.scriptIntegrity
      })
      return runtime
    } catch {
      const latest = await cacheLatest(cacheDir)
      if (!latest) return null
      return await cachedRuntime({
        cacheDir, version: latest.version, cacheState: 'stale-cache', onlineConfirmed: false,
        expectedIntegrity: latest.integrity, expectedScriptIntegrity: latest.scriptIntegrity, projectDir
      })
    }
  }

  const cached = await cachedRuntime({
    cacheDir, version: baseline, cacheState: 'cache', projectDir
  })
  if (cached) return cached

  try {
    const resolved = await resolveFromNpm(baseline, dependencies)
    if (resolved.version !== baseline) throw new Error('npm resolved a version different from the requested baseline')
    return await downloadRuntime(resolved.version, resolved.integrity, dependencies)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Unable to prepare exact baseline ${baseline}: ${reason}`)
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
