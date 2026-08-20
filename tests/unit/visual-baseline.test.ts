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

const packageBytes = Buffer.from('window.SVGA = { Player: class Player {} }\n')
const integrity = `sha512-${createHash('sha512').update(packageBytes).digest('base64')}`
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
      gzipBytes: gzipSync(packageBytes).length, integrity: expect.stringMatching(/^sha512-/)
    })
  })

  it('falls back to a validated latest cache when the registry cannot be reached', async () => {
    const projectDir = await temporaryDirectory()
    const cacheDir = join(projectDir, '.cache')
    const version = '2.1.9'
    await writeRuntime(join(cacheDir, 'versions', version), version)
    await mkdir(cacheDir, { recursive: true })
    await writeFile(join(cacheDir, 'latest.json'), JSON.stringify({ version, integrity, resolvedAt: '2026-08-20T00:00:00.000Z' }))

    const runtime = await prepareBaselineRuntime({ baseline: 'latest' }, {
      projectDir,
      cacheDir,
      run: async () => { throw new Error('offline') }
    })

    expect(runtime).toMatchObject({ version, source: 'npm', cacheState: 'stale-cache', onlineConfirmed: false, integrity })
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
      if (command === 'npm' && arguments_[0] === 'pack') return JSON.stringify([{ filename: 'svga-2.1.9.tgz' }])
      if (command === 'tar') {
        const target = arguments_[arguments_.indexOf('-C') + 1]
        await writeRuntime(target, '2.1.9')
        return ''
      }
      throw new Error(`unexpected command: ${command}`)
    }

    const runtime = await prepareBaselineRuntime({ baseline: 'latest' }, { projectDir, cacheDir, run })

    expect(runtime).toMatchObject({ version: '2.1.9', cacheState: 'downloaded', integrity, onlineConfirmed: true })
    expect(calls.filter(call => call.command === 'npm')).toHaveLength(2)
    expect(calls.filter(call => call.command === 'npm').every(call => call.arguments_.includes('--ignore-scripts'))).toBe(true)
    await expect(readFile(join(cacheDir, 'latest.json'), 'utf8')).resolves.toContain(`"integrity":"${integrity}"`)
  })

  it('returns null when latest cannot be resolved and there is no cache', async () => {
    const projectDir = await temporaryDirectory()

    await expect(prepareBaselineRuntime({ baseline: 'latest' }, {
      projectDir,
      cacheDir: join(projectDir, '.cache'),
      run: async () => { throw new Error('offline') }
    })).resolves.toBeNull()
  })

  it('rejects an unsafe direct baseline request before it can become a package spec or cache path', async () => {
    const projectDir = await temporaryDirectory()
    await expect(prepareBaselineRuntime({ baseline: 'file:../svga' }, { projectDir })).rejects.toThrow(/latest, local, or an exact semver/)
  })

  it('warns when the selected baseline version equals the local runtime', async () => {
    const projectDir = await temporaryDirectory()
    await writeRuntime(projectDir, '2.2.0')
    const cacheDir = join(projectDir, '.cache')
    await writeRuntime(join(cacheDir, 'versions', '2.2.0'), '2.2.0')

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
      gzipBytes: gzipSync(packageBytes).length, integrity: expect.stringMatching(/^sha512-/),
      cacheState: 'local', gitCommit: 'deadbee', dirty: true
    })
    await expect(readFile(join(projectDir, 'dist/index.min.js'))).resolves.toEqual(packageBytes)
  })
})
