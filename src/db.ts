import type { Video } from './types'
import { validateVideo } from './validate-video'

export interface DBOptions {
  name: string
  version: number
  storeName: string
}

interface DBState extends DBOptions {
  connection?: Promise<IDBDatabase>
  database?: IDBDatabase
}

const states = new WeakMap<DB, DBState>()
const dbError = (): Error => Error('IndexedDB operation failed')

function close (state: DBState, database: IDBDatabase): void {
  database.close()
  if (state.database === database) state.database = undefined
  state.connection = undefined
}

function connect (state: DBState): Promise<IDBDatabase> {
  if (state.connection !== undefined) return state.connection
  state.connection = new Promise((resolve, reject) => {
    if (window.indexedDB === undefined) {
      state.connection = undefined
      reject(dbError())
      return
    }
    const request = window.indexedDB.open(state.name, state.version)
    let settled = false
    const fail = (): void => {
      if (settled) return
      settled = true
      state.connection = undefined
      reject(request.error || dbError())
    }
    request.onerror = fail
    request.onblocked = fail
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(state.storeName)) request.result.createObjectStore(state.storeName)
    }
    request.onsuccess = () => {
      const database = request.result
      if (settled) return database.close()
      settled = true
      state.database = database
      database.onversionchange = () => close(state, database)
      resolve(database)
    }
  })
  return state.connection
}

async function transact<T, R = T> (
  owner: DB,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
  convert?: (value: T, store: IDBObjectStore) => R
): Promise<R> {
  const state = states.get(owner)
  if (state === undefined) throw dbError()
  const database = await connect(state)
  return await new Promise<R>((resolve, reject) => {
    let result: R
    let failure: unknown
    let transaction: IDBTransaction | undefined
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      close(state, database)
      if (failure !== undefined) reject(failure)
      else resolve(result)
    }
    try {
      transaction = database.transaction(state.storeName, mode)
      transaction.oncomplete = finish
      transaction.onerror = () => { failure = transaction?.error || dbError() }
      transaction.onabort = () => { failure = failure || transaction?.error || dbError(); finish() }
      const store = transaction.objectStore(state.storeName)
      const request = action(store)
      request.onsuccess = () => {
        try { result = convert === undefined ? request.result as unknown as R : convert(request.result, store) } catch (error) {
          failure = error
          try { transaction?.abort() } catch { finish() }
        }
      }
    } catch (error) {
      failure = error
      if (transaction === undefined) finish()
      else try { transaction.abort() } catch { finish() }
    }
  })
}

function nullMap<T> (): Record<string, T> {
  return Object.create(null) as Record<string, T>
}

function copyImages (value: unknown): Video['images'] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw dbError()
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== null && prototype !== Object.prototype) throw dbError()
  const images = nullMap<Uint8Array>()
  for (const key of Object.keys(value)) images[key] = (value as Record<string, Uint8Array>)[key]
  return images
}

function stableRecord (video: Video): Video {
  validateVideo(video)
  const record = structuredClone({
    version: video.version,
    size: video.size,
    fps: video.fps,
    frames: video.frames,
    images: copyImages(video.images),
    replaceElements: nullMap(),
    dynamicElements: nullMap(),
    sprites: video.sprites
  })
  return restoreRecord(record)
}

function restoreRecord (value: unknown): Video {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw dbError()
  const source = value as Video
  const record: Video = {
    version: source.version,
    size: source.size,
    fps: source.fps,
    frames: source.frames,
    images: copyImages(source.images),
    replaceElements: nullMap(),
    dynamicElements: nullMap(),
    sprites: source.sprites
  }
  return validateVideo(record)
}

export class DB {
  constructor (options: DBOptions = { name: 'SVGA.DB', version: 1, storeName: 'files' }) {
    states.set(this, { ...options })
  }

  async find (id: IDBValidKey): Promise<Video | undefined> {
    return await transact<unknown, Video | undefined>(this, 'readwrite', store => store.get(id), (value, store) => {
      if (value === undefined) return undefined
      try { return restoreRecord(value) } catch {
        const request = store.delete(id)
        request.onerror = event => { event.preventDefault() }
        return undefined
      }
    })
  }

  async insert (id: IDBValidKey, data: Video): Promise<void> {
    const record = stableRecord(data)
    await transact(this, 'readwrite', store => store.put(record, id))
  }

  async delete (id: IDBValidKey): Promise<void> {
    await transact(this, 'readwrite', store => store.delete(id))
  }
}
