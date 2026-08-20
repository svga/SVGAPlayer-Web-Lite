import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  createRuntimeMetadata,
  parseBaselineOptions,
  prepareBaselineRuntime
} from '../../scripts/visual-baseline.mjs'

const packageBytes = Buffer.from('!function(root, factory) { "object" == typeof exports && "undefined" != typeof module ? factory(exports) : factory(root.SVGA = {}) }(this, function(exports) { exports.Parser = class Parser {}; exports.Player = class Player {} })\n')
const integrity = 'sha512-registry-package-integrity'
const scriptIntegrity = `sha512-${createHash('sha512').update(packageBytes).digest('base64')}`
const temporaryDirs: string[] = []

async function temporaryDirectory (): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'svga-visual-baseline-'))
  temporaryDirs.push(directory)
  return directory
}

async function writeRuntime (directory: string, version: string, bytes = packageBytes): Promise<void> {
  await mkdir(join(directory, 'dist'), { recursive: true })
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'svga', version }))
  await writeFile(join(directory, 'dist/index.min.js'), bytes)
}

async function writeCachedRuntime (cacheDir: string, version: string, bytes = packageBytes): Promise<void> {
  const directory = join(cacheDir, 'versions', version)
  await writeRuntime(directory, version, bytes)
  await writeFile(join(directory, 'metadata.json'), JSON.stringify({ version, integrity, scriptIntegrity }))
}

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map(directory => rm(directory, { force: true, recursive: true })))
})

describe('visual baseline options', () => {
  it('defaults to the npm latest tag and accepts only local or strict semver', () => {
    expect(parseBaselineOptions([])).toEqual({ baseline: 'latest' })
    expect(parseBaselineOptions(['--baseline', 'local'])).toEqual({ baseline: 'local' })
    expect(parseBaselineOptions(['--baseline', '2.2.0-rc.1'])).toEqual({ baseline: '2.2.0-rc.1' })
  })

  it.each(['latest@2', '^2.2.0', 'v2.2.0', '2.2', '2.2.0-01', 'file:../svga', 'https://example.test/svga.tgz'])('rejects non-exact package specs: %s', spec => {
    expect(() => parseBaselineOptions(['--baseline', spec])).toThrow(/latest, local, or an exact semver/)
  })
})

