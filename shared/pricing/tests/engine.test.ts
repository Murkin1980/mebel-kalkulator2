import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculatePrice, type CalculationRequest } from "../engine";
import { isPricingError } from "../errors";
import { deserializeProfile, parseTariffProfile, serializeProfile } from "../schema";
import { makeTestProfile, secondTestProfile } from "./fixtures";

const profile = makeTestProfile();

function expectCode(fn: () => unknown, code: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(isPricingError(error), `expected PricingError, got ${String(error)}`);
    assert.equal(error.code, code);
    return true;
  });
}

describe("pricing methods", () => {
  it("AREA: width × height × price per m²", () => {
    const result = calculatePrice(profile, {
      tariffId: "area-ldsp",
      dimensionsMm: { widthMm: 2000, heightMm: 1000 },
    });
    assert.equal(result.method, "AREA");
    assert.equal(result.lines[0].measure.value, 2);
    assert.equal(result.lines[0].measure.unit, "M2");
    assert.equal(result.lines[0].unitPriceKzt, 12000);
    assert.equal(result.lines[0].amountKzt, 24000);
    assert.equal(result.totalKzt, 24000);
  });

  it("LINEAR: length × price per linear metre", () => {
    const result = calculatePrice(profile, {
      tariffId: "linear-kitchen",
      dimensionsMm: { lengthMm: 3000 },
    });
    assert.equal(result.method, "LINEAR");
    assert.equal(result.lines[0].measure.value, 3);
    assert.equal(result.lines[0].measure.unit, "LINEAR_M");
    assert.equal(result.totalKzt, 300000);
  });

  it("UNIT: quantity × price per unit", () => {
    const result = calculatePrice(profile, { tariffId: "unit-drawer", quantity: 4 });
    assert.equal(result.method, "UNIT");
    assert.equal(result.lines[0].amountKzt, 18000);
    assert.equal(result.totalKzt, 18000);
  });

  it("COST_PLUS: cost × (1 + markup / 100)", () => {
    const single = calculatePrice(profile, { tariffId: "costplus-door" });
    assert.equal(single.method, "COST_PLUS");
    assert.equal(single.lines[0].unitPriceKzt, 37500);
    assert.equal(single.totalKzt, 37500);

    const triple = calculatePrice(profile, { tariffId: "costplus-door", quantity: 3 });
    assert.equal(triple.totalKzt, 112500);
  });

  it("LINEAR and AREA multiply by quantity as well as by size", () => {
    const result = calculatePrice(profile, {
      tariffId: "linear-kitchen",
      dimensionsMm: { lengthMm: 1500 },
      quantity: 2,
    });
    assert.equal(result.lines[0].measure.value, 1.5);
    assert.equal(result.totalKzt, 300000);
  });
});

describe("millimetre to metre conversion", () => {
  it("converts LINEAR millimetres to linear metres", () => {
    assert.equal(
      calculatePrice(profile, { tariffId: "linear-kitchen", dimensionsMm: { lengthMm: 1000 } }).lines[0].measure.value,
      1,
    );
    assert.equal(
      calculatePrice(profile, { tariffId: "linear-kitchen", dimensionsMm: { lengthMm: 2500 } }).lines[0].measure.value,
      2.5,
    );
    assert.equal(
      calculatePrice(profile, { tariffId: "linear-kitchen", dimensionsMm: { lengthMm: 1234 } }).totalKzt,
      123400,
    );
  });

  it("converts AREA millimetres to square metres", () => {
    const result = calculatePrice(profile, {
      tariffId: "area-ldsp",
      dimensionsMm: { widthMm: 1500, heightMm: 700 },
    });
    assert.equal(result.lines[0].measure.value, 1.05);
    assert.equal(result.totalKzt, 12600);
  });
});

