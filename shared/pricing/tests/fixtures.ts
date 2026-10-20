/**
 * Shared, fully synthetic test profiles (DEV-CP-01).
 * These prices are test data only and must never be used as business prices.
 */
import { parseTariffProfile, type TariffProfile } from "../schema";

interface FixtureOptions {
  profileId?: string;
  version?: number;
  areaPriceKzt?: number;
}

export function makeTestProfile(options: FixtureOptions = {}): TariffProfile {
  const { profileId = "test-profile", version = 7, areaPriceKzt = 12000 } = options;

  return parseTariffProfile({
    profileId,
    name: "Synthetic test profile",
    schemaVersion: 1,
    version,
    currency: "KZT",
    calculationMethod: "AREA",
    categories: [
      { categoryId: "case", label: "Корпус" },
      { categoryId: "accessories", label: "Аксессуары" },
    ],
    tariffs: [
      {
        tariffId: "area-ldsp",
        categoryId: "case",
        label: "ЛДСП за м²",
        method: "AREA",
        unit: "KZT_PER_M2",
        priceKzt: areaPriceKzt,
        isConfirmed: true,
        includesServices: [],
      },
      {
        tariffId: "linear-kitchen",
        categoryId: "case",
        label: "Кухня за пог. м",
        method: "LINEAR",
        unit: "KZT_PER_LINEAR_M",
        priceKzt: 100000,
        isConfirmed: true,
        includesServices: ["hardware", "manufacturing"],
      },
      {
        tariffId: "unit-drawer",
        categoryId: "accessories",
        label: "Ящик за шт.",
        method: "UNIT",
        unit: "KZT_PER_UNIT",
        priceKzt: 4500,
        isConfirmed: true,
        includesServices: [],
      },
      {
        tariffId: "costplus-door",
        categoryId: "case",
        label: "Дверь (себестоимость + наценка)",
        method: "COST_PLUS",
        unit: "KZT_PER_UNIT",
        priceKzt: null,
        unitCostKzt: 30000,
        markupPercent: 25,
        isConfirmed: true,
        includesServices: [],
      },
      {
        tariffId: "unconfirmed-cabinet",
        categoryId: "case",
        label: "Шкаф (цена не подтверждена)",
        method: "AREA",
        unit: "KZT_PER_M2",
        priceKzt: null,
        isConfirmed: false,
        includesServices: [],
      },
    ],
    extras: [
      {
        extraId: "extra-light",
        label: "Подсветка",
        method: "UNIT",
        unit: "KZT_PER_UNIT",
        priceKzt: 7000,
        isConfirmed: true,
        includesServices: [],
      },
      {
        extraId: "extra-glass",
        label: "Стекло за м²",
        method: "AREA",
        unit: "KZT_PER_M2",
        priceKzt: 25000,
        isConfirmed: true,
        includesServices: [],
      },
      {
        extraId: "extra-hardware",
        label: "Фурнитура отдельной строкой",
        method: "UNIT",
        unit: "KZT_PER_UNIT",
        priceKzt: 5000,
        isConfirmed: true,
        coversServiceId: "hardware",
        includesServices: [],
        notes: "Проверка запрета двойного начисления",
      },
      {
        extraId: "extra-unconfirmed",
        label: "Доплата без подтверждённой цены",
        method: "UNIT",
        unit: "KZT_PER_UNIT",
        priceKzt: null,
        isConfirmed: false,
        includesServices: [],
      },
    ],
    includedServices: [
      { serviceId: "hardware", label: "Фурнитура" },
      { serviceId: "manufacturing", label: "Изготовление" },
    ],
    roundingRules: { mode: "NEAREST", incrementKzt: 1 },
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

/** Second independent profile, used to prove profile isolation. */
export const secondTestProfile: TariffProfile = makeTestProfile({
  profileId: "test-profile-b",
  version: 3,
  areaPriceKzt: 15000,
});
