import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculatePrice, isPricingError, serializeProfile, salamatMebelProfile, type TariffProfile } from "@shared/pricing";
import {
  addCategory,
  createProfileFromSource,
  duplicateProfile,
  prepareImport,
  renameProfile,
  replaceTariff,
  touchProfile,
  withMethod,
  TEMPLATE_PROFILE_ID,
  isTemplateProfile,
} from "../tariff-profiles";
import { createMemoryStore, ProfileStoreError } from "../tariff-store";

const NOW = "2026-10-20T10:00:00.000Z";
const LATER = "2026-10-20T11:00:00.000Z";

function newProfile(name = "Моя мастерская"): TariffProfile {
  return createProfileFromSource({
    name,
    takenIds: [TEMPLATE_PROFILE_ID],
    takenNames: [salamatMebelProfile.name],
    now: NOW,
  });
}

function expectPricingCode(fn: () => unknown, code: string): void {
  assert.throws(fn, (error: unknown) => isPricingError(error) && error.code === code);
}

describe("profile management", () => {
  it("creates an editable copy from the template", () => {
    const profile = newProfile();
    assert.equal(profile.profileId, "user-moya-masterskaya");
    assert.equal(profile.name, "Моя мастерская");
    assert.equal(profile.schemaVersion, 1);
    assert.equal(profile.version, 1);
    assert.equal(profile.updatedAt, NOW);
    assert.equal(profile.tariffs.length, salamatMebelProfile.tariffs.length);
    assert.equal(profile.roundingRules.mode, salamatMebelProfile.roundingRules.mode);
  });

  it("never mutates the template", () => {
    const snapshot = serializeProfile(salamatMebelProfile);
    const profile = newProfile();
    profile.tariffs[0].priceKzt = 1;
    profile.name = "Изменено";
    profile.version = 99;
    assert.equal(serializeProfile(salamatMebelProfile), snapshot);
    assert.ok(Object.isFrozen(salamatMebelProfile));
  });

  it("creates several independent profiles with unique ids", () => {
    const first = newProfile("Цех");
    const taken = [TEMPLATE_PROFILE_ID, first.profileId];
    const second = createProfileFromSource({ name: "Цех", takenIds: taken, takenNames: [first.name], now: NOW });

    assert.notEqual(second.profileId, first.profileId);
    assert.equal(second.profileId, "user-tseh-2");
    assert.equal(second.name, "Цех 2");

    const renamed = renameProfile(first, "Цех", "user-tseh-1", NOW);
    assert.notEqual(renamed.profileId, second.profileId);
  });

  it("copies any profile including the template, with a distinct id", () => {
    const copy = duplicateProfile(salamatMebelProfile, NOW, [TEMPLATE_PROFILE_ID], [salamatMebelProfile.name]);
    assert.equal(copy.name, "Salamat Mebel (копия)");
    assert.notEqual(copy.profileId, TEMPLATE_PROFILE_ID);
    assert.ok(copy.profileId.startsWith("user-"));

    const secondCopy = duplicateProfile(salamatMebelProfile, NOW, [TEMPLATE_PROFILE_ID, copy.profileId], [
      salamatMebelProfile.name,
      copy.name,
    ]);
    assert.equal(secondCopy.name, "Salamat Mebel (копия 2)");
    assert.notEqual(secondCopy.profileId, copy.profileId);
  });

  it("renames and bumps the version", () => {
    const profile = newProfile();
    const renamed = renameProfile(profile, "Новое имя", profile.profileId, LATER);
    assert.equal(renamed.name, "Новое имя");
    assert.equal(renamed.profileId, profile.profileId);
    assert.equal(renamed.version, profile.version + 1);
    assert.equal(renamed.updatedAt, LATER);
    assert.equal(profile.name, "Моя мастерская", "original object stays untouched");
  });

  it("keeps profiles isolated from each other", () => {
    const a = newProfile("A");
    const b = createProfileFromSource({
      name: "B",
      takenIds: [TEMPLATE_PROFILE_ID, a.profileId],
      takenNames: [a.name],
      now: NOW,
    });

    const editedA = touchProfile(
      replaceTariff(a, { ...a.tariffs[0], priceKzt: 111000, isConfirmed: true }),
      LATER,
    );

    const request = { tariffId: "kitchen-ldsp-russia", dimensionsMm: { lengthMm: 1000 } };
    assert.equal(calculatePrice(editedA, request).totalKzt, 111000);
    assert.equal(calculatePrice(b, request).totalKzt, 159500);
    assert.equal(calculatePrice(salamatMebelProfile, request).totalKzt, 159500);
  });

  it("marks the template as non-editable", () => {
    assert.equal(isTemplateProfile(salamatMebelProfile), true);
    assert.equal(isTemplateProfile(newProfile()), false);
  });

  it("adds custom categories without changing the schema", () => {
    const profile = newProfile();
    const { profile: updated, category } = addCategory(profile, "Столешницы");
    assert.equal(category.categoryId, "stoleshnitsy");
    assert.equal(updated.categories.length, profile.categories.length + 1);

    const again = addCategory(updated, "Столешницы");
    assert.equal(again.category.categoryId, "stoleshnitsy-2");
  });

  it("maps a method change to the matching unit", () => {
    assert.deepEqual(withMethod("AREA"), { method: "AREA", unit: "KZT_PER_M2" });
    assert.deepEqual(withMethod("LINEAR"), { method: "LINEAR", unit: "KZT_PER_LINEAR_M" });
    assert.deepEqual(withMethod("UNIT"), { method: "UNIT", unit: "KZT_PER_UNIT" });
    assert.deepEqual(withMethod("COST_PLUS"), { method: "COST_PLUS", unit: "KZT_PER_UNIT" });
  });
});

