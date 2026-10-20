/**
 * Salamat Calc — independent pricing engine (DEV-CP-01).
 *
 * `calculatePrice` is a pure function:
 * - no network, no storage, no clock, no randomness, no `eval`;
 * - the same validated profile + request always yields the same result;
 * - the applied profile version is recorded in the result, so a quote can be
 *   reproduced later from the profile snapshot it was made with.
 *
 * The engine is intentionally NOT wired into the live API in CP-01.
 */
import { z } from "zod";
import { PricingError } from "./errors";
import {
  DIMENSION_UNIT,
  roundingRulesSchema,
  tariffProfileSchema,
  type PricingMethod,
  type RoundingMode,
  type RoundingRules,
  type Tariff,
  type TariffProfile,
  type TariffUnit,
} from "./schema";

const MM_PER_M = 1000;
/** Money is stored with 1 tiyn (0.01 KZT) precision. */
const TIYN_PER_KZT = 100;

export type MeasureUnit = "M2" | "LINEAR_M" | "UNIT";

// ─── Request ─────────────────────────────────────────────────────────────────
export const dimensionSetSchema = z
  .object({
    widthMm: z.number().finite().positive().optional(),
    heightMm: z.number().finite().positive().optional(),
    lengthMm: z.number().finite().positive().optional(),
  })
  .strict();
export type DimensionSet = z.infer<typeof dimensionSetSchema>;

export const extraRequestSchema = z
  .object({
    extraId: z.string().min(1),
    quantity: z.number().finite().positive().optional(),
    dimensionsMm: dimensionSetSchema.optional(),
  })
  .strict();
export type ExtraRequest = z.infer<typeof extraRequestSchema>;

export const calculationRequestSchema = z
  .object({
    tariffId: z.string().min(1),
    quantity: z.number().finite().positive().optional(),
    dimensionsMm: dimensionSetSchema.optional(),
    extras: z.array(extraRequestSchema).optional(),
    /** Optional override of the profile rounding rules for this calculation. */
    roundingRules: roundingRulesSchema.optional(),
  })
  .strict();

export type CalculationRequest = z.input<typeof calculationRequestSchema>;

// ─── Result ──────────────────────────────────────────────────────────────────
export interface CalculationLine {
  sourceType: "TARIFF" | "EXTRA";
  sourceId: string;
  label: string;
  method: PricingMethod;
  unit: TariffUnit;
  measure: { value: number; unit: MeasureUnit };
  quantity: number;
  unitPriceKzt: number;
  amountKzt: number;
}

export interface CalculationResult {
  profileId: string;
  profileName: string;
  /** Content version of the profile that produced this result. */
  profileVersion: number;
  profileUpdatedAt: string;
  /** Structure version of the profile schema. */
  schemaVersion: number;
  currency: "KZT";
  dimensionUnit: "mm";
  method: PricingMethod;
  tariffId: string;
  lines: CalculationLine[];
  /** Services already covered by the selected tariff — never charge them again. */
  includedServices: string[];
  subtotalKzt: number;
  rounding: { mode: RoundingMode; incrementKzt: number; adjustmentKzt: number };
  totalKzt: number;
}

// ─── Money helpers (integer tiyn arithmetic) ─────────────────────────────────
function toTiyn(kzt: number): number {
  return Math.round(kzt * TIYN_PER_KZT);
}

function fromTiyn(tiyn: number): number {
  return tiyn / TIYN_PER_KZT;
}

function roundToIncrement(tiyn: number, rules: RoundingRules): number {
  if (rules.mode === "NONE") return tiyn;
  const increment = toTiyn(rules.incrementKzt);
  if (increment <= 0) {
    throw new PricingError("INVALID_PROFILE", "rounding increment must be greater than zero");
  }
  const quotient = tiyn / increment;
  switch (rules.mode) {
    case "NEAREST":
      return Math.round(quotient) * increment;
    case "UP":
      return Math.ceil(quotient) * increment;
    case "DOWN":
      return Math.floor(quotient) * increment;
    default:
      return tiyn;
  }
}