describe('baseline runtime preparation', () => {
  it('uses local dist without invoking npm when requested', async () => {
    const projectDir = await temporaryDirectory()
    await writeRuntime(projectDir, '2.2.0')
    const run = async (): Promise<never> => { throw new Error('npm must not run for local') }

    await expect(prepareBaselineRuntime({ baseline: 'local' }, { projectDir, run })).resolves.toMatchObject({
      version: '2.2.0', source: 'local', cacheState: 'local', bytes: packageBytes.length,
      gzipBytes: gzipSync(packageBytes).length, integrity: null, scriptIntegrity
    })
  })

  it('falls back to a validated latest cache when the registry cannot be reached', async () => {
    const projectDir = await temporaryDirectory()
    const cacheDir = join(projectDir, '.cache')
    const version = '2.1.9'
    await writeCachedRuntime(cacheDir, version)
    await mkdir(cacheDir, { recursive: true })
    await writeFile(join(cacheDir, 'latest.json'), JSON.stringify({ version, integrity, scriptIntegrity, resolvedAt: '2026-08-20T00:00:00.000Z' }))

    const runtime = await prepareBaselineRuntime({ baseline: 'latest' }, {
      projectDir,
      cacheDir,
      run: async () => { throw new Error('offline') }
    })

    expect(runtime).toMatchObject({ version, source: 'npm', cacheState: 'stale-cache', onlineConfirmed: false, integrity, scriptIntegrity })
  })

  it('packs an exact latest version with install scripts disabled and caches its registry integrity', async () => {
    const projectDir = await temporaryDirectory()
    await writeRuntime(projectDir, '2.2.0')
    const cacheDir = join(projectDir, '.cache')
    const calls: Array<{ command: string, arguments_: string[] }> = []
    const run = async (command: string, arguments_: string[]): Promise<string> => {
      calls.push({ command, arguments_ })
      if (command === 'npm' && arguments_[0] === 'view') {
        return JSON.stringify({ version: '2.1.9', 'dist.integrity': integrity })
      }
      if (command === 'npm' && arguments_[0] === 'pack') return JSON.stringify({ svga: { filename: 'svga-2.1.9.tgz' } })
      if (command === 'tar') {
        const target = arguments_[arguments_.indexOf('-C') + 1]
        await writeRuntime(target, '2.1.9')
        return ''
      }
      throw new Error(`unexpected command: ${command}`)
    }

    const runtime = await prepareBaselineRuntime({ baseline: 'latest' }, { projectDir, cacheDir, run })

    expect(runtime).toMatchObject({ version: '2.1.9', cacheState: 'downloaded', integrity, scriptIntegrity, onlineConfirmed: true })
    expect(calls.filter(call => call.command === 'npm')).toHaveLength(2)
    expect(calls.filter(call => call.command === 'npm').every(call => call.arguments_.includes('--ignore-scripts'))).toBe(true)
    await expect(readFile(join(cacheDir, 'latest.json'), 'utf8')).resolves.toContain(`"scriptIntegrity":"${scriptIntegrity}"`)
  })

  it('returns null when latest cannot be resolved and there is no cache', async () => {
    const projectDir = await temporaryDirectory()

    await expect(prepareBaselineRuntime({ baseline: 'latest' }, {
      projectDir,
      cacheDir: join(projectDir, '.cache'),
      run: async () => { throw new Error('offline') }
    })).resolves.toBeNull()
  })

  it.each([
    ['invalid JavaScript', Buffer.from('const = ;')],
    ['ordinary JavaScript without SVGA exports', Buffer.from('const Player = class {}; const Parser = class {};')],
    ['comments containing UMD-looking markers', Buffer.from('/* typeof exports; typeof module; root.SVGA = {}; exports.Parser = 1; exports.Player = 1; */')],
    ['strings containing UMD-looking markers', Buffer.from('const marker = "typeof exports typeof module root.SVGA = {} exports.Parser = 1 exports.Player = 1";')],
    ['ordinary JavaScript with unwrapped UMD-looking assignments', Buffer.from('if (typeof exports && typeof module) { globalThis.SVGA = {}; exports.Parser = 1; exports.Player = 1; }')]
  ])('rejects %s as a local runtime', async (_name, bytes) => {
    const projectDir = await temporaryDirectory()
    await writeRuntime(projectDir, '2.2.0', bytes)
    await expect(prepareBaselineRuntime({ baseline: 'local' }, { projectDir })).resolves.toBeNull()
  })

  it.each([
    ['a CommonJS-looking branch that is unreachable', Buffer.from('!function(global, factory) { if (false) { if (typeof exports && typeof module) factory(exports) } else factory(global.SVGA = {}) }(this, function(output) { output.Parser = 1; output.Player = 1 })')],
    ['an unrelated function for the global SVGA branch', Buffer.from('!function(global, factory) { const other = () => {}; if (typeof exports && typeof module) factory(exports); else other(global.SVGA = {}) }(this, function(output) { output.Parser = 1; output.Player = 1 })')]
  ])('rejects a top-level IIFE with %s', async (_name, bytes) => {
    const projectDir = await temporaryDirectory()
    await writeRuntime(projectDir, '2.2.0', bytes)
    await expect(prepareBaselineRuntime({ baseline: 'local' }, { projectDir })).resolves.toBeNull()
  })

  it.each([
    ['exports only after a return', Buffer.from('!function(global, factory) { typeof exports && typeof module ? factory(exports) : factory(global.SVGA = {}) }(this, function(output) { return; output.Parser = 1; output.Player = 1 })')],
    ['a block-level factory parameter shadow', Buffer.from('!function(global, factory) { if (typeof exports && typeof module) { const factory = () => {}; factory(exports) } else factory(global.SVGA = {}) }(this, function(output) { output.Parser = 1; output.Player = 1 })')],
    ['a block-level factory output shadow', Buffer.from('!function(global, factory) { typeof exports && typeof module ? factory(exports) : factory(global.SVGA = {}) }(this, function(output) { { const output = {}; output.Parser = 1; output.Player = 1 } })')]
  ])('rejects a UMD-like IIFE with %s', async (_name, bytes) => {
    const projectDir = await temporaryDirectory()
    await writeRuntime(projectDir, '2.2.0', bytes)
    await expect(prepareBaselineRuntime({ baseline: 'local' }, { projectDir })).resolves.toBeNull()
  })

  it('rejects a tampered cached script while offline instead of reporting a replacement hash', async () => {
    const projectDir = await temporaryDirectory()
    const cacheDir = join(projectDir, '.cache')
    const version = '2.1.9'
    await writeCachedRuntime(cacheDir, version)
    await writeFile(join(cacheDir, 'versions', version, 'dist/index.min.js'), `${packageBytes}/* tampered */`)
    await writeFile(join(cacheDir, 'latest.json'), JSON.stringify({ version, integrity, scriptIntegrity }))

    await expect(prepareBaselineRuntime({ baseline: 'latest' }, {
      projectDir,
      cacheDir,
      run: async () => { throw new Error('offline') }
    })).resolves.toBeNull()
  })

  it('does not replace a validated cache directory when the registry reports a conflicting package integrity', async () => {
    const projectDir = await temporaryDirectory()
    const cacheDir = join(projectDir, '.cache')
    await writeCachedRuntime(cacheDir, '2.1.9')
    const original = await readFile(join(cacheDir, 'versions', '2.1.9', 'dist/index.min.js'))
    const calls: string[] = []

    const runtime = await prepareBaselineRuntime({ baseline: 'latest' }, {
      projectDir,
      cacheDir,
      run: async (command, arguments_) => {
        calls.push(`${command} ${arguments_[0]}`)
        if (command === 'npm' && arguments_[0] === 'view') return JSON.stringify({ version: '2.1.9', 'dist.integrity': 'sha512-conflict' })
        throw new Error('package download should not start')
      }
    })

    expect(runtime).toBeNull()
    expect(calls).toEqual(['npm view'])
    await expect(readFile(join(cacheDir, 'versions', '2.1.9', 'dist/index.min.js'))).resolves.toEqual(original)
  })

  it('repairs a tampered exact-version cache without removing a valid replacement', async () => {
    const projectDir = await temporaryDirectory()
    const cacheDir = join(projectDir, '.cache')
    await writeCachedRuntime(cacheDir, '2.1.9')
    await writeFile(join(cacheDir, 'versions', '2.1.9', 'dist/index.min.js'), 'const tampered = true')
    const run = async (command: string, arguments_: string[]): Promise<string> => {
      if (command === 'npm' && arguments_[0] === 'view') return JSON.stringify({ version: '2.1.9', 'dist.integrity': integrity })
      if (command === 'npm' && arguments_[0] === 'pack') return JSON.stringify({ svga: { filename: 'svga-2.1.9.tgz' } })
      if (command === 'tar') {
        await writeRuntime(arguments_[arguments_.indexOf('-C') + 1], '2.1.9')
        return ''
      }
      throw new Error(`unexpected command: ${command}`)
    }

    await expect(prepareBaselineRuntime({ baseline: '2.1.9' }, { projectDir, cacheDir, run })).resolves.toMatchObject({
      cacheState: 'downloaded', scriptIntegrity
    })
    await expect(readFile(join(cacheDir, 'versions', '2.1.9', 'dist/index.min.js'))).resolves.toEqual(packageBytes)
  })

  it('repairs a latest cache with missing metadata after an online fetch', async () => {
    const projectDir = await temporaryDirectory()
    const cacheDir = join(projectDir, '.cache')
    await writeRuntime(join(cacheDir, 'versions', '2.1.9'), '2.1.9')
    const run = async (command: string, arguments_: string[]): Promise<string> => {
      if (command === 'npm' && arguments_[0] === 'view') return JSON.stringify({ version: '2.1.9', 'dist.integrity': integrity })
      if (command === 'npm' && arguments_[0] === 'pack') return JSON.stringify({ svga: { filename: 'svga-2.1.9.tgz' } })
      if (command === 'tar') {
        await writeRuntime(arguments_[arguments_.indexOf('-C') + 1], '2.1.9')
        return ''
      }
      throw new Error(`unexpected command: ${command}`)
    }

    await expect(prepareBaselineRuntime({ baseline: 'latest' }, { projectDir, cacheDir, run })).resolves.toMatchObject({
      cacheState: 'downloaded', scriptIntegrity
    })
    await expect(readFile(join(cacheDir, 'versions', '2.1.9', 'metadata.json'), 'utf8')).resolves.toContain(`"scriptIntegrity":"${scriptIntegrity}"`)
  })

  it.each([2, 4])('publishes one valid cache when %i cold exact requests finish together', async requestCount => {
    const projectDir = await temporaryDirectory()
    const cacheDir = join(projectDir, '.cache')
    await writeRuntime(projectDir, '2.2.0')
    let arrived = 0
    let release: (() => void) | undefined
    const barrier = new Promise<void>(resolve => { release = resolve })
    const run = async (command: string, arguments_: string[]): Promise<string> => {
      if (command === 'npm' && arguments_[0] === 'view') return JSON.stringify({ version: '2.1.9', 'dist.integrity': integrity })
      if (command === 'npm' && arguments_[0] === 'pack') return JSON.stringify({ svga: { filename: 'svga-2.1.9.tgz' } })
      if (command === 'tar') {
        const target = arguments_[arguments_.indexOf('-C') + 1]
        await writeRuntime(target, '2.1.9')
        arrived++
        if (arrived === requestCount) release?.()
        await barrier
        return ''
      }
      throw new Error(`unexpected command: ${command}`)
    }

    const runtimes = await Promise.all(Array.from({ length: requestCount }, () => prepareBaselineRuntime({ baseline: '2.1.9' }, { projectDir, cacheDir, run })))

    expect(runtimes).toHaveLength(requestCount)
    expect(runtimes.every(runtime => runtime?.version === '2.1.9' && runtime.scriptIntegrity === scriptIntegrity)).toBe(true)
    expect(runtimes.filter(runtime => runtime?.cacheState === 'downloaded')).toHaveLength(1)
    await expect(readFile(join(cacheDir, 'versions', '2.1.9', 'dist/index.min.js'))).resolves.toEqual(packageBytes)
    await expect(prepareBaselineRuntime({ baseline: '2.1.9' }, {
      projectDir,
      cacheDir,
      run: async () => { throw new Error('cache should be used') }
    })).resolves.toMatchObject({ cacheState: 'cache', scriptIntegrity })
  })

  it.each(['missing metadata', 'tampered script'])('repairs %s for four concurrent exact requests across two rounds', async corruption => {
    const projectDir = await temporaryDirectory()
    const cacheDir = join(projectDir, '.cache')
    const version = '2.1.9'
    await writeRuntime(projectDir, '2.2.0')
    await writeCachedRuntime(cacheDir, version)

    for (const round of [1, 2]) {
      if (corruption === 'missing metadata') await rm(join(cacheDir, 'versions', version, 'metadata.json'), { force: true })
      else await writeFile(join(cacheDir, 'versions', version, 'dist/index.min.js'), `const brokenRound = ${round}`)

      let arrived = 0
      let release: (() => void) | undefined
      const barrier = new Promise<void>(resolve => { release = resolve })
      const run = async (command: string, arguments_: string[]): Promise<string> => {
        if (command === 'npm' && arguments_[0] === 'view') return JSON.stringify({ version, 'dist.integrity': integrity })
        if (command === 'npm' && arguments_[0] === 'pack') return JSON.stringify({ svga: { filename: 'svga-2.1.9.tgz' } })
        if (command === 'tar') {
          await writeRuntime(arguments_[arguments_.indexOf('-C') + 1], version)
          arrived++
          if (arrived === 4) release?.()
          await barrier
          return ''
        }
        throw new Error(`unexpected command: ${command}`)
      }

      const runtimes = await Promise.all(Array.from({ length: 4 }, () => prepareBaselineRuntime({ baseline: version }, { projectDir, cacheDir, run })))
      expect(runtimes.every(runtime => runtime?.scriptIntegrity === scriptIntegrity)).toBe(true)
      await expect(readFile(join(cacheDir, 'versions', version, 'dist/index.min.js'))).resolves.toEqual(packageBytes)
    }
  })

  it('fails an exact baseline request with its version and acquisition reason', async () => {
    const projectDir = await temporaryDirectory()
    await expect(prepareBaselineRuntime({ baseline: '2.1.1' }, {
      projectDir,
      cacheDir: join(projectDir, '.cache'),
      run: async () => { throw new Error('registry unavailable') }
    })).rejects.toThrow(/2\.1\.1.*registry unavailable/)
  })

  it('rejects an unsafe direct baseline request before it can become a package spec or cache path', async () => {
    const projectDir = await temporaryDirectory()
    await expect(prepareBaselineRuntime({ baseline: 'file:../svga' }, { projectDir })).rejects.toThrow(/latest, local, or an exact semver/)
  })

  it('warns when the selected baseline version equals the local runtime', async () => {
    const projectDir = await temporaryDirectory()
    await writeRuntime(projectDir, '2.2.0')
    const cacheDir = join(projectDir, '.cache')
    await writeCachedRuntime(cacheDir, '2.2.0')

    const baseline = await prepareBaselineRuntime({ baseline: '2.2.0' }, {
      projectDir,
      cacheDir,
      run: async () => { throw new Error('cache should be used') }
    })
    const local = await createRuntimeMetadata({
      projectDir,
      run: async (_command, arguments_) => arguments_[0] === 'status' ? '' : 'abc123\n'
    })

    expect(baseline).toMatchObject({ cacheState: 'cache', warning: expect.stringContaining('same as local') })
    expect(local).toMatchObject({ version: '2.2.0', source: 'local', gitCommit: 'abc123', dirty: false })
  })

  it('returns complete JSON-safe runtime metadata', async () => {
    const projectDir = await temporaryDirectory()
    await writeRuntime(projectDir, '2.2.0')
    const runtime = await createRuntimeMetadata({
      projectDir,
      run: async (_command, arguments_) => arguments_[0] === 'status' ? ' M src/index.ts\n' : 'deadbee\n'
    })

    expect(runtime).toEqual({
      version: '2.2.0', source: 'local', url: '/runtime/local.js', bytes: packageBytes.length,
      gzipBytes: gzipSync(packageBytes).length, integrity: null, scriptIntegrity,
      cacheState: 'local', gitCommit: 'deadbee', dirty: true
    })
    await expect(readFile(join(projectDir, 'dist/index.min.js'))).resolves.toEqual(packageBytes)
  })
})
