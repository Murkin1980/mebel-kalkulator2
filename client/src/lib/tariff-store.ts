/**
 * Local storage for user tariff profiles (DEV-CP-02).
 *
 * IndexedDB is used through a small wrapper around the built-in browser API —
 * no cloud database, no new dependency. The shipped Salamat Mebel template is
 * never written here: the store only accepts user profiles and still guards
 * against overwriting its id.
 *
 * Every write is a single transaction (`readwrite` on one object store), so a
 * profile is either fully written or not written at all.
 */
import {
  parseTariffProfile,
  type TariffProfile,
} from "@shared/pricing";
import { TEMPLATE_PROFILE_ID, isTemplateProfile } from "./tariff-profiles";

export const STORE_DB_NAME = "salamat-calc";
export const STORE_DB_VERSION = 1;
export const PROFILES_STORE = "profiles";
export const META_STORE = "meta";
export const ACTIVE_PROFILE_META_KEY = "activeProfileId";

export interface RejectedProfileRecord {
  /** IndexedDB primary key, not raw user content. */
  key: string;
  /** Safe, data-free validation summary for diagnostics. */
  reason: string;
  /** Kept only in memory until an explicit local recovery export. */
  raw: unknown;
}

export interface ProfileStoreState {
  profiles: TariffProfile[];
  activeProfileId: string | null;
  rejectedProfiles: RejectedProfileRecord[];
}

export interface ProfileStore {
  load(): Promise<ProfileStoreState>;
  /** Atomically writes the profile and (optionally) the active profile id. */
  saveProfile(profile: TariffProfile, activeProfileId?: string | null): Promise<void>;
  setActiveProfile(profileId: string | null): Promise<void>;
  deleteProfile(profileId: string, nextActiveProfileId?: string | null): Promise<void>;
}

export class ProfileStoreError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, ProfileStoreError.prototype);
    this.name = "ProfileStoreError";
  }
}

/** No IndexedDB in this browser/environment. */
export class ProfileStoreUnavailableError extends ProfileStoreError {
  constructor(message = "Локальное хранилище недоступно в этом браузере") {
    super(message);
    Object.setPrototypeOf(this, ProfileStoreUnavailableError.prototype);
    this.name = "ProfileStoreUnavailableError";
  }
}

export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new ProfileStoreError(request.error?.message ?? "Ошибка чтения локального хранилища"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new ProfileStoreError(transaction.error?.message ?? "Ошибка записи в локальное хранилище"));
    transaction.onabort = () => reject(new ProfileStoreError(transaction.error?.message ?? "Запись отменена: локальное хранилище не изменилось"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new ProfileStoreUnavailableError());
  }
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(STORE_DB_NAME, STORE_DB_VERSION);
    } catch (error) {
      reject(new ProfileStoreUnavailableError(error instanceof Error ? error.message : undefined));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROFILES_STORE)) {
        db.createObjectStore(PROFILES_STORE, { keyPath: "profileId" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new ProfileStoreError(request.error?.message ?? "Не удалось открыть локальное хранилище"));
    request.onblocked = () => reject(new ProfileStoreUnavailableError("Хранилище занято другой вкладкой — закройте её и повторите"));
  });
}

