/**
 * Salamat Calc — editable tariff profile schema (DEV-CP-01).
 *
 * Design rules:
 * - the module is independent of Express, SQLite and React;
 * - dimensions are always millimetres, money is always KZT;
 * - a profile is plain JSON data, so tariffs are edited as data, never by
 *   changing the engine source;
 * - several profiles may coexist and are isolated: the schema carries its own
 *   `profileId`, content `version` and `schemaVersion`.
 *
 * Nothing in this file performs I/O, network access or code evaluation.
 */
import { z } from "zod";
import { PricingError } from "./errors";

/** Structure version of the profile schema itself. */
export const PRICING_SCHEMA_VERSION = 1;
/** Dimensions are millimetres everywhere in the pricing module. */
export const DIMENSION_UNIT = "mm" as const;
/** Only KZT is supported in DEV-CP-01. */
export const SUPPORTED_CURRENCY = "KZT" as const;

export const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "id must be lowercase latin/digits with dashes");

// ─── Calculation methods ─────────────────────────────────────────────────────
export const pricingMethodSchema = z.enum(["AREA", "LINEAR", "UNIT", "COST_PLUS"]);
export type PricingMethod = z.infer<typeof pricingMethodSchema>;

export const tariffUnitSchema = z.enum(["KZT_PER_M2", "KZT_PER_LINEAR_M", "KZT_PER_UNIT"]);
export type TariffUnit = z.infer<typeof tariffUnitSchema>;

/** Each method has exactly one valid money unit. */
export const REQUIRED_UNIT_BY_METHOD: Record<PricingMethod, TariffUnit> = {
  AREA: "KZT_PER_M2",
  LINEAR: "KZT_PER_LINEAR_M",
  UNIT: "KZT_PER_UNIT",
  COST_PLUS: "KZT_PER_UNIT",
};

// ─── Rounding ────────────────────────────────────────────────────────────────
export const roundingModeSchema = z.enum(["NONE", "NEAREST", "UP", "DOWN"]);
export type RoundingMode = z.infer<typeof roundingModeSchema>;

export const roundingRulesSchema = z
  .object({
    mode: roundingModeSchema,
    /** Rounding step in KZT, e.g. 1, 100, 1000. */
    incrementKzt: z.number().finite().positive(),
  })
  .strict();
export type RoundingRules = z.infer<typeof roundingRulesSchema>;

// ─── Categories and included services ────────────────────────────────────────
export const tariffCategorySchema = z
  .object({
    categoryId: idSchema,
    label: z.string().min(1).max(160),
    notes: z.string().max(500).optional(),
  })
  .strict();
export type TariffCategory = z.infer<typeof tariffCategorySchema>;

/**
 * A service that is already priced into the main tariffs (for Salamat Mebel:
 * average hardware, manufacturing, installation). It must never be charged
 * again as a separate line.
 */
export const includedServiceSchema = z
  .object({
    serviceId: idSchema,
    label: z.string().min(1).max(160),
    notes: z.string().max(500).optional(),
  })
  .strict();
export type IncludedService = z.infer<typeof includedServiceSchema>;

// ─── Priced items (tariffs and extras share one shape) ───────────────────────
const pricedItemFields = {
  label: z.string().min(1).max(160),
  method: pricingMethodSchema,
  unit: tariffUnitSchema,
  /**
   * Price in KZT for the unit declared above. `null` means "not confirmed yet":
   * such a position can be stored and exported, but never calculated silently.
   */
  priceKzt: z.number().finite().nonnegative().nullable(),
  /** COST_PLUS only: own cost per unit, KZT. */
  unitCostKzt: z.number().finite().nonnegative().optional(),
  /** COST_PLUS only: markup over cost, percent. */
  markupPercent: z.number().finite().nonnegative().optional(),
  /** Service ids already covered by this position. */
  includesServices: z.array(idSchema).default([]),
  /** False for explicit "price still unknown" placeholders. */
  isConfirmed: z.boolean(),
  /** Where the price came from (evidence trail). */
  source: z.string().min(1).max(300).optional(),
  notes: z.string().max(500).optional(),
};

type PricedItemInput = {
  method: PricingMethod;
  unit: TariffUnit;
  priceKzt: number | null;
  unitCostKzt?: number;
  markupPercent?: number;
  isConfirmed: boolean;
};

function refinePricedItem(item: PricedItemInput, ctx: z.RefinementCtx): void {
  const expectedUnit = REQUIRED_UNIT_BY_METHOD[item.method];
  if (item.unit !== expectedUnit) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["unit"],
      message: `method ${item.method} requires unit ${expectedUnit}, got ${item.unit}`,
    });
  }

  if (item.method === "COST_PLUS") {
    if (item.unitCostKzt === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unitCostKzt"], message: "COST_PLUS requires unitCostKzt" });
    }
    if (item.markupPercent === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["markupPercent"], message: "COST_PLUS requires markupPercent" });
    }
    if (item.priceKzt !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["priceKzt"],
        message: "COST_PLUS price is derived from cost and markup; priceKzt must be null",
      });
    }
    return;
  }

  if (item.unitCostKzt !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["unitCostKzt"],
      message: `unitCostKzt is only allowed for COST_PLUS, not for ${item.method}`,
    });
  }
  if (item.markupPercent !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["markupPercent"],
      message: `markupPercent is only allowed for COST_PLUS, not for ${item.method}`,
    });
  }
  if (item.isConfirmed && item.priceKzt === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["priceKzt"],
      message: "a confirmed position requires a numeric priceKzt",
    });
  }
}

