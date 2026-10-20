import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculatePrice } from "../engine";
import { isPricingError } from "../errors";
import { deserializeProfile, parseTariffProfile, serializeProfile } from "../schema";
import { salamatMebelProfile, SALAMAT_MEBEL_PROFILE_ID } from "../profiles/salamat-mebel";
import { makeTestProfile } from "./fixtures";

function expectProfileError(fn: () => unknown): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(isPricingError(error), `expected PricingError, got ${String(error)}`);
    assert.equal(error.code, "INVALID_PROFILE");
    return true;
  });
}

function profileWith(mutate: (raw: Record<string, any>) => void): Record<string, any> {
  const raw = JSON.parse(serializeProfile(makeTestProfile()));
  mutate(raw);
  return raw;
}

describe("tariff profile schema", () => {
  it("accepts a valid profile", () => {
    const profile = makeTestProfile();
    assert.equal(profile.profileId, "test-profile");
    assert.equal(profile.tariffs.length, 5);
  });

  it("round-trips through JSON export/import", () => {
    const profile = makeTestProfile();
    assert.deepEqual(deserializeProfile(serializeProfile(profile)), profile);
  });

  it("rejects negative prices and markups", () => {
    expectProfileError(() => parseTariffProfile(profileWith((p) => (p.tariffs[0].priceKzt = -1))));
    expectProfileError(() => parseTariffProfile(profileWith((p) => (p.tariffs[3].unitCostKzt = -5))));
    expectProfileError(() => parseTariffProfile(profileWith((p) => (p.tariffs[3].markupPercent = -10))));
  });

  it("rejects a money unit that does not match the method", () => {
    expectProfileError(() => parseTariffProfile(profileWith((p) => (p.tariffs[0].unit = "KZT_PER_LINEAR_M"))));
    expectProfileError(() => parseTariffProfile(profileWith((p) => (p.tariffs[1].unit = "KZT_PER_M2"))));
    expectProfileError(() => parseTariffProfile(profileWith((p) => (p.tariffs[2].unit = "KZT_PER_KG"))));
  });

  it("enforces COST_PLUS rules", () => {
    expectProfileError(() => parseTariffProfile(profileWith((p) => delete p.tariffs[3].unitCostKzt)));
    expectProfileError(() => parseTariffProfile(profileWith((p) => delete p.tariffs[3].markupPercent)));
    expectProfileError(() => parseTariffProfile(profileWith((p) => (p.tariffs[3].priceKzt = 40000))));
    expectProfileError(() => parseTariffProfile(profileWith((p) => (p.tariffs[0].unitCostKzt = 1000))));
  });

  it("rejects an unconfirmed position that claims a price and vice versa", () => {
    expectProfileError(() => parseTariffProfile(profileWith((p) => (p.tariffs[0].isConfirmed = true, (p.tariffs[0].priceKzt = null)))));
    const placeholder = parseTariffProfile(
      profileWith((p) => {
        p.tariffs[0].priceKzt = null;
        p.tariffs[0].isConfirmed = false;
      }),
    );
    assert.equal(placeholder.tariffs[0].priceKzt, null);
  });

  it("rejects an unsupported schema version", () => {
    expectProfileError(() => parseTariffProfile(profileWith((p) => (p.schemaVersion = 2))));
    expectProfileError(() => parseTariffProfile(profileWith((p) => delete p.schemaVersion)));
  });

  it("rejects dangling references and duplicates", () => {
    expectProfileError(() => parseTariffProfile(profileWith((p) => (p.tariffs[0].categoryId = "unknown"))));
    expectProfileError(() => parseTariffProfile(profileWith((p) => (p.tariffs[1].tariffId = p.tariffs[0].tariffId))));
    expectProfileError(() => parseTariffProfile(profileWith((p) => (p.extras[1].extraId = p.extras[0].extraId))));
    expectProfileError(() => parseTariffProfile(profileWith((p) => (p.categories[1].categoryId = p.categories[0].categoryId))));
    expectProfileError(() => parseTariffProfile(profileWith((p) => p.tariffs[1].includesServices.push("unknown-service"))));
  });

  it("rejects a profile whose default method is unused", () => {
    expectProfileError(() =>
      parseTariffProfile(
        profileWith((p) => {
          p.calculationMethod = "LINEAR";
          p.tariffs = p.tariffs.filter((tariff: Record<string, unknown>) => tariff.method !== "LINEAR");
        }),
      ),
    );
  });

  it("rejects missing required fields and unknown keys", () => {
    expectProfileError(() => parseTariffProfile(profileWith((p) => delete p.roundingRules)));
    expectProfileError(() => parseTariffProfile(profileWith((p) => (p.tariffs = []))));
    expectProfileError(() => parseTariffProfile(profileWith((p) => (p.currency = "USD"))));
    expectProfileError(() => parseTariffProfile(profileWith((p) => (p.updatedAt = "not-a-date"))));
    expectProfileError(() => parseTariffProfile(profileWith((p) => (p.unexpected = true))));
    expectProfileError(() => parseTariffProfile(profileWith((p) => (p.tariffs[0].unexpected = true))));
  });

  it("rejects malformed JSON on import", () => {
    expectProfileError(() => deserializeProfile("{ not json"));
    expectProfileError(() => deserializeProfile(JSON.stringify({ profileId: "x" })));
  });
});

