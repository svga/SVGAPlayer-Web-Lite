import { readFile, readdir } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { com } from '../../src/parser/svga.generated'

describe('static SVGA v2 decoder', () => {
  it('decodes every retained v2 fixture and rejects the retained v1 fixture', async () => {
    const names = (await readdir('__test__/svga')).filter(name => name.endsWith('.svga')).sort()
    for (const name of names) {
      const bytes = await readFile(`__test__/svga/${name}`)
      if (name === 'show.svga') {
        expect(() => inflateSync(bytes), name).toThrow()
      } else {
        const movie = (com as any).opensource.svga.MovieEntity.decode(inflateSync(bytes)) as { params?: { frames?: number } }
        expect(movie.params?.frames, name).toBeGreaterThan(0)
      }
    }
  })
})
