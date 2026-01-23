import { Video } from './types'

function wrapRequest<T> (request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('[SVGA.DB] indexedDB operation failed'))
  })
}

function wrapTransaction (tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(new Error('[SVGA.DB] indexedDB operation failed'))
  })
}

export class DB {
  private readonly storeName: string
  private readonly dbPromise: Promise<IDBDatabase>

  constructor ({ name = 'SVGA.DB', version = 1.0, storeName = 'files' }: {
    name?: string
    version?: number
    storeName?: string
  } = {}) {
    this.storeName = storeName
    this.dbPromise = this.openDatabase(name, version, storeName)
  }

  private openDatabase (name: string, version: number, storeName: string): Promise<IDBDatabase> {
    if (indexedDB === undefined) {
      return Promise.reject(new Error('[SVGA.DB] indexedDB not supported'))
    }

    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, version)
      request.onupgradeneeded = () => request.result.createObjectStore(storeName)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('[SVGA.DB] indexedDB open fail'))
    })
  }

  async find (id: IDBValidKey): Promise<Video | undefined> {
    const db = await this.dbPromise
    const tx = db.transaction([this.storeName], 'readonly')
    const result = await wrapRequest(tx.objectStore(this.storeName).get(id))
    return result !== undefined ? JSON.parse(result) : undefined
  }

  async insert (id: IDBValidKey, data: Video): Promise<void> {
    const db = await this.dbPromise
    const tx = db.transaction([this.storeName], 'readwrite')
    tx.objectStore(this.storeName).put(JSON.stringify(data), id)
    await wrapTransaction(tx)
  }

  async delete (id: IDBValidKey): Promise<void> {
    const db = await this.dbPromise
    const tx = db.transaction([this.storeName], 'readwrite')
    const request = tx.objectStore(this.storeName).delete(id)
    await wrapRequest(request)
  }
}