describe("Salamat Mebel profile", () => {
  it("is valid and identifies itself", () => {
    assert.equal(salamatMebelProfile.profileId, SALAMAT_MEBEL_PROFILE_ID);
    assert.equal(salamatMebelProfile.currency, "KZT");
    assert.equal(salamatMebelProfile.schemaVersion, 1);
    assert.equal(salamatMebelProfile.version, 1);
    assert.equal(salamatMebelProfile.calculationMethod, "LINEAR");
  });

  it("contains the four confirmed kitchen prices", () => {
    const kitchens = salamatMebelProfile.tariffs.filter((tariff) => tariff.categoryId === "kitchen");
    assert.deepEqual(
      kitchens.map((tariff) => [tariff.tariffId, tariff.priceKzt]),
      [
        ["kitchen-ldsp-russia", 159500],
        ["kitchen-ldsp-egger", 205000],
        ["kitchen-mdf-film", 247500],
        ["kitchen-mdf-paint", 319000],
      ],
    );
    kitchens.forEach((tariff) => {
      assert.equal(tariff.method, "LINEAR");
      assert.equal(tariff.unit, "KZT_PER_LINEAR_M");
      assert.equal(tariff.isConfirmed, true);
    });
  });

  it("keeps every unconfirmed position explicitly empty", () => {
    const unconfirmed = salamatMebelProfile.tariffs.filter((tariff) => !tariff.isConfirmed);
    assert.ok(unconfirmed.length >= 6);
    unconfirmed.forEach((tariff) => {
      assert.equal(tariff.priceKzt, null, `${tariff.tariffId} must stay unconfirmed`);
      assert.ok(tariff.notes, `${tariff.tariffId} must explain why it is empty`);
    });
    const ids = unconfirmed.map((tariff) => tariff.tariffId);
    salamatMebelProfile.tariffs.filter((tariff) => tariff.categoryId === "wardrobe").forEach((tariff) => {
      assert.equal(tariff.method, "AREA");
      assert.equal(tariff.unit, "KZT_PER_M2");
    });
    assert.ok(ids.includes("stone-countertop"));
    assert.ok(ids.includes("additional-drawer"));
    assert.ok(ids.includes("additional-mirror-door"));
  });

  it("never reuses demo prices from the previous calculator", () => {
    const demoPrices = [4500, 18000, 8500, 12000, 28000, 15000];
    salamatMebelProfile.tariffs.forEach((tariff) => {
      if (tariff.priceKzt !== null) {
        assert.ok(!demoPrices.includes(tariff.priceKzt), `${tariff.tariffId} uses a demo price`);
      }
    });
  });

  it("declares hardware, manufacturing and installation as included", () => {
    assert.deepEqual(
      salamatMebelProfile.includedServices.map((service) => service.serviceId),
      ["hardware", "manufacturing", "installation"],
    );
    salamatMebelProfile.tariffs
      .filter((tariff) => tariff.categoryId === "kitchen")
      .forEach((tariff) => assert.deepEqual(tariff.includesServices, ["hardware", "manufacturing", "installation"]));
  });

  it("calculates confirmed kitchen tariffs without a server", () => {
    const result = calculatePrice(salamatMebelProfile, {
      tariffId: "kitchen-ldsp-russia",
      dimensionsMm: { lengthMm: 3000 },
    });
    assert.equal(result.profileVersion, 1);
    assert.equal(result.subtotalKzt, 478500);
    assert.equal(result.totalKzt, 478500);
    assert.equal(result.lines[0].measure.value, 3);

    const egger = calculatePrice(salamatMebelProfile, {
      tariffId: "kitchen-ldsp-egger",
      dimensionsMm: { lengthMm: 3000 },
    });
    assert.equal(egger.totalKzt, 615000);
  });

  it("refuses to calculate unconfirmed positions", () => {
    assert.throws(
      () =>
        calculatePrice(salamatMebelProfile, {
          tariffId: "wardrobe-ldsp-russia",
          dimensionsMm: { widthMm: 2000, heightMm: 2500 },
        }),
      (error: unknown) => isPricingError(error) && error.code === "PRICE_NOT_CONFIRMED",
    );
    assert.throws(
      () =>
        calculatePrice(salamatMebelProfile, {
          tariffId: "stone-countertop",
          quantity: 1,
        }),
      (error: unknown) => isPricingError(error) && error.code === "PRICE_NOT_CONFIRMED",
    );
  });

  it("is isolated: editing a copy does not touch the shipped profile", () => {
    const copy = parseTariffProfile(JSON.parse(serializeProfile(salamatMebelProfile)));
    copy.version = 2;
    copy.tariffs[0].priceKzt = 1;
    copy.roundingRules.mode = "DOWN";

    const shipped = salamatMebelProfile.tariffs.find((tariff) => tariff.tariffId === "kitchen-ldsp-russia");
    assert.equal(shipped?.priceKzt, 159500);
    assert.equal(salamatMebelProfile.version, 1);
    assert.equal(salamatMebelProfile.roundingRules.mode, "NEAREST");
    assert.ok(Object.isFrozen(salamatMebelProfile));

    const result = calculatePrice(salamatMebelProfile, {
      tariffId: "kitchen-ldsp-russia",
      dimensionsMm: { lengthMm: 3000 },
    });
    assert.equal(result.totalKzt, 478500);
    assert.equal(result.profileVersion, 1);
  });
});