describe("tariff editing", () => {
  it("bumps version and updatedAt on every saved change", () => {
    const profile = newProfile();
    const edited = touchProfile(
      replaceTariff(profile, { ...profile.tariffs[0], priceKzt: 170000 }),
      LATER,
    );
    assert.equal(edited.version, 2);
    assert.equal(edited.updatedAt, LATER);
    assert.equal(edited.tariffs[0].priceKzt, 170000);
    assert.equal(profile.tariffs[0].priceKzt, 159500);
  });

  it("calculates every method from an edited profile", () => {
    let profile = newProfile();
    profile = replaceTariff(profile, {
      ...profile.tariffs[0],
      method: "AREA",
      unit: "KZT_PER_M2",
      priceKzt: 50000,
      isConfirmed: true,
    });
    assert.equal(
      calculatePrice(profile, { tariffId: profile.tariffs[0].tariffId, dimensionsMm: { widthMm: 1000, heightMm: 1000 } })
        .totalKzt,
      50000,
    );

    const unitTariff = profile.tariffs.find((tariff) => tariff.tariffId === "additional-drawer")!;
    profile = replaceTariff(profile, {
      ...unitTariff,
      priceKzt: 12000,
      isConfirmed: true,
    });
    assert.equal(calculatePrice(profile, { tariffId: unitTariff.tariffId, quantity: 3 }).totalKzt, 36000);

    const linearTariff = profile.tariffs.find((tariff) => tariff.tariffId === "kitchen-mdf-paint")!;
    assert.equal(
      calculatePrice(profile, { tariffId: linearTariff.tariffId, dimensionsMm: { lengthMm: 2500 } }).totalKzt,
      797500,
    );

    profile = replaceTariff(profile, {
      ...unitTariff,
      method: "COST_PLUS",
      unit: "KZT_PER_UNIT",
      priceKzt: null,
      unitCostKzt: 10000,
      markupPercent: 30,
      isConfirmed: true,
    });
    assert.equal(calculatePrice(profile, { tariffId: unitTariff.tariffId, quantity: 2 }).totalKzt, 26000);
  });

  it("refuses to calculate unconfirmed prices instead of showing 0", () => {
    const profile = newProfile();
    expectPricingCode(
      () => calculatePrice(profile, { tariffId: "additional-drawer", quantity: 1 }),
      "PRICE_NOT_CONFIRMED",
    );
  });

  it("keeps the double-charge guard for included services", () => {
    let profile = newProfile();
    profile = replaceTariff(profile, {
      ...profile.tariffs[0],
      includesServices: ["hardware", "manufacturing", "installation"],
    });
    profile = {
      ...profile,
      extras: [
        {
          extraId: "extra-installation",
          label: "Монтаж отдельно",
          method: "UNIT",
          unit: "KZT_PER_UNIT",
          priceKzt: 50000,
          isConfirmed: true,
          includesServices: [],
          coversServiceId: "installation",
        },
      ],
    };

    expectPricingCode(
      () =>
        calculatePrice(profile, {
          tariffId: "kitchen-ldsp-russia",
          dimensionsMm: { lengthMm: 2000 },
          extras: [{ extraId: "extra-installation" }],
        }),
      "INCLUDED_SERVICE_DOUBLE_CHARGE",
    );
  });

  it("rejects invalid prices produced by the editor", () => {
    const profile = newProfile();
    const broken = { ...profile, tariffs: profile.tariffs.map((tariff) => ({ ...tariff, priceKzt: -5 })) };
    expectPricingCode(
      () => calculatePrice(broken, { tariffId: "kitchen-ldsp-russia", dimensionsMm: { lengthMm: 1000 } }),
      "INVALID_PROFILE",
    );
    expectPricingCode(
      () =>
        calculatePrice(profile, {
          tariffId: "kitchen-ldsp-russia",
          dimensionsMm: { lengthMm: Number.NaN },
        }),
      "INVALID_REQUEST",
    );
    expectPricingCode(
      () =>
        calculatePrice(profile, {
          tariffId: "kitchen-ldsp-russia",
          dimensionsMm: { lengthMm: Number.POSITIVE_INFINITY },
        }),
      "INVALID_REQUEST",
    );
  });
});

