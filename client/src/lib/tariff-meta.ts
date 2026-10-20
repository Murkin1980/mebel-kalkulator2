/**
 * Presentation metadata for the tariff editor (DEV-CP-02).
 * Labels only — no calculation logic lives here.
 */
import type { MeasureUnit, PricingMethod, RoundingMode, TariffUnit } from "@shared/pricing";

export const METHOD_OPTIONS: {
  value: PricingMethod;
  label: string;
  unitLabel: string;
  hint: string;
}[] = [
  {
    value: "AREA",
    label: "Площадь",
    unitLabel: "₸/м²",
    hint: "Цена за квадратный метр: ширина × высота",
  },
  {
    value: "LINEAR",
    label: "Погонный метр",
    unitLabel: "₸/пог. м",
    hint: "Цена за погонный метр: длина",
  },
  {
    value: "UNIT",
    label: "За единицу",
    unitLabel: "₸/шт.",
    hint: "Цена за штуку: количество",
  },
  {
    value: "COST_PLUS",
    label: "Себестоимость + наценка",
    unitLabel: "₸/шт.",
    hint: "Себестоимость × (1 + наценка / 100)",
  },
];

export const ROUNDING_MODE_OPTIONS: { value: RoundingMode; label: string }[] = [
  { value: "NONE", label: "Без округления (до тиына)" },
  { value: "NEAREST", label: "До ближайшего" },
  { value: "UP", label: "Вверх" },
  { value: "DOWN", label: "Вниз" },
];

export function methodLabel(method: PricingMethod): string {
  return METHOD_OPTIONS.find((option) => option.value === method)?.label ?? method;
}

const UNIT_LABELS: Record<TariffUnit, string> = {
  KZT_PER_M2: "₸/м²",
  KZT_PER_LINEAR_M: "₸/пог. м",
  KZT_PER_UNIT: "₸/шт.",
};

export function unitLabel(unit: TariffUnit): string {
  return UNIT_LABELS[unit];
}

export const MEASURE_UNIT_LABELS: Record<MeasureUnit, string> = {
  M2: "м²",
  LINEAR_M: "пог. м",
  UNIT: "шт.",
};

export function formatKzt(value: number): string {
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₸`;
}

/** How a price is shown when it was never confirmed. */
export const UNCONFIRMED_PRICE_LABEL = "Цена не задана";

export function formatPrice(priceKzt: number | null): string {
  return priceKzt === null ? UNCONFIRMED_PRICE_LABEL : formatKzt(priceKzt);
}

const RU_TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya",
};

export function slugifyId(value: string, fallback = "profile"): string {
  const transliterated = Array.from(value.toLowerCase())
    .map((char) => RU_TRANSLIT[char] ?? char)
    .join("");
  const slug = transliterated
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 55);
  return slug.length > 0 ? slug : fallback;
}
