import { Video } from './types'

const DEFAULT_STORE_NAME = 'files'
const ERROR_OPERATION_FAILED = '[SVGA.DB] indexedDB operation failed'
const ERROR_OPEN_FAILED = '[SVGA.DB] indexedDB open fail'
const ERROR_NOT_SUPPORTED = '[SVGA.DB] indexedDB not supported'

function wrapRequest<T> (request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error(ERROR_OPERATION_FAILED))
  })
}

function wrapTransaction (tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(new Error(ERROR_OPERATION_FAILED))
  })
}

export class DB {
  private readonly storeName: string
  private readonly dbPromise: Promise<IDBDatabase>

  constructor ({ name = 'SVGA.DB', version = 1.0, storeName = DEFAULT_STORE_NAME }: {
    name?: string
    version?: number
    storeName?: string
  } = {}) {
    this.storeName = storeName
    this.dbPromise = this.openDatabase(name, version, storeName)
  }

  private openDatabase (name: string, version: number, storeName: string): Promise<IDBDatabase> {
    if (indexedDB === undefined) {
      return Promise.reject(new Error(ERROR_NOT_SUPPORTED))
    }

    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, version)
      request.onupgradeneeded = () => request.result.createObjectStore(storeName)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error(ERROR_OPEN_FAILED))
    })
  }

  async find (id: IDBValidKey): Promise<Video | undefined> {
    const db = await this.dbPromise
    const tx = this.createTransaction(db, 'readonly')
    const result = await wrapRequest(tx.objectStore(this.storeName).get(id))
    return result !== undefined ? JSON.parse(result) : undefined
  }

  async insert (id: IDBValidKey, data: Video): Promise<void> {
    const db = await this.dbPromise
    const tx = this.createTransaction(db, 'readwrite')
    tx.objectStore(this.storeName).put(JSON.stringify(data), id)
    await wrapTransaction(tx)
  }

  async delete (id: IDBValidKey): Promise<void> {
    const db = await this.dbPromise
    const tx = this.createTransaction(db, 'readwrite')
    const request = tx.objectStore(this.storeName).delete(id)
    await wrapRequest(request)
  }

  private createTransaction (db: IDBDatabase, mode: IDBTransactionMode): IDBTransaction {
    return db.transaction([this.storeName], mode)
  }
}
