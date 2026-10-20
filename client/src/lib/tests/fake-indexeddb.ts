/**
 * Minimal in-memory IndexedDB stand-in for the DEV-CP-02 storage tests.
 *
 * It implements only the API surface used by `tariff-store.ts` — open/upgrade,
 * transactions, get/getAll/getAllKeys/put/delete — so the real IndexedDB code path can be
 * tested in Node without adding a dependency or a real browser.
 */
type StoreName = string;

interface FakeRequest<T> {
  result: T;
  error: Error | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
}

class FakeTransaction {
  readonly error: Error | null = null;
  private pending = 0;
  private completed = false;
  private aborted = false;
  private operations: Array<() => void> = [];
  private completeHandler: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  /** Late listeners still fire, like a transaction that already committed. */
  get oncomplete(): (() => void) | null {
    return this.completeHandler;
  }

  set oncomplete(handler: (() => void) | null) {
    this.completeHandler = handler;
    if (handler && this.completed) this.deliver(handler);
  }

  constructor(
    private readonly db: FakeDatabase,
    private readonly storeNames: StoreName[],
    readonly mode: "readonly" | "readwrite",
    private readonly deliver: (fire: () => void) => void,
  ) {}

  objectStore(name: StoreName): FakeObjectStore {
    if (!this.storeNames.includes(name)) throw new Error(`object store "${name}" is not in this transaction`);
    const store = this.db.rawStore(name);
    return {
      get: (key: IDBValidKey) => this.request(store.data.get(String(key)) as unknown),
      getAll: () => this.request(Array.from(store.data.values()) as unknown),
      getAllKeys: () => this.request(Array.from(store.data.keys()) as unknown),
      put: (value: unknown, key?: IDBValidKey) => {
        const recordKey = this.db.keyFor(name, value, key);
        this.operations.push(() => this.db.put(name, value, recordKey));
        return this.request(recordKey as unknown);
      },
      delete: (key: IDBValidKey) => {
        this.operations.push(() => this.db.remove(name, String(key)));
        return this.request(undefined);
      },
    } as FakeObjectStore;
  }

  abort(): void {
    this.aborted = true;
    this.completed = true;
    this.operations = [];
  }

  private request<T>(value: T): FakeRequest<T> {
    this.pending += 1;
    const request: FakeRequest<T> = { result: value, error: null, onsuccess: null, onerror: null };
    this.deliver(() => request.onsuccess?.());
    this.release();
    return request;
  }

  private release(): void {
    this.pending -= 1;
    if (this.pending === 0 && !this.completed) {
      this.completed = true;
      this.deliver(() => {
        if (!this.aborted) this.operations.forEach((operation) => operation());
        this.completeHandler?.();
      });
    }
  }
}

type FakeObjectStore = {
  get(key: IDBValidKey): FakeRequest<unknown>;
  getAll(): FakeRequest<unknown[]>;
  getAllKeys(): FakeRequest<IDBValidKey[]>;
  put(value: unknown, key?: IDBValidKey): FakeRequest<IDBValidKey>;
  delete(key: IDBValidKey): FakeRequest<undefined>;
};

class FakeStore {
  constructor(
    readonly data: Map<string, unknown> = new Map(),
    readonly keyPath: string | null = null,
  ) {}

}

export class FakeDatabase {
  readonly stores = new Map<StoreName, FakeStore>();

  readonly objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  };

  private readonly deliver = (fire: () => void) => {
    setTimeout(fire, 0);
  };

  createObjectStore(name: StoreName, options?: { keyPath?: string }): void {
    this.stores.set(name, new FakeStore(new Map(), options?.keyPath ?? null));
  }

  rawStore(name: StoreName): FakeStore {
    const store = this.stores.get(name);
    if (!store) throw new Error(`missing store ${name}`);
    return store;
  }

  keyFor(storeName: StoreName, value: unknown, key?: IDBValidKey): string {
    const store = this.rawStore(storeName);
    return key !== undefined
      ? String(key)
      : store.keyPath
        ? String((value as Record<string, unknown>)[store.keyPath])
        : String(store.data.size);
  }

  put(storeName: StoreName, value: unknown, key?: IDBValidKey): IDBValidKey {
    const recordKey = this.keyFor(storeName, value, key);
    this.rawStore(storeName).data.set(recordKey, value);
    return recordKey;
  }

  remove(storeName: StoreName, key: string): undefined {
    this.rawStore(storeName).data.delete(key);
    return undefined;
  }

  transaction(names: StoreName[], mode: "readonly" | "readwrite"): IDBTransaction {
    return new FakeTransaction(this, names, mode, this.deliver) as unknown as IDBTransaction;
  }

  close(): void {
    // no resources to release
  }
}

export function installFakeIndexedDb(): { restore: () => void; getDatabase: (name: string) => FakeDatabase | undefined } {
  const databases = new Map<string, { db: FakeDatabase; version: number }>();

  const fake = {
    open(name: string, version = 1) {
      const request = {
        result: undefined as unknown as FakeDatabase,
        error: null as Error | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onupgradeneeded: null as (() => void) | null,
        onblocked: null as (() => void) | null,
      };
      const existing = databases.get(name);
      const needsUpgrade = !existing || existing.version < version;
      if (!existing) databases.set(name, { db: new FakeDatabase(), version });

      const record = databases.get(name)!;
      request.result = record.db;

      setTimeout(() => {
        if (needsUpgrade) {
          record.version = version;
          request.onupgradeneeded?.();
        }
        request.onsuccess?.();
      }, 0);

      return request;
    },
  };

  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  Object.defineProperty(globalThis, "indexedDB", {
    value: fake,
    configurable: true,
    writable: true,
  });

  return {
    getDatabase: (name) => databases.get(name)?.db,
    restore: () => {
      if (descriptor) Object.defineProperty(globalThis, "indexedDB", descriptor);
      else delete (globalThis as { indexedDB?: unknown }).indexedDB;
    },
  };
}
