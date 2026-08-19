import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Video } from '../../src/types'

const fixtureDir = '__test__/svga'
const fixtureBlobs = new Map([
  ['1.svga', '9c70d97f006244f767fad5f53197905df0647889'],
  ['11.svga', 'da95698669082d28c0c7a1c95ff864098d7ea285'],
  ['2.svga', '71f2b725a988a1d39fc87e36e30b592badd17c35'],
  ['3.svga', 'f5753ae6fa3c2d5b4c50e0a214312fa9d168eb32'],
  ['4.svga', 'be4cb1e63f3a5a48b5a9cfa3cde601a5d9728ee2'],
  ['TwitterHeart.svga', 'e2c624259da978631f2155815fe7aa2eac04a30c'],
  ['angel.svga', 'a9c4cd9454ddd641c82e82a3423baac259b10383'],
  ['dragon.svga', '9c70d97f006244f767fad5f53197905df0647889'],
  ['kaola.svga', '827d910efbcfa0b331b11d610aa375e7a8e639d7'],
  ['kingset.svga', '64d4b701219f1b8e772c7d83121fe5bb33ba1479'],
  ['loading-1.svga', 'cace265e6c9b825468fea7e44ff80cfcd3caa2a5'],
  ['loading.svga', 'd1001c3493bc93a9652662fadbde02dd34ce52ee'],
  ['logo.svga', 'da1abe3e9b3cc53442af36a574edde498d525979'],
  ['shape-path-undefined.svga', 'c389529031bb8f59bc01c05fe84992681153ce31'],
  ['show.svga', '5b4254ed16cb30a3744fad0b5e86bce53459b805'],
  ['soundwave.svga', '4f8e3e9600d3c90831204a4c274d3f2a0f78f1c5'],
  ['story.svga', '22f71c2df00f06c4d60d418f57834268bf2c59ef']
])

function gitBlobHash (bytes: Buffer): string {
  return createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex')
}

describe('production SVGA fixtures', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('retains the exact business corpus and parses every file', async () => {
    const names = (await readdir(fixtureDir).catch(() => []))
      .filter(name => name.endsWith('.svga'))
      .sort()
    const expectedNames = [...fixtureBlobs.keys()].sort()

    expect(names).toEqual(expectedNames)

    const fixtures = new Map<string, Buffer>()
    for (const name of names) {
      const bytes = await readFile(`${fixtureDir}/${name}`)
      expect(gitBlobHash(bytes), name).toBe(fixtureBlobs.get(name))
      fixtures.set(`fixture:${name}`, bytes)
    }

    vi.stubGlobal('fetch', async (url: string | URL | Request) => {
      const bytes = fixtures.get(String(url))
      if (!bytes) throw new Error(`unknown fixture URL: ${String(url)}`)
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => buffer
      }
    })
    vi.stubGlobal('self', { document: {}, createImageBitmap: undefined })
    vi.stubGlobal('window', { SVGAParserMockWorker: undefined })
    vi.stubGlobal('btoa', (value: string) => Buffer.from(value, 'binary').toString('base64'))

    await import('../../src/parser/index')
    const worker = window.SVGAParserMockWorker
    if (!worker) throw new Error('direct parser worker unavailable')

    for (const name of names) {
      const parsed = new Promise<Video>((resolve, reject) => {
        worker.onmessageCallback = data => data instanceof Error ? reject(data) : resolve(data)
      })
      await worker.onmessage({
        data: {
          url: `fixture:${name}`,
          options: { isDisableImageBitmapShim: true }
        }
      })
      if (name === 'show.svga') {
        await expect(parsed, name).rejects.toThrow('only support version@2')
      } else {
        await expect(parsed, name).resolves.toMatchObject({
          size: { width: expect.any(Number), height: expect.any(Number) },
          frames: expect.any(Number)
        })
      }
    }
  })
})
