/**
 * React state for tariff profiles (DEV-CP-02).
 *
 * Holds the loaded profile list, the active profile and the storage status.
 * All persistence goes through the small ProfileStore abstraction; the
 * immutable Salamat Mebel template is always available as a read-only entry.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { salamatMebelProfile, type TariffProfile } from "@shared/pricing";
import {
  ProfileStoreUnavailableError,
  createIndexedDbStore,
  createMemoryStore,
  isIndexedDbAvailable,
  type ProfileStore,
  type ProfileStoreState,
} from "@/lib/tariff-store";
import { isTemplateProfile } from "@/lib/tariff-profiles";

type StorageStatus = "loading" | "indexeddb" | "memory" | "error";

interface TariffProfilesContextValue {
  status: StorageStatus;
  storageMessage: string | null;
  userProfiles: TariffProfile[];
  /** Template first, then user profiles. */
  allProfiles: TariffProfile[];
  activeProfileId: string | null;
  activeProfile: TariffProfile;
  lastError: string | null;
  clearError(): void;
  getProfile(profileId: string): TariffProfile | undefined;
  saveProfile(profile: TariffProfile, options?: { setActive?: boolean }): Promise<boolean>;
  setActiveProfile(profileId: string): Promise<void>;
  deleteProfile(profileId: string): Promise<boolean>;
  importProfile(profile: TariffProfile): Promise<boolean>;
  reload(): Promise<void>;
}

const TariffProfilesContext = createContext<TariffProfilesContextValue | null>(null);

export function nowIso(): string {
  return new Date().toISOString();
}

export function TariffProfilesProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<ProfileStore | null>(null);
  const [status, setStatus] = useState<StorageStatus>("loading");
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [state, setState] = useState<ProfileStoreState>({ profiles: [], activeProfileId: null });
  const [lastError, setLastError] = useState<string | null>(null);

  const store = useCallback((): ProfileStore => {
    if (!storeRef.current) {
      if (isIndexedDbAvailable()) {
        storeRef.current = createIndexedDbStore();
      } else {
        storeRef.current = createMemoryStore();
      }
    }
    return storeRef.current;
  }, []);

  const load = useCallback(async () => {
    const currentStore = store();
    try {
      const loaded = await currentStore.load();
      setState(loaded);
      setStatus(isIndexedDbAvailable() ? "indexeddb" : "memory");
      setStorageMessage(
        isIndexedDbAvailable() ? null : "IndexedDB недоступен: изменения сохранятся только до закрытия вкладки",
      );
    } catch (error) {
      if (error instanceof ProfileStoreUnavailableError) {
        // Fall back to memory so the editor stays usable, but never claim
        // that changes were persisted.
        storeRef.current = createMemoryStore();
        const loaded = await storeRef.current.load();
        setState(loaded);
        setStatus("memory");
        setStorageMessage("Локальное хранилище недоступно: изменения не сохранятся после перезагрузки");
        setLastError(error.message);
        return;
      }
      setStatus("error");
      setLastError(error instanceof Error ? error.message : "Не удалось загрузить тарифы");
    }
  }, [store]);

  useEffect(() => {
    void load();
  }, [load]);

  const allProfiles = useMemo(
    () => [salamatMebelProfile, ...state.profiles],
    [state.profiles],
  );

  const activeProfile = useMemo(() => {
    const found = allProfiles.find((profile) => profile.profileId === state.activeProfileId);
    return found ?? salamatMebelProfile;
  }, [allProfiles, state.activeProfileId]);

  const getProfile = useCallback(
    (profileId: string) => allProfiles.find((profile) => profile.profileId === profileId),
    [allProfiles],
  );

  const saveProfile = useCallback(
    async (profile: TariffProfile, options?: { setActive?: boolean }) => {
      if (isTemplateProfile(profile)) {
        setLastError("Стандартный профиль Salamat Mebel нельзя изменить — создайте копию");
        return false;
      }
      const currentStore = store();
      try {
        const setActive = options?.setActive ? profile.profileId : undefined;
        await currentStore.saveProfile(profile, setActive);
        setState((previous) => {
          const nextProfiles = previous.profiles.some((item) => item.profileId === profile.profileId)
            ? previous.profiles.map((item) => (item.profileId === profile.profileId ? profile : item))
            : [...previous.profiles, profile].sort((a, b) => a.name.localeCompare(b.name, "ru"));
          return {
            profiles: nextProfiles,
            activeProfileId: setActive ?? previous.activeProfileId,
          };
        });
        return true;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Не удалось сохранить тарифы");
        return false;
      }
    },
    [store],
  );

  const setActiveProfile = useCallback(
    async (profileId: string) => {
      try {
        // The template is not stored as a profile, but choosing it as active
        // must survive a reload, so the id is written to the meta store.
        await store().setActiveProfile(profileId);
        setState((previous) => ({ ...previous, activeProfileId: profileId }));
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Не удалось выбрать профиль");
      }
    },
    [store],
  );

  const deleteProfile = useCallback(
    async (profileId: string) => {
      const currentStore = store();
      try {
        const remaining = state.profiles.filter((profile) => profile.profileId !== profileId);
        const nextActive = state.activeProfileId === profileId ? remaining[0]?.profileId ?? null : state.activeProfileId;
        await currentStore.deleteProfile(profileId, nextActive);
        setState({ profiles: remaining, activeProfileId: nextActive });
        return true;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Не удалось удалить профиль");
        return false;
      }
    },
    [state.activeProfileId, state.profiles, store],
  );

  const importProfile = useCallback(
    (profile: TariffProfile) => saveProfile(profile),
    [saveProfile],
  );

  const value: TariffProfilesContextValue = {
    status,
    storageMessage,
    userProfiles: state.profiles,
    allProfiles,
    activeProfileId: isTemplateProfile(activeProfile) && state.activeProfileId === null ? null : activeProfile.profileId,
    activeProfile,
    lastError,
    clearError: () => setLastError(null),
    getProfile,
    saveProfile,
    setActiveProfile,
    deleteProfile,
    importProfile,
    reload: load,
  };

  return <TariffProfilesContext.Provider value={value}>{children}</TariffProfilesContext.Provider>;
}

/**
 * Wraps a page in the provider. Applied inside the lazily loaded preview pages
 * so the existing calculator bundle never pays for the tariff layer.
 */
export function withTariffProfiles<P extends object>(Component: React.ComponentType<P>) {
  return function TariffProfilesBoundary(props: P) {
    return (
      <TariffProfilesProvider>
        <Component {...props} />
      </TariffProfilesProvider>
    );
  };
}

export function useTariffProfiles(): TariffProfilesContextValue {
  const context = useContext(TariffProfilesContext);
  if (!context) throw new Error("useTariffProfiles must be used inside TariffProfilesProvider");
  return context;
}