describe("configurable rounding", () => {
  // 1 234 mm × 567 mm = 0,699678 m² × 12 000 ₸/m² = 8 396,136 ₸
  const request: CalculationRequest = {
    tariffId: "area-ldsp",
    dimensionsMm: { widthMm: 1234, heightMm: 567 },
  };

  it("keeps tiyn precision when rounding is NONE", () => {
    const result = calculatePrice(profile, { ...request, roundingRules: { mode: "NONE", incrementKzt: 1 } });
    assert.equal(result.subtotalKzt, 8396.14);
    assert.equal(result.totalKzt, 8396.14);
    assert.equal(result.rounding.adjustmentKzt, 0);
  });

  it("rounds to the nearest increment", () => {
    const result = calculatePrice(profile, { ...request, roundingRules: { mode: "NEAREST", incrementKzt: 100 } });
    assert.equal(result.subtotalKzt, 8396.14);
    assert.equal(result.totalKzt, 8400);
    assert.equal(Number(result.rounding.adjustmentKzt.toFixed(2)), 3.86);
  });

  it("rounds up and down to the configured increment", () => {
    const up = calculatePrice(profile, { ...request, roundingRules: { mode: "UP", incrementKzt: 1000 } });
    assert.equal(up.totalKzt, 9000);

    const down = calculatePrice(profile, { ...request, roundingRules: { mode: "DOWN", incrementKzt: 100 } });
    assert.equal(down.totalKzt, 8300);
    assert.equal(Number(down.rounding.adjustmentKzt.toFixed(2)), -96.14);
  });

  it("falls back to the profile rounding rules and records them", () => {
    const result = calculatePrice(profile, request);
    assert.equal(result.rounding.mode, "NEAREST");
    assert.equal(result.rounding.incrementKzt, 1);
    assert.equal(result.totalKzt, 8396);
  });
});

describe("extra positions", () => {
  it("adds extra lines to the total", () => {
    const result = calculatePrice(profile, {
      tariffId: "linear-kitchen",
      dimensionsMm: { lengthMm: 3000 },
      extras: [
        { extraId: "extra-light", quantity: 2 },
        { extraId: "extra-glass", dimensionsMm: { widthMm: 1000, heightMm: 500 } },
      ],
    });
    assert.equal(result.lines.length, 3);
    assert.equal(result.lines[1].sourceType, "EXTRA");
    assert.equal(result.lines[1].sourceId, "extra-light");
    assert.equal(result.lines[1].amountKzt, 14000);
    assert.equal(result.lines[2].amountKzt, 12500);
    assert.equal(result.subtotalKzt, 326500);
    assert.equal(result.totalKzt, 326500);
  });

  it("refuses extras that are not defined in the profile", () => {
    expectCode(
      () =>
        calculatePrice(profile, {
          tariffId: "unit-drawer",
          quantity: 1,
          extras: [{ extraId: "extra-unknown" }],
        }),
      "EXTRA_NOT_FOUND",
    );
  });

  it("refuses extras without a confirmed price", () => {
    expectCode(
      () => calculatePrice(profile, { tariffId: "unit-drawer", extras: [{ extraId: "extra-unconfirmed" }] }),
      "PRICE_NOT_CONFIRMED",
    );
  });
});

describe("no double charge for included services", () => {
  it("records the services included in the selected tariff", () => {
    const result = calculatePrice(profile, {
      tariffId: "linear-kitchen",
      dimensionsMm: { lengthMm: 3000 },
    });
    assert.deepEqual(result.includedServices, ["hardware", "manufacturing"]);
    assert.equal(result.lines.length, 1);
  });

  it("rejects an extra that charges a service included in the tariff", () => {
    expectCode(
      () =>
        calculatePrice(profile, {
          tariffId: "linear-kitchen",
          dimensionsMm: { lengthMm: 3000 },
          extras: [{ extraId: "extra-hardware" }],
        }),
      "INCLUDED_SERVICE_DOUBLE_CHARGE",
    );
  });

  it("rejects an extra that charges a service included at profile level", () => {
    expectCode(
      () =>
        calculatePrice(profile, {
          tariffId: "area-ldsp",
          dimensionsMm: { widthMm: 2000, heightMm: 1000 },
          extras: [{ extraId: "extra-hardware" }],
        }),
      "INCLUDED_SERVICE_DOUBLE_CHARGE",
    );
  });
});

