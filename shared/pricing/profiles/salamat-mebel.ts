/**
 * Salamat Mebel — initial tariff profile (DEV-CP-01).
 *
 * Confirmed prices (owner-confirmed, KZT per linear metre, kitchens):
 *   ЛДСП Россия — 159 500
 *   ЛДСП EGGER  — 205 000
 *   МДФ плёнка  — 247 500
 *   МДФ краска  — 319 000
 *
 * No other approved price source exists in this repository. Wardrobes,
 * artificial stone and additional products are therefore stored as explicit
 * placeholders: `priceKzt: null`, `isConfirmed: false`. They can be exported,
 * edited later and validated, but the engine refuses to calculate them until a
 * confirmed price is entered. Demo values from the previous calculator
 * (drawer 4 500 ₸, mirror door 18 000 ₸, material prices per m²) are NOT
 * approved prices and are deliberately not reused.
 *
 * Average hardware, manufacturing and installation are already included in the
 * main tariffs, so they are listed in `includedServices` and must not be
 * charged again.
 */
import { parseTariffProfile, PRICING_SCHEMA_VERSION, type TariffProfile } from "../schema";

export const SALAMAT_MEBEL_PROFILE_ID = "salamat-mebel";

const INCLUDED_IN_MAIN_TARIFFS = ["hardware", "manufacturing", "installation"];

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export const salamatMebelProfile: TariffProfile = deepFreeze(
  parseTariffProfile({
    profileId: SALAMAT_MEBEL_PROFILE_ID,
    name: "Salamat Mebel",
    schemaVersion: PRICING_SCHEMA_VERSION,
    version: 1,
    currency: "KZT",
    calculationMethod: "LINEAR",
    categories: [
      { categoryId: "kitchen", label: "Кухни" },
      {
        categoryId: "wardrobe",
        label: "Шкафы",
        notes: "Подтверждённые тарифы отсутствуют в утверждённом источнике (DEV-CP-01)",
      },
      {
        categoryId: "artificial-stone",
        label: "Искусственный камень",
        notes: "Отдельные тарифные позиции; цены не подтверждены",
      },
      {
        categoryId: "additional-products",
        label: "Дополнительные изделия",
        notes: "Отдельные тарифные позиции; цены не подтверждены",
      },
    ],
    tariffs: [
      {
        tariffId: "kitchen-ldsp-russia",
        categoryId: "kitchen",
        label: "Кухня — ЛДСП Россия",
        method: "LINEAR",
        unit: "KZT_PER_LINEAR_M",
        priceKzt: 159500,
        isConfirmed: true,
        includesServices: INCLUDED_IN_MAIN_TARIFFS,
        source: "Owner-confirmed price list (DEV-CP-01), ₸/пог. м",
      },
      {
        tariffId: "kitchen-ldsp-egger",
        categoryId: "kitchen",
        label: "Кухня — ЛДСП EGGER",
        method: "LINEAR",
        unit: "KZT_PER_LINEAR_M",
        priceKzt: 205000,
        isConfirmed: true,
        includesServices: INCLUDED_IN_MAIN_TARIFFS,
        source: "Owner-confirmed price list (DEV-CP-01), ₸/пог. м",
      },
      {
        tariffId: "kitchen-mdf-film",
        categoryId: "kitchen",
        label: "Кухня — МДФ плёнка",
        method: "LINEAR",
        unit: "KZT_PER_LINEAR_M",
        priceKzt: 247500,
        isConfirmed: true,
        includesServices: INCLUDED_IN_MAIN_TARIFFS,
        source: "Owner-confirmed price list (DEV-CP-01), ₸/пог. м",
      },
      {
        tariffId: "kitchen-mdf-paint",
        categoryId: "kitchen",
        label: "Кухня — МДФ краска",
        method: "LINEAR",
        unit: "KZT_PER_LINEAR_M",
        priceKzt: 319000,
        isConfirmed: true,
        includesServices: INCLUDED_IN_MAIN_TARIFFS,
        source: "Owner-confirmed price list (DEV-CP-01), ₸/пог. м",
      },

      // ─── Placeholders: no approved source available ─────────────────────────
      {
        tariffId: "wardrobe-ldsp-russia",
        categoryId: "wardrobe",
        label: "Шкаф — ЛДСП Россия",
        method: "LINEAR",
        unit: "KZT_PER_LINEAR_M",
        priceKzt: null,
        isConfirmed: false,
        includesServices: INCLUDED_IN_MAIN_TARIFFS,
        notes: "Цена и метод расчёта не подтверждены утверждённым источником; значение намеренно не задано",
      },
      {
        tariffId: "wardrobe-ldsp-egger",
        categoryId: "wardrobe",
        label: "Шкаф — ЛДСП EGGER",
        method: "LINEAR",
        unit: "KZT_PER_LINEAR_M",
        priceKzt: null,
        isConfirmed: false,
        includesServices: INCLUDED_IN_MAIN_TARIFFS,
        notes: "Цена и метод расчёта не подтверждены утверждённым источником; значение намеренно не задано",
      },
      {
        tariffId: "wardrobe-mdf-film",
        categoryId: "wardrobe",
        label: "Шкаф — МДФ плёнка",
        method: "LINEAR",
        unit: "KZT_PER_LINEAR_M",
        priceKzt: null,
        isConfirmed: false,
        includesServices: INCLUDED_IN_MAIN_TARIFFS,
        notes: "Цена и метод расчёта не подтверждены утверждённым источником; значение намеренно не задано",
      },
      {
        tariffId: "wardrobe-mdf-paint",
        categoryId: "wardrobe",
        label: "Шкаф — МДФ краска",
        method: "LINEAR",
        unit: "KZT_PER_LINEAR_M",
        priceKzt: null,
        isConfirmed: false,
        includesServices: INCLUDED_IN_MAIN_TARIFFS,
        notes: "Цена и метод расчёта не подтверждены утверждённым источником; значение намеренно не задано",
      },
      {
        tariffId: "stone-countertop",
        categoryId: "artificial-stone",
        label: "Столешница из искусственного камня",
        method: "UNIT",
        unit: "KZT_PER_UNIT",
        priceKzt: null,
        isConfirmed: false,
        notes: "Отдельная тарифная позиция; подтверждённая цена отсутствует",
      },
      {
        tariffId: "additional-drawer",
        categoryId: "additional-products",
        label: "Дополнительный ящик",
        method: "UNIT",
        unit: "KZT_PER_UNIT",
        priceKzt: null,
        isConfirmed: false,
        notes: "Демонстрационная цена 4 500 ₸ прежнего калькулятора не является утверждённым прайсом",
      },
      {
        tariffId: "additional-mirror-door",
        categoryId: "additional-products",
        label: "Зеркальная дверь",
        method: "UNIT",
        unit: "KZT_PER_UNIT",
        priceKzt: null,
        isConfirmed: false,
        notes: "Демонстрационная цена 18 000 ₸ прежнего калькулятора не является утверждённым прайсом",
      },
    ],
    // Additional paid options are separate tariff positions above; no
    // unconfirmed surcharges are invented here.
    extras: [],
    includedServices: [
      {
        serviceId: "hardware",
        label: "Средняя фурнитура",
        notes: "Входит в основные тарифы Salamat Mebel; отдельно не начисляется",
      },
      {
        serviceId: "manufacturing",
        label: "Изготовление",
        notes: "Входит в основные тарифы Salamat Mebel; отдельно не начисляется",
      },
      {
        serviceId: "installation",
        label: "Монтаж",
        notes: "Входит в основные тарифы Salamat Mebel; отдельно не начисляется",
      },
    ],
    // Confirmed rounding rules were not provided; NEAREST 1 ₸ is the neutral
    // default and must be reviewed by the owner.
    roundingRules: { mode: "NEAREST", incrementKzt: 1 },
    updatedAt: "2026-10-20T00:00:00.000Z",
    notes:
      "Подтверждены только кухонные тарифы (₸/пог. м). Остальные позиции — явные незаполненные значения. Правила округления требуют подтверждения.",
  }),
);