export const tariffSchema = z
  .object({
    tariffId: idSchema,
    categoryId: idSchema,
    ...pricedItemFields,
  })
  .strict()
  .superRefine(refinePricedItem);
export type Tariff = z.infer<typeof tariffSchema>;

export const extraItemSchema = z
  .object({
    extraId: idSchema,
    /**
     * Service this extra would bill for. If the service is declared as included
     * (profile level or selected tariff), the engine refuses the calculation.
     */
    coversServiceId: idSchema.optional(),
    ...pricedItemFields,
  })
  .strict()
  .superRefine(refinePricedItem);
export type ExtraItem = z.infer<typeof extraItemSchema>;

// ─── Profile ─────────────────────────────────────────────────────────────────
export const tariffProfileSchema = z
  .object({
    profileId: idSchema,
    name: z.string().min(1).max(160),
    schemaVersion: z.literal(PRICING_SCHEMA_VERSION),
    /** Content version of this profile, incremented on every price change. */
    version: z.number().int().positive(),
    currency: z.literal(SUPPORTED_CURRENCY),
    categories: z.array(tariffCategorySchema).min(1),
    /** Default/primary method of the profile; every tariff declares its own. */
    calculationMethod: pricingMethodSchema,
    tariffs: z.array(tariffSchema).min(1),
    extras: z.array(extraItemSchema),
    includedServices: z.array(includedServiceSchema),
    roundingRules: roundingRulesSchema,
    updatedAt: z.string().datetime({ offset: true }),
    notes: z.string().max(1000).optional(),
  })
  .strict()
  .superRefine((profile, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

    const categoryIds = new Set<string>();
    profile.categories.forEach((category, index) => {
      if (categoryIds.has(category.categoryId)) {
        issue(["categories", index, "categoryId"], `duplicate categoryId ${category.categoryId}`);
      }
      categoryIds.add(category.categoryId);
    });

    const tariffIds = new Set<string>();
    profile.tariffs.forEach((tariff, index) => {
      if (tariffIds.has(tariff.tariffId)) {
        issue(["tariffs", index, "tariffId"], `duplicate tariffId ${tariff.tariffId}`);
      }
      tariffIds.add(tariff.tariffId);
      if (!categoryIds.has(tariff.categoryId)) {
        issue(["tariffs", index, "categoryId"], `unknown categoryId ${tariff.categoryId}`);
      }
    });

    const extraIds = new Set<string>();
    profile.extras.forEach((extra, index) => {
      if (extraIds.has(extra.extraId)) {
        issue(["extras", index, "extraId"], `duplicate extraId ${extra.extraId}`);
      }
      extraIds.add(extra.extraId);
    });

    const serviceIds = new Set<string>();
    profile.includedServices.forEach((service, index) => {
      if (serviceIds.has(service.serviceId)) {
        issue(["includedServices", index, "serviceId"], `duplicate serviceId ${service.serviceId}`);
      }
      serviceIds.add(service.serviceId);
    });

    profile.tariffs.forEach((tariff, index) => {
      tariff.includesServices.forEach((serviceId) => {
        if (!serviceIds.has(serviceId)) {
          issue(
            ["tariffs", index, "includesServices"],
            `tariff ${tariff.tariffId} includes unknown service ${serviceId} (declare it in includedServices)`,
          );
        }
      });
    });

    if (!profile.tariffs.some((tariff) => tariff.method === profile.calculationMethod)) {
      issue(["calculationMethod"], `no tariff uses the profile calculationMethod ${profile.calculationMethod}`);
    }
  });

export type TariffProfile = z.infer<typeof tariffProfileSchema>;

// ─── Validation and serialization ────────────────────────────────────────────
/** Validates an untrusted value and returns a profile, or throws PricingError. */
export function parseTariffProfile(input: unknown): TariffProfile {
  const parsed = tariffProfileSchema.safeParse(input);
  if (!parsed.success) {
    throw new PricingError("INVALID_PROFILE", "Tariff profile is invalid", parsed.error.flatten());
  }
  return parsed.data;
}

/** Serializes a validated profile to JSON (export/backup format). */
export function serializeProfile(profile: TariffProfile): string {
  return JSON.stringify(parseTariffProfile(profile), null, 2);
}

/** Parses an exported JSON profile back into a validated profile. */
export function deserializeProfile(json: string): TariffProfile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new PricingError("INVALID_PROFILE", "Tariff profile JSON cannot be parsed");
  }
  return parseTariffProfile(raw);
}
