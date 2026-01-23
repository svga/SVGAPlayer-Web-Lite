import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DB } from './db'
import type { Video } from './types'

describe('DB (IndexedDB)', () => {
  let mockObjectStore: any
  let mockTransaction: any
  let mockDB: any
  let originalIndexedDB: any

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    // Create fresh mocks for each test
    mockObjectStore = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn()
    }

    mockTransaction = {
      objectStore: vi.fn(() => mockObjectStore),
      oncomplete: null,
      onerror: null
    }

    mockDB = {
      transaction: vi.fn(() => mockTransaction),
      createObjectStore: vi.fn()
    }

    // Store original indexedDB
    originalIndexedDB = globalThis.indexedDB
  })

  afterEach(() => {
    vi.useRealTimers()
    // Restore original indexedDB
    if (originalIndexedDB !== undefined) {
      globalThis.indexedDB = originalIndexedDB
    }
  })

  const createMockOpen = (onSetup?: (request: any) => void) => {
    const initRequest: any = {
      result: mockDB,
      onsuccess: null,
      onupgradeneeded: null,
      onerror: null
    }

    const mockOpen = vi.fn(() => {
      // Allow test to do setup with the request
      onSetup?.(initRequest)

      // Trigger success in next microtask
      queueMicrotask(() => {
        if (initRequest.onsuccess) {
          initRequest.onsuccess({} as Event)
        }
      })
      return initRequest
    })

    // Set indexedDB on both globalThis and window (for DB.ts which uses window.indexedDB)
    globalThis.indexedDB = { open: mockOpen } as any
    ;(globalThis as any).window = (globalThis as any).window || {}
    ;(globalThis as any).window.indexedDB = { open: mockOpen }

    return { initRequest, mockOpen }
  }

  const waitForDBInit = async () => {
    // Wait for microtasks to complete
    await new Promise(resolve => queueMicrotask(resolve))
    await new Promise(resolve => queueMicrotask(resolve))
  }

  describe('Constructor', () => {
    it('should initialize with default options', () => {
      const { mockOpen } = createMockOpen()

      const db = new DB()

      expect(mockOpen).toHaveBeenCalledWith('SVGA.DB', 1.0)
      expect(db).toBeInstanceOf(DB)

      // Cleanup happens in afterEach
    })

    it('should initialize with custom options', () => {
      const { mockOpen } = createMockOpen()

      const db = new DB({ name: 'CustomDB', version: 2, storeName: 'customStore' })

      expect(mockOpen).toHaveBeenCalledWith('CustomDB', 2)
      expect(db).toBeInstanceOf(DB)

      // Cleanup happens in afterEach
    })

    it('should throw when IndexedDB is not supported', async () => {
      // Set indexedDB to undefined on both globalThis and window
      const tempIndexedDB = globalThis.indexedDB
      const tempWindowIndexedDB = (globalThis as any).window?.indexedDB

      ;(globalThis as any).indexedDB = undefined
      if ((globalThis as any).window) {
        ;(globalThis as any).window.indexedDB = undefined
      }

      // The DB constructor doesn't throw directly because the error is inside a Promise
      // Instead, we need to test that any operation on the DB will fail
      const db = new DB()

      // When we try to use the DB (e.g., call find), the dbPromise will reject
      await expect(db.find('test-key')).rejects.toThrow('[SVGA.DB] indexedDB not supported')

      // Restore indexedDB
      globalThis.indexedDB = tempIndexedDB
      if (tempWindowIndexedDB && (globalThis as any).window) {
        ;(globalThis as any).window.indexedDB = tempWindowIndexedDB
      }
      // Cleanup happens in afterEach
    })

    it('should create object store on upgradeneeded', async () => {
      const mockCreateObjectStore = vi.fn()

      const dbWithCreate = {
        ...mockDB,
        createObjectStore: mockCreateObjectStore
      }

      const initRequest: any = {
        result: dbWithCreate,
        onsuccess: null,
        onupgradeneeded: null
      }

      const mockOpen = vi.fn(() => {
        queueMicrotask(() => {
          // First trigger onupgradeneeded
          if (initRequest.onupgradeneeded) {
            initRequest.onupgradeneeded({} as Event)
          }
          // Then trigger onsuccess
          if (initRequest.onsuccess) {
            initRequest.onsuccess({} as Event)
          }
        })
        return initRequest
      })

      // Set up indexedDB mock on both globalThis and window
      globalThis.indexedDB = { open: mockOpen } as any
      ;(globalThis as any).window = (globalThis as any).window || {}
      ;(globalThis as any).window.indexedDB = { open: mockOpen }

      new DB({ storeName: 'myStore' })

      await waitForDBInit()

      expect(mockCreateObjectStore).toHaveBeenCalledWith('myStore')

      // Cleanup happens in afterEach
    })
  })

  describe('find()', () => {
    it('should retrieve stored data', async () => {
      createMockOpen()

      const db = new DB()

      const mockGetRequest: any = {
        onsuccess: null,
        onerror: null,
        result: '{"key":"value"}'
      }
      mockObjectStore.get.mockReturnValue(mockGetRequest)

      // Wait for DB init, then call find
      await waitForDBInit()

      const findPromise = db.find('test-key')
      queueMicrotask(() => mockGetRequest.onsuccess?.())

      const result = await findPromise

      expect(mockDB.transaction).toHaveBeenCalledWith(['files'], 'readonly')
      expect(mockObjectStore.get).toHaveBeenCalledWith('test-key')
      expect(result).toEqual({ key: 'value' })

      // Cleanup happens in afterEach
    })

    it('should return undefined for non-existent key', async () => {
      createMockOpen()

      const db = new DB()

      const mockGetRequest: any = {
        onsuccess: null,
        onerror: null,
        result: undefined
      }
      mockObjectStore.get.mockReturnValue(mockGetRequest)

      await waitForDBInit()

      const findPromise = db.find('non-existent')
      queueMicrotask(() => mockGetRequest.onsuccess?.())

      const result = await findPromise
      expect(result).toBeUndefined()

      // Cleanup happens in afterEach
    })

    it('should handle transaction errors', async () => {
      createMockOpen()

      const db = new DB()

      const mockGetRequest: any = {
        onsuccess: null,
        onerror: null
      }
      mockObjectStore.get.mockReturnValue(mockGetRequest)

      await waitForDBInit()

      const findPromise = db.find('test-key')
      queueMicrotask(() => mockGetRequest.onerror?.())

      await expect(findPromise).rejects.toThrow('find error')

      // Cleanup happens in afterEach
    })
  })

  describe('insert()', () => {
    it('should store JSON stringified data', async () => {
      createMockOpen()

      const db = new DB()

      const mockPutRequest: any = {
        onsuccess: null,
        onerror: null
      }
      mockObjectStore.put.mockReturnValue(mockPutRequest)

      await waitForDBInit()

      const videoData = { key: 'value' } as Video
      const insertPromise = db.insert('test-key', videoData)

      // Wait a tick for the async operations to start
      await new Promise(resolve => queueMicrotask(resolve))

      // Now the transaction should have been called
      expect(mockDB.transaction).toHaveBeenCalledWith(['files'], 'readwrite')
      expect(mockObjectStore.put).toHaveBeenCalledWith(JSON.stringify(videoData), 'test-key')

      // Trigger complete
      queueMicrotask(() => {
        if (mockTransaction.oncomplete) {
          (mockTransaction.oncomplete as () => void)()
        }
      })

      await insertPromise

      // Cleanup happens in afterEach
    })

    it('should handle insert errors', async () => {
      createMockOpen()

      const db = new DB()

      const mockPutRequest: any = {
        onsuccess: null,
        onerror: null
      }
      mockObjectStore.put.mockReturnValue(mockPutRequest)

      await waitForDBInit()

      const videoData = { key: 'value' } as Video
      const insertPromise = db.insert('test-key', videoData)

      // insert() uses tx.onerror, not the individual request's onerror
      queueMicrotask(() => {
        if (mockTransaction.onerror) {
          (mockTransaction.onerror as () => void)()
        }
      })

      await expect(insertPromise).rejects.toThrow('insert error')

      // Cleanup happens in afterEach
    })
  })

  describe('delete()', () => {
    it('should remove data from IndexedDB', async () => {
      createMockOpen()

      const db = new DB()

      const mockDeleteRequest: any = {
        onsuccess: null,
        onerror: null
      }
      mockObjectStore.delete.mockReturnValue(mockDeleteRequest)

      await waitForDBInit()

      const deletePromise = db.delete('delete-key')

      // Wait a tick for the async operations to start
      await new Promise(resolve => queueMicrotask(resolve))

      // Now the transaction should have been called
      expect(mockDB.transaction).toHaveBeenCalledWith(['files'], 'readwrite')
      expect(mockObjectStore.delete).toHaveBeenCalledWith('delete-key')

      // Trigger success
      queueMicrotask(() => mockDeleteRequest.onsuccess?.())

      await deletePromise

      // Cleanup happens in afterEach
    })

    it('should handle delete errors', async () => {
      createMockOpen()

      const db = new DB()

      const mockDeleteRequest: any = {
        onsuccess: null,
        onerror: null
      }
      mockObjectStore.delete.mockReturnValue(mockDeleteRequest)

      await waitForDBInit()

      const deletePromise = db.delete('delete-key')

      queueMicrotask(() => mockDeleteRequest.onerror?.())

      await expect(deletePromise).rejects.toThrow('delete error')

      // Cleanup happens in afterEach
    })
  })
})