describe("import", () => {
  it("imports a valid profile", () => {
    const profile = newProfile("Импорт");
    const outcome = prepareImport(serializeProfile(profile), [], LATER);
    assert.equal(outcome.status, "ok");
    if (outcome.status === "ok") {
      assert.equal(outcome.profile.profileId, profile.profileId);
      assert.equal(outcome.renamedId, false);
      assert.equal(outcome.conflictWith, null);
    }
  });

  it("fails closed on corrupted JSON", () => {
    for (const broken of ["{", "null", "[]", "не json", JSON.stringify({ schemaVersion: 1 })]) {
      const outcome = prepareImport(broken, [], LATER);
      assert.equal(outcome.status, "error", `input ${broken} must be rejected`);
    }
  });

  it("rejects an unsupported schema version", () => {
    const raw = JSON.parse(serializeProfile(newProfile()));
    raw.schemaVersion = 2;
    const outcome = prepareImport(JSON.stringify(raw), [], LATER);
    assert.equal(outcome.status, "error");
    if (outcome.status === "error") assert.match(outcome.message, /версия схемы/i);
  });

  it("rejects negative and inconsistent values", () => {
    const raw = JSON.parse(serializeProfile(newProfile()));
    raw.tariffs[0].priceKzt = -100;
    assert.equal(prepareImport(JSON.stringify(raw), [], LATER).status, "error");

    const wrongUnit = JSON.parse(serializeProfile(newProfile()));
    wrongUnit.tariffs[0].unit = "KZT_PER_UNIT";
    assert.equal(prepareImport(JSON.stringify(wrongUnit), [], LATER).status, "error");
  });

  it("creates a copy on profileId conflict instead of overwriting", () => {
    const existing = newProfile("Существующий");
    const incoming = { ...newProfile("Входящий"), profileId: existing.profileId };

    const outcome = prepareImport(serializeProfile(incoming), [existing], LATER);
    assert.equal(outcome.status, "ok");
    if (outcome.status === "ok") {
      assert.equal(outcome.renamedId, true);
      assert.equal(outcome.conflictWith, "id");
      assert.notEqual(outcome.profile.profileId, existing.profileId);
      assert.equal(outcome.profile.name, "Входящий");
      assert.equal(existing.name, "Существующий");
    }
  });

  it("does not export server settings or lead data", () => {
    const exported = serializeProfile(newProfile());
    assert.doesNotMatch(exported, /clientPhone|sheets_webhook|whatsapp_number|leads/);
  });
});

describe("local store contract (memory implementation)", () => {
  it("saves, restores and switches the active profile", async () => {
    const store = createMemoryStore();
    const profile = newProfile("Хранилище");
    await store.saveProfile(profile, profile.profileId);

    const state = await store.load();
    assert.equal(state.profiles.length, 1);
    assert.equal(state.activeProfileId, profile.profileId);

    const edited = touchProfile(replaceTariff(profile, { ...profile.tariffs[0], priceKzt: 180000 }), LATER);
    await store.saveProfile(edited);
    const reloaded = await store.load();
    assert.equal(reloaded.profiles[0].version, 2);
    assert.equal(reloaded.profiles[0].tariffs[0].priceKzt, 180000);
  });

  it("refuses to store or delete the template", async () => {
    const store = createMemoryStore();
    await assert.rejects(() => store.saveProfile(salamatMebelProfile), ProfileStoreError);
    await assert.rejects(() => store.deleteProfile(TEMPLATE_PROFILE_ID), ProfileStoreError);
  });

  it("deletes a profile and hands the active flag to the next one", async () => {
    const store = createMemoryStore();
    const a = newProfile("A");
    const b = createProfileFromSource({ name: "B", takenIds: [TEMPLATE_PROFILE_ID, a.profileId], takenNames: [a.name], now: NOW });
    await store.saveProfile(a, a.profileId);
    await store.saveProfile(b, b.profileId);

    await store.deleteProfile(b.profileId, a.profileId);
    const state = await store.load();
    assert.deepEqual(state.profiles.map((profile) => profile.profileId), [a.profileId]);
    assert.equal(state.activeProfileId, a.profileId);
  });

  it("validates data before writing", async () => {
    const store = createMemoryStore();
    const profile = newProfile();
    const broken = { ...profile, tariffs: [{ ...profile.tariffs[0], priceKzt: -1 }] };
    await assert.rejects(() => store.saveProfile(broken as TariffProfile), /invalid/i);
    const state = await store.load();
    assert.equal(state.profiles.length, 0, "nothing was written");
  });
});

describe("preview without a server", () => {
  it("calculates locally and performs no network request", () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("network must not be used");
    }) as typeof fetch;

    try {
      const profile = newProfile();
      const result = calculatePrice(profile, {
        tariffId: "kitchen-ldsp-egger",
        dimensionsMm: { lengthMm: 3200 },
      });
      assert.equal(result.totalKzt, 656000);
      assert.equal(result.profileVersion, 1);
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rounds the preview total with the profile rules", () => {
    let profile = newProfile();
    profile = { ...profile, roundingRules: { mode: "UP", incrementKzt: 1000 } };
    const result = calculatePrice(profile, { tariffId: "kitchen-mdf-film", dimensionsMm: { lengthMm: 1234 } });
    assert.equal(result.subtotalKzt, 305415);
    assert.equal(result.totalKzt, 306000);
    assert.equal(result.rounding.adjustmentKzt, 585);
  });
});
