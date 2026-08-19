import { Video } from './types'

type DBState = [string, number, string, Promise<IDBDatabase>?, IDBDatabase?]

const states = new WeakMap<DB, DBState>()

const dbError = Error()

function connect (state: DBState): Promise<IDBDatabase> {
  if (state[3] !== undefined) return state[3]

  state[3] = new Promise<IDBDatabase>((resolve, reject) => {
    if (!window.indexedDB) {
      reject(dbError)
      return
    }
    const request = window.indexedDB.open(state[0], state[1])
    let settled = false
    const fail = (): void => {
      if (settled) return
      settled = true
      state[3] = undefined
      reject(dbError)
    }
    request.onerror = fail
    request.onblocked = fail
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(state[2])) db.createObjectStore(state[2])
    }
    request.onsuccess = () => {
      const db = request.result
      if (settled) {
        db.close()
        return
      }
      settled = true
      state[4] = db
      db.onversionchange = () => release(state, db)
      resolve(db)
    }
  })
  return state[3]
}

function release (state: DBState, db: IDBDatabase): void {
  db.close()
  if (state[4] === db) {
    state[4] = undefined
    state[3] = undefined
  }
}

function transact<T> (
  owner: DB,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
  read?: (value: unknown) => T
): Promise<T> {
  const state = states.get(owner)
  if (state === undefined) return Promise.reject(dbError)
  return connect(state).then(db => new Promise<T>((resolve, reject) => {
    let value = undefined as T
    let issue: unknown
    let tx: IDBTransaction | undefined
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      release(state, db)
      if (issue !== undefined) reject(issue)
      else resolve(value)
    }
    try {
      tx = db.transaction([state[2]], mode)
      tx.oncomplete = finish
      tx.onerror = () => { issue = (tx as IDBTransaction).error || dbError }
      tx.onabort = () => {
        issue = issue || dbError
        finish()
      }
      const request = action(tx.objectStore(state[2]))
      if (read !== undefined) {
        request.onsuccess = () => {
          try {
            value = read(request.result)
          } catch (error) {
            issue = error
          }
        }
      }
    } catch (error) {
      issue = error
      if (tx !== undefined) {
        try {
          tx.abort()
          return
        } catch {}
      }
      finish()
    }
  }))
}

export class DB {
  private readonly storeName: string
  private readonly dbPromise: Promise<IDBDatabase>

  constructor ({ name, version, storeName }: {
    name: string
    version: number
    storeName: string
  } = { name: 'SVGA.DB', version: 1.0, storeName: 'files' }) {
    this.storeName = storeName
    const state: DBState = [name, version, storeName]
    this.dbPromise = connect(state)
    states.set(this, state)
  }

  find (id: IDBValidKey): Promise<Video | undefined> {
    return transact<Video | undefined>(
      this,
      'readonly',
      store => store.get(id),
      value => typeof value === 'string' ? JSON.parse(value) : undefined
    )
  }

  insert (id: IDBValidKey, data: Video): Promise<void> {
    return transact<void>(this, 'readwrite', store => store.put(JSON.stringify(data), id))
  }

  delete (id: IDBValidKey): Promise<void> {
    return transact<void>(this, 'readwrite', store => store.delete(id))
  }
}
