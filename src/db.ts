import { Video } from './types'

export class DB {
  private readonly storeName: string
  private readonly dbPromise: Promise<IDBDatabase>

  constructor ({ name, version, storeName }: {
    name: string
    version: number
    storeName: string
  } = { name: 'SVGA.DB', version: 1.0, storeName: 'files' }) {
    this.storeName = storeName
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (window.indexedDB !== undefined) {
        const request = window.indexedDB.open(name, version)
        request.onerror = error => reject(new Error(`[SVGA.DB] indexedDB open fail, ${error.type}`))
        request.onsuccess = () => resolve(request.result)
        request.onupgradeneeded = () => {
          const db = request.result
          db.createObjectStore(storeName)
        }
      } else {
        throw new Error('[SVGA.DB] indexedDB not supported')
      }
    })
  }

  async find (id: IDBValidKey): Promise<Video | undefined> {
    return await this.dbPromise.then(async db => await new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readonly')
      const request = tx.objectStore(this.storeName).get(id)
      request.onsuccess = () => {
        if (typeof request.result === 'string') {
          resolve(JSON.parse(request.result))
        } else {
          resolve(undefined)
        }
      }
      request.onerror = () => reject(new Error('find error'))
    }))
  }

  async insert (id: IDBValidKey, data: Video): Promise<void> {
    return await this.dbPromise.then(async db => await new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readwrite')
      const request = tx.objectStore(this.storeName).put(JSON.stringify(data), id)
      tx.oncomplete = () => resolve()
      request.onerror = () => reject(new Error('insert error'))
    }))
  }

  async delete (id: IDBValidKey): Promise<void> {
    return await this.dbPromise.then(async db => await new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readwrite')
      const request = tx.objectStore(this.storeName).delete(id)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error('delete error'))
    }))
  }
}