describe("input validation", () => {
  it("rejects an unknown tariff", () => {
    expectCode(() => calculatePrice(profile, { tariffId: "nope" }), "TARIFF_NOT_FOUND");
  });

  it("rejects an unconfirmed price", () => {
    expectCode(
      () =>
        calculatePrice(profile, {
          tariffId: "unconfirmed-cabinet",
          dimensionsMm: { widthMm: 1000, heightMm: 1000 },
        }),
      "PRICE_NOT_CONFIRMED",
    );
  });

  it("requires dimensions for AREA and LINEAR", () => {
    expectCode(() => calculatePrice(profile, { tariffId: "area-ldsp" }), "DIMENSIONS_REQUIRED");
    expectCode(
      () => calculatePrice(profile, { tariffId: "area-ldsp", dimensionsMm: { widthMm: 1000 } }),
      "DIMENSIONS_REQUIRED",
    );
    expectCode(() => calculatePrice(profile, { tariffId: "linear-kitchen" }), "DIMENSIONS_REQUIRED");
  });

  it("rejects invalid requests", () => {
    expectCode(
      () => calculatePrice(profile, { tariffId: "area-ldsp", dimensionsMm: { widthMm: -10, heightMm: 1000 } }),
      "INVALID_REQUEST",
    );
    expectCode(() => calculatePrice(profile, { tariffId: "unit-drawer", quantity: 0 }), "INVALID_REQUEST");
    expectCode(
      () => calculatePrice(profile, { tariffId: "unit-drawer", quantity: Number.NaN }),
      "INVALID_REQUEST",
    );
    expectCode(
      () =>
        calculatePrice(profile, {
          tariffId: "unit-drawer",
          quantity: 1,
          roundingRules: { mode: "UP", incrementKzt: 0 },
        }),
      "INVALID_REQUEST",
    );
    expectCode(
      () => calculatePrice(profile, { tariffId: "unit-drawer", dimensionsMm: { widthCm: 100 } } as never),
      "INVALID_REQUEST",
    );
  });

  it("rejects an invalid profile passed directly to the engine", () => {
    const broken = JSON.parse(JSON.stringify(profile));
    broken.tariffs[0].priceKzt = -1;
    expectCode(
      () => calculatePrice(broken as never, { tariffId: "area-ldsp", dimensionsMm: { widthMm: 10, heightMm: 10 } }),
      "INVALID_PROFILE",
    );
  });
});

describe("determinism and versioning", () => {
  const request: CalculationRequest = {
    tariffId: "linear-kitchen",
    dimensionsMm: { lengthMm: 3210 },
    extras: [{ extraId: "extra-light", quantity: 3 }],
  };

  it("returns an identical result for identical inputs", () => {
    assert.deepEqual(calculatePrice(profile, request), calculatePrice(profile, request));
  });

  it("records the applied profile version in the result", () => {
    const result = calculatePrice(profile, request);
    assert.equal(result.profileId, "test-profile");
    assert.equal(result.profileVersion, 7);
    assert.equal(result.profileUpdatedAt, "2026-01-01T00:00:00.000Z");
    assert.equal(result.schemaVersion, 1);
    assert.equal(result.currency, "KZT");
    assert.equal(result.dimensionUnit, "mm");
  });

  it("reproduces a quote from the exported profile snapshot", () => {
    const original = calculatePrice(profile, request);
    const restored = deserializeProfile(serializeProfile(profile));
    assert.deepEqual(calculatePrice(restored, request), original);
  });

  it("keeps totals when only the profile version changes", () => {
    const bumped = parseTariffProfile({ ...JSON.parse(serializeProfile(profile)), version: 8 });
    const result = calculatePrice(bumped, request);
    assert.equal(result.profileVersion, 8);
    assert.equal(result.totalKzt, calculatePrice(profile, request).totalKzt);
  });
});

describe("profile isolation", () => {
  it("does not mix data between profiles", () => {
    const request: CalculationRequest = {
      tariffId: "area-ldsp",
      dimensionsMm: { widthMm: 2000, heightMm: 1000 },
    };

    const first = calculatePrice(profile, request);
    const other = calculatePrice(secondTestProfile, request);
    const firstAgain = calculatePrice(profile, request);

    assert.equal(first.totalKzt, 24000);
    assert.equal(other.totalKzt, 30000);
    assert.equal(other.profileVersion, 3);
    assert.deepEqual(firstAgain, first);
  });

  it("does not mutate the profile passed in", () => {
    const snapshot = JSON.stringify(profile);
    calculatePrice(profile, {
      tariffId: "linear-kitchen",
      dimensionsMm: { lengthMm: 3000 },
      extras: [{ extraId: "extra-light" }],
      roundingRules: { mode: "UP", incrementKzt: 1000 },
    });
    assert.equal(JSON.stringify(profile), snapshot);
  });

  it("lets prices change as data without touching the engine", () => {
    const edited = parseTariffProfile({ ...JSON.parse(serializeProfile(profile)), version: 9 });
    edited.tariffs[0].priceKzt = 20000;
    const result = calculatePrice(edited, {
      tariffId: "area-ldsp",
      dimensionsMm: { widthMm: 2000, heightMm: 1000 },
    });
    assert.equal(result.totalKzt, 40000);
    assert.equal(result.profileVersion, 9);
  });
});
