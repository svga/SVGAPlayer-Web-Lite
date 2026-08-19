import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DB } from '../../src/db'
import type { Video } from '../../src/types'

const sampleVideo: Video = {
  version: '2.0',
  size: { width: 1, height: 1 },
  fps: 20,
  frames: 0,
  images: {},
  replaceElements: {},
  dynamicElements: {},
  sprites: []
}

let indexedDB: IDBFactory
let nextName = 0

function databaseName (): string {
  return `svga-db-${++nextName}`
}

function openDatabase (name: string, version: number, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName)
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function transactionDone (tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function initialConnection (db: DB): Promise<IDBDatabase> {
  return (db as unknown as { dbPromise: Promise<IDBDatabase> }).dbPromise
}

function timeout (milliseconds = 100): Promise<never> {
  return new Promise((resolve, reject) => {
    setTimeout(() => reject(new Error('operation timed out')), milliseconds)
  })
}

beforeEach(() => {
  indexedDB = new IDBFactory()
  vi.stubGlobal('window', { indexedDB })
})

describe('DB operations and connection lifecycle', () => {
  it('inserts, finds and deletes data while reopening after every closed connection', async () => {
    const open = vi.spyOn(indexedDB, 'open')
    const db = new DB({ name: databaseName(), version: 1, storeName: 'files' })
    const firstConnection = await initialConnection(db)
    const close = vi.spyOn(firstConnection, 'close')

    await db.insert('video', sampleVideo)
    expect(close).toHaveBeenCalledOnce()
    await expect(db.find('video')).resolves.toEqual(sampleVideo)
    await expect(db.delete('video')).resolves.toBeUndefined()
    await expect(db.find('video')).resolves.toBeUndefined()
    expect(open).toHaveBeenCalledTimes(4)
  })

  it('keeps reopen state outside the public-shaped database promise', () => {
    const db = new DB({ name: databaseName(), version: 1, storeName: 'files' })
    const promise = initialConnection(db)
    const names = Object.getOwnPropertyNames(promise)

    expect(names).toEqual([])
  })

  it('waits for find transaction completion before settling', async () => {
    const db = new DB({ name: databaseName(), version: 1, storeName: 'files' })
    const connection = await initialConnection(db)
    const seed = connection.transaction('files', 'readwrite')
    seed.objectStore('files').put(JSON.stringify(sampleVideo), 'video')
    await transactionDone(seed)
    const events: string[] = []
    const transaction = connection.transaction.bind(connection)
    connection.transaction = ((...args: Parameters<IDBDatabase['transaction']>) => {
      const tx = transaction(...args)
      const objectStore = tx.objectStore.bind(tx)
      tx.objectStore = ((storeName: string) => {
        const store = objectStore(storeName)
        const get = store.get.bind(store)
        store.get = ((key: IDBValidKey | IDBKeyRange) => {
          const request = get(key)
          request.addEventListener('success', () => events.push('request'))
          return request
        }) as IDBObjectStore['get']
        return store
      }) as IDBTransaction['objectStore']
      tx.addEventListener('complete', () => events.push('complete'))
      return tx
    }) as IDBDatabase['transaction']

    const result = await db.find('video').then(value => {
      events.push('promise')
      return value
    })

    expect(result).toEqual(sampleVideo)
    expect(events).toEqual(['request', 'complete', 'promise'])
  })

  it('waits for delete transaction completion before settling', async () => {
    const db = new DB({ name: databaseName(), version: 1, storeName: 'files' })
    const connection = await initialConnection(db)
    const seed = connection.transaction('files', 'readwrite')
    seed.objectStore('files').put('value', 'video')
    await transactionDone(seed)
    const events: string[] = []
    const transaction = connection.transaction.bind(connection)
    connection.transaction = ((...args: Parameters<IDBDatabase['transaction']>) => {
      const tx = transaction(...args)
      const objectStore = tx.objectStore.bind(tx)
      tx.objectStore = ((storeName: string) => {
        const store = objectStore(storeName)
        const remove = store.delete.bind(store)
        store.delete = ((key: IDBValidKey | IDBKeyRange) => {
          const request = remove(key)
          request.addEventListener('success', () => events.push('request'))
          return request
        }) as IDBObjectStore['delete']
        return store
      }) as IDBTransaction['objectStore']
      tx.addEventListener('complete', () => events.push('complete'))
      return tx
    }) as IDBDatabase['transaction']

    await db.delete('video').then(() => { events.push('promise') })

    expect(events).toEqual(['request', 'complete', 'promise'])
  })

  it('rejects malformed JSON instead of throwing from an IndexedDB callback or hanging', async () => {
    const db = new DB({ name: databaseName(), version: 1, storeName: 'files' })
    const connection = await initialConnection(db)
    const seed = connection.transaction('files', 'readwrite')
    seed.objectStore('files').put('{bad json', 'video')
    await transactionDone(seed)

    await expect(Promise.race([db.find('video'), timeout()])).rejects.toThrow(/JSON|position|token|property/i)
  })

  it('resolves undefined for missing and non-string values', async () => {
    const db = new DB({ name: databaseName(), version: 1, storeName: 'files' })
    const connection = await initialConnection(db)
    const seed = connection.transaction('files', 'readwrite')
    seed.objectStore('files').put(123, 'number')
    await transactionDone(seed)

    await expect(db.find('number')).resolves.toBeUndefined()
    await expect(db.find('missing')).resolves.toBeUndefined()
  })

  it('rejects transaction abort and closes the affected connection', async () => {
    const db = new DB({ name: databaseName(), version: 1, storeName: 'files' })
    const connection = await initialConnection(db)
    const close = vi.spyOn(connection, 'close')
    const transaction = connection.transaction.bind(connection)
    connection.transaction = ((...args: Parameters<IDBDatabase['transaction']>) => {
      const tx = transaction(...args)
      queueMicrotask(() => tx.abort())
      return tx
    }) as IDBDatabase['transaction']

    await expect(db.find('video')).rejects.toBeInstanceOf(Error)
    expect(close).toHaveBeenCalledOnce()
  })

  it('waits for terminal abort before rejecting a real constraint failure', async () => {
    const db = new DB({ name: databaseName(), version: 1, storeName: 'files' })
    const connection = await initialConnection(db)
    const seed = connection.transaction('files', 'readwrite')
    seed.objectStore('files').add('existing', 'video')
    await transactionDone(seed)
    const events: string[] = []
    const close = vi.spyOn(connection, 'close')
    const transaction = connection.transaction.bind(connection)
    connection.transaction = ((...args: Parameters<IDBDatabase['transaction']>) => {
      const tx = transaction(...args)
      const objectStore = tx.objectStore.bind(tx)
      tx.objectStore = ((storeName: string) => {
        const store = objectStore(storeName)
        store.put = ((value: unknown, key?: IDBValidKey) => {
          const request = store.add(value, key)
          request.addEventListener('error', () => events.push('request-error'))
          return request
        }) as IDBObjectStore['put']
        return store
      }) as IDBTransaction['objectStore']
      tx.addEventListener('error', () => events.push('transaction-error'))
      tx.addEventListener('abort', () => events.push('abort'))
      return tx
    }) as IDBDatabase['transaction']

    const operation = db.insert('video', sampleVideo).catch(error => {
      events.push('promise')
      throw error
    })

    await expect(operation).rejects.toBeInstanceOf(Error)
    expect(events).toEqual(['request-error', 'transaction-error', 'abort', 'promise'])
    expect(close).toHaveBeenCalledOnce()
  })

  it('aborts an existing transaction before rejecting when the action throws', async () => {
    const db = new DB({ name: databaseName(), version: 1, storeName: 'files' })
    const connection = await initialConnection(db)
    const events: string[] = []
    const transaction = connection.transaction.bind(connection)
    connection.transaction = ((...args: Parameters<IDBDatabase['transaction']>) => {
      const tx = transaction(...args)
      tx.addEventListener('abort', () => events.push('abort'))
      return tx
    }) as IDBDatabase['transaction']
    const cyclic = { ...sampleVideo, images: {} } as Video
    ;(cyclic.images as Record<string, unknown>).cyclic = cyclic

    const operation = db.insert('video', cyclic).catch(error => {
      events.push('promise')
      throw error
    })

    await expect(operation).rejects.toBeInstanceOf(TypeError)
    expect(events).toEqual(['abort', 'promise'])
  })
})

describe('DB open and upgrade lifecycle', () => {
  it('upgrades a database without recreating an existing object store', async () => {
    const name = databaseName()
    const existing = await openDatabase(name, 1, 'files')
    existing.close()
    const db = new DB({ name, version: 2, storeName: 'files' })

    await expect(db.find('missing')).resolves.toBeUndefined()
  })

  it('rejects a blocked open, closes its late result and reopens later', async () => {
    const name = databaseName()
    const blocker = await openDatabase(name, 1, 'files')
    const open = vi.spyOn(indexedDB, 'open')
    const close = vi.spyOn(Object.getPrototypeOf(blocker) as { close: () => void }, 'close')
    const db = new DB({ name, version: 2, storeName: 'files' })
    const lateRequest = open.mock.results[0].value
    const lateSuccess = new Promise<void>(resolve => lateRequest.addEventListener('success', () => resolve()))

    await expect(Promise.race([db.find('missing'), timeout()])).rejects.toBeInstanceOf(Error)
    blocker.close()
    close.mockClear()
    await lateSuccess
    expect(close).toHaveBeenCalledOnce()
    await expect(db.find('missing')).resolves.toBeUndefined()
    expect(open).toHaveBeenCalledTimes(2)
    close.mockRestore()
  })

  it('closes on versionchange and reopens after database deletion', async () => {
    const name = databaseName()
    const db = new DB({ name, version: 1, storeName: 'files' })
    const connection = await initialConnection(db)
    const close = vi.spyOn(connection, 'close')
    const deletion = indexedDB.deleteDatabase(name)
    await new Promise<void>((resolve, reject) => {
      deletion.onsuccess = () => resolve()
      deletion.onerror = () => reject(deletion.error)
    })

    expect(close).toHaveBeenCalledOnce()
    await expect(db.find('missing')).resolves.toBeUndefined()
  })

  it('rejects an IndexedDB open error', async () => {
    const request: Partial<IDBOpenDBRequest> = {}
    vi.stubGlobal('window', {
      indexedDB: { open: () => request }
    })
    const db = new DB({ name: databaseName(), version: 1, storeName: 'files' })
    const finding = db.find('missing')
    const onerror = request.onerror as ((event: Event) => void) | null
    onerror?.(new Event('error'))

    await expect(finding).rejects.toBeInstanceOf(Error)
  })
})
