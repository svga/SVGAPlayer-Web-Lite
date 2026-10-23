import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DB, type DBOptions } from '../../src/db'
import type { Video } from '../../src/types'

function sampleVideo(): Video {
  return {
    version: '2.0',
    size: { width: 10, height: 10 },
    fps: 20,
    frames: 1,
    images: Object.assign(Object.create(null) as Record<string, Uint8Array>, {
      image: Uint8Array.from([1, 2, 3]),
    }),
    replaceElements: Object.create(null) as Video['replaceElements'],
    dynamicElements: Object.create(null) as Video['dynamicElements'],
    sprites: [
      {
        imageKey: 'image',
        frames: [
          {
            alpha: 1,
            transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
            layout: { x: 0, y: 0, width: 10, height: 10 },
            clipPath: '',
            shapes: [],
          },
        ],
      },
    ],
  }
}

let indexedDB: IDBFactory
let nextName = 0
const options = (): DBOptions => ({
  name: `svga-db-lifecycle-${++nextName}`,
  version: 1,
  storeName: 'files',
})

function openDatabase(config: DBOptions): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(config.name, config.version)
    request.onupgradeneeded = () => request.result.createObjectStore(config.storeName)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function storedStores(database: IDBDatabase): string[] {
  return [...database.objectStoreNames]
}

beforeEach(() => {
  indexedDB = new IDBFactory()
  vi.stubGlobal('window', { indexedDB })
})

describe('DB schema lifecycle', () => {
  it('creates the store when a fresh database is opened and persists records', async () => {
    const config = options()
    const db = new DB(config)

    await db.insert('one', sampleVideo())
    expect(await db.find('one')).toMatchObject({ size: { width: 10, height: 10 } })
  })

  it('upgrades an existing database and adds the configured store', async () => {
    const config = options()
    const db = new DB(config)
    await db.insert('one', sampleVideo())

    const upgraded = new DB({ ...config, version: 2, storeName: 'files-v2' })
    await upgraded.insert('two', sampleVideo())

    const raw = await openDatabase({ ...config, version: 2, storeName: 'files-v2' })
    expect(storedStores(raw)).toEqual(['files', 'files-v2'])
    expect(await upgraded.find('one')).toBeUndefined()
    expect(await upgraded.find('two')).toMatchObject({ frames: 1 })
    raw.close()
  })

  it('rejects instead of hanging when another connection blocks the upgrade', async () => {
    const config = options()
    const blocker = await openDatabase(config)
    const upgraded = new DB({ ...config, version: 2, storeName: 'files-v2' })

    await expect(upgraded.find('one')).rejects.toThrow('IndexedDB operation failed')

    blocker.close()
  })

  it('leaves a closed connection behind after each transaction', async () => {
    const config = options()
    const db = new DB(config)
    await db.insert('one', sampleVideo())

    const reopened = await openDatabase(config)
    expect(reopened.version).toBe(1)
    expect(storedStores(reopened)).toEqual(['files'])
    reopened.close()
  })
})