export function createIndexedDbStore(): ProfileStore {
  let dbPromise: Promise<IDBDatabase> | null = null;

  function db(): Promise<IDBDatabase> {
    if (!dbPromise) {
      dbPromise = openDatabase().catch((error) => {
        dbPromise = null;
        throw error;
      });
    }
    return dbPromise;
  }

  async function load(): Promise<ProfileStoreState> {
    const database = await db();
    const transaction = database.transaction([PROFILES_STORE, META_STORE], "readonly");
    const profileStore = transaction.objectStore(PROFILES_STORE);
    const [rawProfiles, profileKeys, rawActive] = await Promise.all([
      requestToPromise<unknown[]>(profileStore.getAll()),
      requestToPromise<IDBValidKey[]>(profileStore.getAllKeys()),
      requestToPromise<unknown>(transaction.objectStore(META_STORE).get(ACTIVE_PROFILE_META_KEY)),
    ]);
    await transactionDone(transaction);

    const profiles: TariffProfile[] = [];
    const rejectedProfiles: RejectedProfileRecord[] = [];
    for (let index = 0; index < (rawProfiles ?? []).length; index += 1) {
      const raw = rawProfiles[index];
      const key = String(profileKeys[index] ?? `record-${index + 1}`);
      try {
        const profile = parseTariffProfile(raw);
        if (isTemplateProfile(profile)) {
          rejectedProfiles.push({
            key,
            reason: "Запись пытается подменить защищённый шаблон",
            raw,
          });
        } else {
          profiles.push(profile);
        }
      } catch (error) {
        const fieldErrors = (error as { details?: { fieldErrors?: Record<string, unknown> } })?.details?.fieldErrors;
        const fields = fieldErrors ? Object.keys(fieldErrors).slice(0, 5) : [];
        rejectedProfiles.push({
          key,
          reason: fields.length
            ? `Не пройдена проверка полей: ${fields.join(", ")}`
            : "Запись не прошла проверку схемы профиля",
          raw,
        });
      }
    }
    profiles.sort((a, b) => a.name.localeCompare(b.name, "ru"));

    const activeProfileId =
      typeof rawActive === "string" &&
      (rawActive === TEMPLATE_PROFILE_ID || profiles.some((profile) => profile.profileId === rawActive))
        ? rawActive
        : profiles[0]?.profileId ?? null;

    return { profiles, activeProfileId, rejectedProfiles };
  }

  async function saveProfile(profile: TariffProfile, activeProfileId?: string | null): Promise<void> {
    const validated = parseTariffProfile(profile);
    if (isTemplateProfile(validated)) {
      throw new ProfileStoreError("Стандартный профиль Salamat Mebel нельзя изменить — создайте копию");
    }
    const database = await db();
    const stores = activeProfileId === undefined ? [PROFILES_STORE] : [PROFILES_STORE, META_STORE];
    const transaction = database.transaction(stores, "readwrite");
    try {
      transaction.objectStore(PROFILES_STORE).put(validated);
      if (activeProfileId !== undefined) {
        if (activeProfileId === null) {
          transaction.objectStore(META_STORE).delete(ACTIVE_PROFILE_META_KEY);
        } else {
          transaction.objectStore(META_STORE).put(activeProfileId, ACTIVE_PROFILE_META_KEY);
        }
      }
      await transactionDone(transaction);
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // already finished
      }
      throw error instanceof ProfileStoreError ? error : new ProfileStoreError((error as Error)?.message);
    }
  }

  async function setActiveProfile(profileId: string | null): Promise<void> {
    const database = await db();
    const transaction = database.transaction([META_STORE], "readwrite");
    const store = transaction.objectStore(META_STORE);
    if (profileId === null) store.delete(ACTIVE_PROFILE_META_KEY);
    else store.put(profileId, ACTIVE_PROFILE_META_KEY);
    await transactionDone(transaction);
  }

  async function deleteProfile(profileId: string, nextActiveProfileId?: string | null): Promise<void> {
    if (profileId === TEMPLATE_PROFILE_ID) {
      throw new ProfileStoreError("Стандартный профиль Salamat Mebel нельзя удалить");
    }
    const database = await db();
    const stores = nextActiveProfileId === undefined ? [PROFILES_STORE] : [PROFILES_STORE, META_STORE];
    const transaction = database.transaction(stores, "readwrite");
    transaction.objectStore(PROFILES_STORE).delete(profileId);
    if (nextActiveProfileId !== undefined) {
      const meta = transaction.objectStore(META_STORE);
      if (nextActiveProfileId === null) meta.delete(ACTIVE_PROFILE_META_KEY);
      else meta.put(nextActiveProfileId, ACTIVE_PROFILE_META_KEY);
    }
    await transactionDone(transaction);
  }

  return { load, saveProfile, setActiveProfile, deleteProfile };
}

/** In-memory store used when IndexedDB is unavailable and by unit tests. */
export function createMemoryStore(initial?: Partial<ProfileStoreState>): ProfileStore {
  const profiles = new Map<string, TariffProfile>(
    (initial?.profiles ?? []).map((profile) => [profile.profileId, parseTariffProfile(profile)]),
  );
  let active: string | null = initial?.activeProfileId ?? Array.from(profiles.keys())[0] ?? null;

  return {
    async load() {
      return {
        profiles: Array.from(profiles.values()).sort((a, b) => a.name.localeCompare(b.name, "ru")),
        activeProfileId: active,
        rejectedProfiles: [],
      };
    },
    async saveProfile(profile, activeProfileId) {
      const validated = parseTariffProfile(profile);
      if (isTemplateProfile(validated)) {
        throw new ProfileStoreError("Стандартный профиль Salamat Mebel нельзя изменить — создайте копию");
      }
      profiles.set(validated.profileId, validated);
      if (activeProfileId !== undefined) active = activeProfileId;
    },
    async setActiveProfile(profileId) {
      active = profileId;
    },
    async deleteProfile(profileId, nextActiveProfileId) {
      if (profileId === TEMPLATE_PROFILE_ID) {
        throw new ProfileStoreError("Стандартный профиль Salamat Mebel нельзя удалить");
      }
      profiles.delete(profileId);
      if (nextActiveProfileId !== undefined) active = nextActiveProfileId;
    },
  };
}
