import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { replaceTariff, createProfileFromSource, TEMPLATE_PROFILE_ID } from "../tariff-profiles";
import {
  createIndexedDbStore,
  isIndexedDbAvailable,
  ProfileStoreError,
  ProfileStoreUnavailableError,
  STORE_DB_NAME,
} from "../tariff-store";
import { installFakeIndexedDb } from "./fake-indexeddb";
import { salamatMebelProfile, type TariffProfile } from "@shared/pricing";

const NOW = "2026-10-20T12:00:00.000Z";

function profileNamed(name: string, takenIds: string[] = []): TariffProfile {
  return createProfileFromSource({
    name,
    takenIds: [TEMPLATE_PROFILE_ID, ...takenIds],
    takenNames: [salamatMebelProfile.name],
    now: NOW,
  });
}

describe("IndexedDB storage", () => {
  let restore: () => void;

  before(() => {
    restore = installFakeIndexedDb().restore;
  });

  after(() => {
    restore();
  });

  it("reports IndexedDB availability", () => {
    assert.equal(isIndexedDbAvailable(), true);
  });

  it("persists a profile and restores it after a reload", async () => {
    const databaseName = STORE_DB_NAME;
    assert.ok(databaseName);

    const store = createIndexedDbStore();
    const profile = profileNamed("Мастерская");
    await store.saveProfile(profile, profile.profileId);

    // A fresh store instance simulates reopening the application.
    const reopened = createIndexedDbStore();
    const state = await reopened.load();
    assert.equal(state.profiles.length, 1);
    assert.equal(state.profiles[0].profileId, profile.profileId);
    assert.equal(state.profiles[0].name, "Мастерская");
    assert.equal(state.activeProfileId, profile.profileId);
  });

  it("restores the active profile id after a reload", async () => {
    const store = createIndexedDbStore();
    const first = profileNamed("Первый");
    const second = profileNamed("Второй", [first.profileId]);
    await store.saveProfile(first, first.profileId);
    await store.saveProfile(second);
    await store.setActiveProfile(second.profileId);

    const state = await createIndexedDbStore().load();
    assert.equal(state.activeProfileId, second.profileId);
  });

  it("remembers the template as the active profile", async () => {
    const store = createIndexedDbStore();
    await store.setActiveProfile(TEMPLATE_PROFILE_ID);
    const state = await createIndexedDbStore().load();
    assert.equal(state.activeProfileId, TEMPLATE_PROFILE_ID);
    assert.equal(state.profiles.some((profile) => profile.profileId === TEMPLATE_PROFILE_ID), false);
  });

  it("updates a profile atomically: version and tariffs change together", async () => {
    const store = createIndexedDbStore();
    const profile = profileNamed("Атомарность");
    await store.saveProfile(profile, profile.profileId);

    const edited: TariffProfile = {
      ...replaceTariff(profile, { ...profile.tariffs[0], priceKzt: 175000 }),
      version: profile.version + 1,
      updatedAt: NOW,
    };
    await store.saveProfile(edited);

    const state = await createIndexedDbStore().load();
    const stored = state.profiles.find((item) => item.profileId === profile.profileId);
    assert.ok(stored);
    assert.equal(stored.version, 2);
    assert.equal(stored.tariffs[0].priceKzt, 175000);
  });

  it("refuses to write or delete the template profile", async () => {
    const store = createIndexedDbStore();
    await assert.rejects(() => store.saveProfile(salamatMebelProfile), ProfileStoreError);
    await assert.rejects(() => store.deleteProfile(TEMPLATE_PROFILE_ID), ProfileStoreError);

    const state = await store.load();
    assert.equal(state.profiles.some((item) => item.profileId === TEMPLATE_PROFILE_ID), false);
  });

  it("rejects invalid data before writing", async () => {
    const store = createIndexedDbStore();
    const profile = profileNamed("Некорректный");
    const broken = { ...profile, tariffs: profile.tariffs.map((tariff) => ({ ...tariff, unitCostKzt: -1 })) };
    await assert.rejects(() => store.saveProfile(broken as TariffProfile), /invalid/i);

    const state = await store.load();
    assert.equal(state.profiles.some((item) => item.profileId === profile.profileId), false);
  });

  it("deletes a profile and moves the active marker", async () => {
    const store = createIndexedDbStore();
    const keep = profileNamed("Остаётся");
    const drop = profileNamed("Удаляется", [keep.profileId]);
    await store.saveProfile(keep, keep.profileId);
    await store.saveProfile(drop, drop.profileId);

    await store.deleteProfile(drop.profileId, keep.profileId);
    const state = await createIndexedDbStore().load();
    assert.equal(state.profiles.some((item) => item.profileId === drop.profileId), false);
    assert.equal(state.activeProfileId, keep.profileId);
  });
});

describe("IndexedDB unavailable", () => {
  it("fails with a typed error instead of losing data silently", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
    Object.defineProperty(globalThis, "indexedDB", { value: undefined, configurable: true, writable: true });
    try {
      assert.equal(isIndexedDbAvailable(), false);
      const store = createIndexedDbStore();
      await assert.rejects(() => store.load(), ProfileStoreUnavailableError);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "indexedDB", descriptor);
    }
  });
});