/** Keeps derived measures readable (1.5 m × 0.7 m must be 1.05, not 1.0499…). */
function toMeasure(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

// ─── Line calculation ────────────────────────────────────────────────────────
type PricedItem = Pick<Tariff, "label" | "method" | "unit" | "priceKzt" | "unitCostKzt" | "markupPercent">;

function computeLine(
  item: PricedItem,
  id: string,
  sourceType: CalculationLine["sourceType"],
  input: { quantity?: number; dimensionsMm?: DimensionSet },
): CalculationLine {
  const quantity = input.quantity ?? 1;
  const dimensions = input.dimensionsMm ?? {};
  const base = { sourceType, sourceId: id, label: item.label, method: item.method, unit: item.unit, quantity };

  if (item.method === "COST_PLUS") {
    if (item.unitCostKzt === undefined || item.markupPercent === undefined) {
      throw new PricingError("INVALID_PROFILE", `COST_PLUS position "${id}" has no cost or markup`, { id });
    }
    const unitPriceTiyn = Math.round(toTiyn(item.unitCostKzt) * (1 + item.markupPercent / 100));
    return {
      ...base,
      measure: { value: 1, unit: "UNIT" },
      unitPriceKzt: fromTiyn(unitPriceTiyn),
      amountKzt: fromTiyn(Math.round(quantity * unitPriceTiyn)),
    };
  }

  if (item.priceKzt === null) {
    throw new PricingError(
      "PRICE_NOT_CONFIRMED",
      `${sourceType === "TARIFF" ? "Tariff" : "Extra"} "${id}" has no confirmed price and cannot be calculated`,
      { id },
    );
  }

  const priceTiyn = toTiyn(item.priceKzt);

  if (item.method === "AREA") {
    const { widthMm, heightMm } = dimensions;
    if (widthMm === undefined || heightMm === undefined) {
      throw new PricingError("DIMENSIONS_REQUIRED", `AREA position "${id}" requires widthMm and heightMm`, { id });
    }
    const squareMetres = (widthMm / MM_PER_M) * (heightMm / MM_PER_M);
    return {
      ...base,
      measure: { value: toMeasure(squareMetres), unit: "M2" },
      unitPriceKzt: fromTiyn(priceTiyn),
      amountKzt: fromTiyn(Math.round(squareMetres * quantity * priceTiyn)),
    };
  }

  if (item.method === "LINEAR") {
    const { lengthMm } = dimensions;
    if (lengthMm === undefined) {
      throw new PricingError("DIMENSIONS_REQUIRED", `LINEAR position "${id}" requires lengthMm`, { id });
    }
    const linearMetres = lengthMm / MM_PER_M;
    return {
      ...base,
      measure: { value: toMeasure(linearMetres), unit: "LINEAR_M" },
      unitPriceKzt: fromTiyn(priceTiyn),
      amountKzt: fromTiyn(Math.round(linearMetres * quantity * priceTiyn)),
    };
  }

  return {
    ...base,
    measure: { value: 1, unit: "UNIT" },
    unitPriceKzt: fromTiyn(priceTiyn),
    amountKzt: fromTiyn(Math.round(quantity * priceTiyn)),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────
/**
 * Calculates one position (a tariff plus optional chargeable extras).
 *
 * @param profile validated tariff profile (re-validated here so the engine is
 *                safe even with data that bypassed the schema)
 * @param request calculation request, dimensions in millimetres
 */
export function calculatePrice(profile: TariffProfile, request: CalculationRequest): CalculationResult {
  const parsedProfile = tariffProfileSchema.safeParse(profile);
  if (!parsedProfile.success) {
    throw new PricingError("INVALID_PROFILE", "Tariff profile is invalid", parsedProfile.error.flatten());
  }
  const safeProfile = parsedProfile.data;

  const parsedRequest = calculationRequestSchema.safeParse(request);
  if (!parsedRequest.success) {
    throw new PricingError("INVALID_REQUEST", "Calculation request is invalid", parsedRequest.error.flatten());
  }
  const safeRequest = parsedRequest.data;

  const tariff = safeProfile.tariffs.find((item) => item.tariffId === safeRequest.tariffId);
  if (!tariff) {
    throw new PricingError(
      "TARIFF_NOT_FOUND",
      `Tariff "${safeRequest.tariffId}" is not defined in profile "${safeProfile.profileId}"`,
      { tariffId: safeRequest.tariffId },
    );
  }

  const includedServiceIds = new Set(safeProfile.includedServices.map((service) => service.serviceId));
  const tariffServiceIds = new Set(tariff.includesServices);

  const lines: CalculationLine[] = [
    computeLine(tariff, tariff.tariffId, "TARIFF", {
      quantity: safeRequest.quantity,
      dimensionsMm: safeRequest.dimensionsMm,
    }),
  ];

  for (const extraRequest of safeRequest.extras ?? []) {
    const extra = safeProfile.extras.find((item) => item.extraId === extraRequest.extraId);
    if (!extra) {
      throw new PricingError(
        "EXTRA_NOT_FOUND",
        `Extra "${extraRequest.extraId}" is not defined in profile "${safeProfile.profileId}"`,
        { extraId: extraRequest.extraId },
      );
    }
    if (
      extra.coversServiceId !== undefined &&
      (includedServiceIds.has(extra.coversServiceId) || tariffServiceIds.has(extra.coversServiceId))
    ) {
      throw new PricingError(
        "INCLUDED_SERVICE_DOUBLE_CHARGE",
        `Extra "${extra.extraId}" charges service "${extra.coversServiceId}" which is already included in the price`,
        { extraId: extra.extraId, serviceId: extra.coversServiceId },
      );
    }
    lines.push(
      computeLine(extra, extra.extraId, "EXTRA", {
        quantity: extraRequest.quantity,
        dimensionsMm: extraRequest.dimensionsMm,
      }),
    );
  }

  const subtotalTiyn = lines.reduce((sum, line) => sum + toTiyn(line.amountKzt), 0);
  const rules = safeRequest.roundingRules ?? safeProfile.roundingRules;
  const totalTiyn = roundToIncrement(subtotalTiyn, rules);

  return {
    profileId: safeProfile.profileId,
    profileName: safeProfile.name,
    profileVersion: safeProfile.version,
    profileUpdatedAt: safeProfile.updatedAt,
    schemaVersion: safeProfile.schemaVersion,
    currency: safeProfile.currency,
    dimensionUnit: DIMENSION_UNIT,
    method: tariff.method,
    tariffId: tariff.tariffId,
    lines,
    includedServices: [...tariff.includesServices],
    subtotalKzt: fromTiyn(subtotalTiyn),
    rounding: {
      mode: rules.mode,
      incrementKzt: rules.incrementKzt,
      adjustmentKzt: fromTiyn(totalTiyn - subtotalTiyn),
    },
    totalKzt: fromTiyn(totalTiyn),
  };
}
