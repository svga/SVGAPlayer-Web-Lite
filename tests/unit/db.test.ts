import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DB, type DBOptions } from '../../src/db'
import type { Video } from '../../src/types'

const nullMap = <T> (): Record<string, T> => Object.create(null) as Record<string, T>

function sampleVideo (): Video {
  return {
    version: '2.0',
    size: { width: 10, height: 10 },
    fps: 20,
    frames: 1,
    images: Object.assign(nullMap<Uint8Array>(), { image: Uint8Array.from([1, 2, 3]) }),
    replaceElements: Object.assign(nullMap<Video['replaceElements'][string]>(), { image: { transient: true } as never }),
    dynamicElements: Object.assign(nullMap<Video['dynamicElements'][string]>(), { image: { transient: true } as never }),
    sprites: [{
      imageKey: 'image',
      frames: [{
        alpha: 1,
        transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
        layout: { x: 0, y: 0, width: 10, height: 10 },
        clipPath: '',
        shapes: []
      }]
    }]
  }
}

let indexedDB: IDBFactory
let nextName = 0
const options = (): DBOptions => ({ name: `svga-db-${++nextName}`, version: 1, storeName: 'files' })

function openDatabase (config: DBOptions): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(config.name, config.version)
    request.onupgradeneeded = () => request.result.createObjectStore(config.storeName)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function transactionDone (transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

async function seed (config: DBOptions, key: IDBValidKey, value: unknown): Promise<void> {
  const database = await openDatabase(config)
  const transaction = database.transaction(config.storeName, 'readwrite')
  transaction.objectStore(config.storeName).put(value, key)
  await transactionDone(transaction)
  database.close()
}

async function rawFind (config: DBOptions, key: IDBValidKey): Promise<unknown> {
  const database = await openDatabase(config)
  const transaction = database.transaction(config.storeName, 'readonly')
  const request = transaction.objectStore(config.storeName).get(key)
  const result = await new Promise<unknown>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  await transactionDone(transaction)
  database.close()
  return result
}

beforeEach(() => {
  indexedDB = new IDBFactory()
  vi.stubGlobal('window', { indexedDB })
})

describe('DB stable Video records', () => {
  it('opens lazily and performs no IndexedDB operation in the constructor', async () => {
    const open = vi.spyOn(indexedDB, 'open')
    const db = new DB(options())
    expect(open).not.toHaveBeenCalled()
    await db.find('missing')
    expect(open).toHaveBeenCalledOnce()
  })

  it('rejects when IndexedDB is unavailable', async () => {
    vi.stubGlobal('window', { indexedDB: undefined })
    await expect(new DB(options()).find('missing')).rejects.toThrow('IndexedDB operation failed')
  })

  it('round-trips Uint8Array records directly and resets transient maps', async () => {
    const config = options()
    const db = new DB(config)
    const source = sampleVideo()
    await db.insert('video', source)

    const stored = await rawFind(config, 'video') as Record<string, unknown>
    expect(stored).not.toBeTypeOf('string')
    const result = await db.find('video')
    expect(result?.images.image).toBeInstanceOf(Uint8Array)
    expect(result?.images.image).toEqual(Uint8Array.from([1, 2, 3]))
    expect(Object.getPrototypeOf(result?.images)).toBeNull()
    expect(Object.getPrototypeOf(result?.replaceElements)).toBeNull()
    expect(Object.getPrototypeOf(result?.dynamicElements)).toBeNull()
    expect(Object.keys(result?.replaceElements ?? {})).toEqual([])
    expect(Object.keys(result?.dynamicElements ?? {})).toEqual([])
  })

  it('takes a synchronous deep snapshot before caller mutation', async () => {
    const db = new DB(options())
    const source = sampleVideo()
    source.sprites[0].frames[0].shapes = [{
      type: 'rect' as never,
      path: { x: 1, y: 2, width: 3, height: 4, cornerRadius: 5 },
      styles: { fill: null, stroke: null, strokeWidth: 0, lineCap: null, lineJoin: null, miterLimit: 0, lineDash: [] },
      transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
    }]

    const inserting = db.insert('video', source)
    source.size.width = 99
    source.sprites[0].frames[0].layout.x = 99
    ;(source.sprites[0].frames[0].shapes[0].path as { width: number }).width = 99
    source.images.image[0] = 99
    await inserting

    const stored = await db.find('video')
    expect(stored).toBeDefined()
    expect(stored?.size.width).toBe(10)
    expect(stored?.sprites[0].frames[0].layout.x).toBe(0)
    expect(((stored as Video).sprites[0].frames[0].shapes[0].path as { width: number }).width).toBe(3)
    expect(stored?.images.image).toEqual(Uint8Array.from([1, 2, 3]))
  })

  it('validates inserts before opening or writing', async () => {
    const open = vi.spyOn(indexedDB, 'open')
    const db = new DB(options())
    const invalid = sampleVideo()
    invalid.fps = 121
    await expect(db.insert('invalid', invalid)).rejects.toThrow('Invalid SVGA video')
    expect(open).not.toHaveBeenCalled()
  })

  it('rejects promptly when the configured object store is missing', async () => {
    const config = options()
    await seed(config, 'video', sampleVideo())
    const db = new DB({ ...config, storeName: 'missing' })
    const outcome = await Promise.race([
      db.find('video').then(() => 'resolved', () => 'rejected'),
      new Promise<string>(resolve => setTimeout(() => resolve('timeout'), 50))
    ])
    expect(outcome).toBe('rejected')
  })

  it.each([
    ['old string', JSON.stringify(sampleVideo())],
    ['malformed record', { version: '2.0' }],
    ['invalid record', { ...sampleVideo(), frames: 0 }]
  ])('treats an %s as a cache miss and deletes it best-effort', async (_name, value) => {
    const config = options()
    await seed(config, 'video', value)
    const db = new DB(config)
    await expect(db.find('video')).resolves.toBeUndefined()
    await expect(rawFind(config, 'video')).resolves.toBeUndefined()
  })

  it('treats an image map with an unsupported prototype as invalid cache data', async () => {
    const config = options()
    const invalid = sampleVideo() as unknown as Record<string, unknown>
    invalid.images = new Date()
    await seed(config, 'video', invalid)
    await expect(new DB(config).find('video')).resolves.toBeUndefined()
    await expect(rawFind(config, 'video')).resolves.toBeUndefined()
  })

  it('rejects when invalid-record cleanup throws synchronously', async () => {
    const config = options()
    await seed(config, 'video', 'old')
    const remove = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementationOnce(() => { throw Error('delete failed') })
    await expect(new DB(config).find('video')).rejects.toThrow('delete failed')
    remove.mockRestore()
  })

  it('does not delete a concurrent valid write after reading an invalid cache entry', async () => {
    const config = options()
    await seed(config, 'video', 'old')
    const db = new DB(config)
    const valid = sampleVideo()
    let concurrentWrite: Promise<void> | undefined
    const originalGet = IDBObjectStore.prototype.get
    const get = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, key) {
      const request = originalGet.call(this, key)
      request.addEventListener('success', () => { concurrentWrite ??= db.insert('video', valid) })
      return request
    })

    await expect(db.find('video')).resolves.toBeUndefined()
    await concurrentWrite
    get.mockRestore()
    await expect(rawFind(config, 'video')).resolves.toMatchObject({ version: '2.0' })
  })

  it('resolves a cache miss when best-effort invalid deletion fails asynchronously', async () => {
    const config = options()
    await seed(config, 'video', 'old')
    const db = new DB(config)
    const remove = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementationOnce(function (this: IDBObjectStore) {
      const transaction = this.transaction as IDBTransaction & {
        _execRequestAsync: (operation: { operation: () => never, source: IDBObjectStore }) => IDBRequest<undefined>
      }
      return transaction._execRequestAsync({
        operation: () => { throw new DOMException('delete failed', 'ConstraintError') },
        source: this
      })
    })

    await expect(db.find('video')).resolves.toBeUndefined()
    remove.mockRestore()
    await expect(rawFind(config, 'video')).resolves.toBe('old')
  })

  it('snapshots a mutable find key once for both get and invalid-record deletion', async () => {
    const config = options()
    await seed(config, ['invalid'], 'old')
    await seed(config, ['valid'], sampleVideo())
    const db = new DB(config)
    const key: IDBValidKey[] = ['invalid']
    const originalGet = IDBObjectStore.prototype.get
    const get = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementationOnce(function (this: IDBObjectStore, id) {
      const request = originalGet.call(this, id)
      key[0] = 'valid'
      return request
    })

    await expect(db.find(key)).resolves.toBeUndefined()
    get.mockRestore()
    const invalidRemains = await rawFind(config, ['invalid']) !== undefined
    const validDeleted = await rawFind(config, ['valid']) === undefined
    expect({ invalidRemains, validDeleted }).toEqual({ invalidRemains: false, validDeleted: false })
  })

  it('snapshots mutable find, insert, and delete keys before their first async boundary', async () => {
    const config = options()
    await seed(config, ['find'], sampleVideo())
    await seed(config, ['delete'], sampleVideo())
    await seed(config, ['keep'], sampleVideo())
    const db = new DB(config)

    const findKey: IDBValidKey[] = ['find']
    const finding = db.find(findKey)
    findKey[0] = 'missing'
    await expect(finding).resolves.toMatchObject({ version: '2.0' })

    const insertKey: IDBValidKey[] = ['insert']
    const inserting = db.insert(insertKey, sampleVideo())
    insertKey[0] = 'mutated-insert'
    await inserting
    await expect(rawFind(config, ['insert'])).resolves.toMatchObject({ version: '2.0' })
    await expect(rawFind(config, ['mutated-insert'])).resolves.toBeUndefined()

    const deleteKey: IDBValidKey[] = ['delete']
    const deleting = db.delete(deleteKey)
    deleteKey[0] = 'keep'
    await deleting
    await expect(rawFind(config, ['delete'])).resolves.toBeUndefined()
    await expect(rawFind(config, ['keep'])).resolves.toMatchObject({ version: '2.0' })
  })

  it('preserves insert/find/delete signatures and closes each operation deterministically', async () => {
    const db = new DB(options())
    await expect(db.insert('video', sampleVideo())).resolves.toBeUndefined()
    await expect(db.find('video')).resolves.toMatchObject({ version: '2.0' })
    await expect(db.delete('video')).resolves.toBeUndefined()
    await expect(db.find('video')).resolves.toBeUndefined()
  })
})
