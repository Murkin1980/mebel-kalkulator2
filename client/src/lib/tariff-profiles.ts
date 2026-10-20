/**
 * Tariff profile management (DEV-CP-02).
 *
 * Pure functions over the DEV-CP-01 profile schema: no React, no IndexedDB,
 * no network. The template profile is never mutated — every user profile is a
 * validated deep copy.
 */
import {
  PRICING_SCHEMA_VERSION,
  parseTariffProfile,
  serializeProfile,
  salamatMebelProfile,
  type ExtraItem,
  type PricingMethod,
  type Tariff,
  type TariffCategory,
  type TariffProfile,
} from "@shared/pricing";
import { slugifyId } from "./tariff-meta";

export const TEMPLATE_PROFILE_ID = salamatMebelProfile.profileId;
/** Prefix for every user-owned copy; the template id is never reused. */
export const USER_PROFILE_PREFIX = "user-";

export function isTemplateProfile(profile: Pick<TariffProfile, "profileId">): boolean {
  return profile.profileId === TEMPLATE_PROFILE_ID;
}

export function cloneProfileData(profile: TariffProfile): TariffProfile {
  return JSON.parse(serializeProfile(profile)) as TariffProfile;
}

export function createProfileId(name: string, taken: Iterable<string>): string {
  const takenIds = new Set(taken);
  const base = `${USER_PROFILE_PREFIX}${slugifyId(name, "profil")}`;
  if (!takenIds.has(base)) return base;
  let index = 2;
  while (takenIds.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

export interface NameCopyOptions {
  name: string;
  source?: TariffProfile;
  takenIds: Iterable<string>;
  takenNames: Iterable<string>;
  now: string;
}

function copyName(base: string, takenNames: Iterable<string>): string {
  const taken = new Set(takenNames);
  const candidate = `${base} (копия)`;
  if (!taken.has(candidate)) return candidate;
  let index = 2;
  while (taken.has(`${base} (копия ${index})`)) index += 1;
  return `${base} (копия ${index})`;
}

/**
 * Creates a user-owned profile from the template (or another profile).
 * Structure version stays at the schema version, content version starts at 1.
 */
export function createProfileFromSource(options: NameCopyOptions): TariffProfile {
  const source = options.source ?? salamatMebelProfile;
  const data = cloneProfileData(source);
  const name = options.name.trim() || `Профиль ${new Date(options.now).toLocaleDateString("ru-RU")}`;

  return parseTariffProfile({
    ...data,
    profileId: createProfileId(name, options.takenIds),
    name: uniqueName(name, options.takenNames),
    schemaVersion: PRICING_SCHEMA_VERSION,
    version: 1,
    updatedAt: options.now,
    notes: `Создан на основе профиля «${source.name}» (версия ${source.version})`,
  });
}

/** Copies any profile (including the template) into a new user profile. */
export function duplicateProfile(profile: TariffProfile, now: string, takenIds: Iterable<string>, takenNames: Iterable<string>): TariffProfile {
  return createProfileFromSource({
    name: copyName(profile.name, takenNames),
    source: profile,
    takenIds,
    takenNames,
    now,
  });
}

function uniqueName(name: string, takenNames: Iterable<string>): string {
  const taken = new Set(takenNames);
  if (!taken.has(name)) return name;
  let index = 2;
  while (taken.has(`${name} ${index}`)) index += 1;
  return `${name} ${index}`;
}

/** Renames a profile and marks its content as changed. */
export function renameProfile(profile: TariffProfile, name: string, id: string, now: string): TariffProfile {
  return parseTariffProfile({ ...cloneProfileData(profile), profileId: id, name: name.trim(), updatedAt: now, version: profile.version + 1 });
}

/** Marks content changed: bumps version, records the timestamp. */
export function touchProfile(profile: TariffProfile, now: string): TariffProfile {
  return { ...cloneProfileData(profile), version: profile.version + 1, updatedAt: now };
}

// ─── Editing helpers (pure, return new objects) ──────────────────────────────
export function blankTariff(categoryId: string, takenIds: Iterable<string>): Tariff {
  const taken = new Set(takenIds);
  let index = 1;
  while (taken.has(`tariff-${index}`)) index += 1;
  return {
    tariffId: `tariff-${index}`,
    categoryId,
    label: "",
    method: "UNIT",
    unit: "KZT_PER_UNIT",
    priceKzt: null,
    isConfirmed: false,
    includesServices: [],
  };
}

export function blankExtra(takenIds: Iterable<string>): ExtraItem {
  const taken = new Set(takenIds);
  let index = 1;
  while (taken.has(`extra-${index}`)) index += 1;
  return {
    extraId: `extra-${index}`,
    label: "",
    method: "UNIT",
    unit: "KZT_PER_UNIT",
    priceKzt: null,
    isConfirmed: false,
    includesServices: [],
  };
}

export function replaceTariff(profile: TariffProfile, tariff: Tariff): TariffProfile {
  return {
    ...profile,
    tariffs: profile.tariffs.map((item) => (item.tariffId === tariff.tariffId ? tariff : item)),
  };
}

export function removeTariff(profile: TariffProfile, tariffId: string): TariffProfile {
  return { ...profile, tariffs: profile.tariffs.filter((item) => item.tariffId !== tariffId) };
}

export function replaceExtra(profile: TariffProfile, extra: ExtraItem): TariffProfile {
  return { ...profile, extras: profile.extras.map((item) => (item.extraId === extra.extraId ? extra : item)) };
}

export function removeExtra(profile: TariffProfile, extraId: string): TariffProfile {
  return { ...profile, extras: profile.extras.filter((item) => item.extraId !== extraId) };
}

export function addCategory(profile: TariffProfile, label: string): { profile: TariffProfile; category: TariffCategory } {
  const taken = new Set(profile.categories.map((category) => category.categoryId));
  const base = slugifyId(label, "category");
  let categoryId = base;
  let index = 2;
  while (taken.has(categoryId)) {
    categoryId = `${base}-${index}`;
    index += 1;
  }
  const category: TariffCategory = { categoryId, label: label.trim() };
  return { profile: { ...profile, categories: [...profile.categories, category] }, category };
}

/** Switches the method and keeps the money unit consistent with the method. */
export function withMethod(method: PricingMethod): Partial<Tariff> & Partial<ExtraItem> {
  switch (method) {
    case "AREA":
      return { method, unit: "KZT_PER_M2" };
    case "LINEAR":
      return { method, unit: "KZT_PER_LINEAR_M" };
    default:
      return { method, unit: "KZT_PER_UNIT" };
  }
}

// ─── Import ──────────────────────────────────────────────────────────────────
export type ImportOutcome =
  | { status: "ok"; profile: TariffProfile; renamedId: boolean; conflictWith: "id" | "name" | null }
  | { status: "error"; message: string; issues?: string[] };

/**
 * Fail-closed import: invalid JSON never reaches storage.
 * A profileId conflict creates a copy instead of overwriting the existing profile.
 */
export function prepareImport(
  json: string,
  existing: TariffProfile[],
  now: string,
): ImportOutcome {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { status: "error", message: "Файл не является корректным JSON" };
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { status: "error", message: "Ожидается один объект тарифного профиля" };
  }

  const schemaVersion = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (schemaVersion !== PRICING_SCHEMA_VERSION) {
    return {
      status: "error",
      message: `Неподдерживаемая версия схемы: ${String(schemaVersion ?? "отсутствует")}. Ожидается ${PRICING_SCHEMA_VERSION}.`,
    };
  }

  let parsed: TariffProfile;
  try {
    parsed = parseTariffProfile(raw);
  } catch (error) {
    const details = (error as { details?: { fieldErrors?: Record<string, unknown>; formErrors?: string[] } }).details;
    const issues: string[] = [];
    if (details?.formErrors) issues.push(...details.formErrors);
    if (details?.fieldErrors) {
      for (const [field, messages] of Object.entries(details.fieldErrors)) {
        const list = Array.isArray(messages) ? messages.map(String) : [String(messages)];
        issues.push(`${field}: ${list.join("; ")}`);
      }
    }
    return { status: "error", message: "Профиль не прошёл проверку схемы", issues: issues.slice(0, 8) };
  }

  const idConflict = existing.find((profile) => profile.profileId === parsed.profileId);
  if (idConflict) {
    const copy = createProfileFromSource({
      name: parsed.name,
      source: parsed,
      takenIds: existing.map((profile) => profile.profileId),
      takenNames: existing.map((profile) => profile.name),
      now,
    });
    return { status: "ok", profile: { ...copy, version: Math.max(1, parsed.version), updatedAt: now }, renamedId: true, conflictWith: "id" };
  }

  const nameConflict = existing.find((profile) => profile.name.trim().toLowerCase() === parsed.name.trim().toLowerCase());
  return {
    status: "ok",
    profile: { ...parsed, updatedAt: now },
    renamedId: false,
    conflictWith: nameConflict ? "name" : null,
  };
}

export { parseTariffProfile, serializeProfile };
