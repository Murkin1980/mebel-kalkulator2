/**
 * Inline editor for one tariff or extra position (DEV-CP-02).
 * Presentation only: values are validated by the shared profile schema
 * before they can be saved.
 */
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type ExtraItem,
  type IncludedService,
  type PricingMethod,
  type Tariff,
  type TariffCategory,
  type TariffUnit,
} from "@shared/pricing";
import { METHOD_OPTIONS, UNCONFIRMED_PRICE_LABEL, unitLabel } from "@/lib/tariff-meta";
import { NumberField } from "./NumberField";

const UNIT_BY_METHOD: Record<PricingMethod, TariffUnit> = {
  AREA: "KZT_PER_M2",
  LINEAR: "KZT_PER_LINEAR_M",
  UNIT: "KZT_PER_UNIT",
  COST_PLUS: "KZT_PER_UNIT",
};

export type PricedDraft = Tariff | ExtraItem;

interface TariffFormProps {
  value: PricedDraft;
  categories: TariffCategory[];
  includedServices: IncludedService[];
  onChange: (next: PricedDraft) => void;
  errors?: string[];
  testIdPrefix?: string;
}

export function TariffForm({ value, categories, includedServices, onChange, errors = [], testIdPrefix = "tariff" }: TariffFormProps) {
  const isCostPlus = value.method === "COST_PLUS";

  function patch(next: Partial<Tariff & ExtraItem>) {
    onChange({ ...value, ...next } as PricedDraft);
  }

  function changeMethod(method: PricingMethod) {
    const unit = UNIT_BY_METHOD[method];
    if (method === "COST_PLUS") {
      patch({
        method,
        unit,
        // Fixed sale price and derived price can never coexist.
        priceKzt: null,
        unitCostKzt: value.unitCostKzt ?? 0,
        markupPercent: value.markupPercent ?? 0,
      });
    } else {
      patch({
        method,
        unit,
        priceKzt: value.priceKzt,
        unitCostKzt: undefined,
        markupPercent: undefined,
      });
    }
  }

  function toggleService(serviceId: string, checked: boolean) {
    const next = checked
      ? [...value.includesServices, serviceId]
      : value.includesServices.filter((id) => id !== serviceId);
    patch({ includesServices: Array.from(new Set(next)) });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${testIdPrefix}-label`} className="text-sm">
          Название
        </Label>
        <Input
          id={`${testIdPrefix}-label`}
          value={value.label}
          onChange={(event) => patch({ label: event.target.value })}
          placeholder="Например: Кухня — ЛДСП EGGER"
          className="min-h-11 text-base"
          data-testid={`${testIdPrefix}-label`}
        />
      </div>

      {"categoryId" in value && (
        <div className="space-y-1.5">
          <Label htmlFor={`${testIdPrefix}-category`} className="text-sm">
            Категория
          </Label>
          <select
            id={`${testIdPrefix}-category`}
            value={value.categoryId}
            onChange={(event) => patch({ categoryId: event.target.value })}
            className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base"
            data-testid={`${testIdPrefix}-category`}
          >
            {categories.map((category) => (
              <option key={category.categoryId} value={category.categoryId}>
                {category.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium mb-2">Метод расчёта</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {METHOD_OPTIONS.map((option) => {
            const selected = value.method === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => changeMethod(option.value)}
                aria-pressed={selected}
                className={`min-h-11 rounded-lg border-2 px-3 py-2 text-left transition-colors ${
                  selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}
                data-testid={`${testIdPrefix}-method-${option.value}`}
              >
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.unitLabel}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {METHOD_OPTIONS.find((option) => option.value === value.method)?.hint}
        </p>
      </fieldset>

      {!isCostPlus && (
        <div className="space-y-2">
          <NumberField
            id={`${testIdPrefix}-price`}
            label="Цена"
            value={value.priceKzt}
            unit={unitLabel(UNIT_BY_METHOD[value.method])}
            onChange={(priceKzt) => patch({ priceKzt })}
            placeholder="не задана"
            allowEmpty
            testId={`${testIdPrefix}-price`}
          />
          <div className="flex items-start gap-3 min-h-11 py-1">
            <Checkbox
              id={`${testIdPrefix}-confirmed`}
              checked={value.isConfirmed}
              onCheckedChange={(checked) =>
                patch({
                  isConfirmed: checked === true,
                  priceKzt: checked === true ? value.priceKzt : null,
                })
              }
              className="mt-1"
              data-testid={`${testIdPrefix}-confirmed`}
            />
            <label htmlFor={`${testIdPrefix}-confirmed`} className="text-sm leading-6 cursor-pointer">
              Цена подтверждена
              <span className="block text-xs text-muted-foreground">
                Без подтверждения позиция не рассчитывается и показывается как «{UNCONFIRMED_PRICE_LABEL}»
              </span>
            </label>
          </div>
        </div>
      )}

      {isCostPlus && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <NumberField
            id={`${testIdPrefix}-cost`}
            label="Себестоимость"
            value={value.unitCostKzt ?? null}
            unit="₸/шт."
            onChange={(unitCostKzt) => patch({ unitCostKzt: unitCostKzt ?? undefined })}
            placeholder="0"
            testId={`${testIdPrefix}-cost`}
          />
          <NumberField
            id={`${testIdPrefix}-markup`}
            label="Наценка"
            value={value.markupPercent ?? null}
            unit="%"
            onChange={(markupPercent) => patch({ markupPercent: markupPercent ?? undefined })}
            placeholder="0"
            testId={`${testIdPrefix}-markup`}
          />
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Продажная цена вычисляется как себестоимость × (1 + наценка / 100). Фиксированную цену для этого
            метода задать нельзя.
          </p>
        </div>
      )}

      {includedServices.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Включённые услуги</legend>
          <p className="text-xs text-muted-foreground">
            Отмеченные услуги уже входят в цену и не могут начисляться повторно.
          </p>
          <div className="space-y-1">
            {includedServices.map((service) => (
              <div key={service.serviceId} className="flex items-center gap-3">
                <Checkbox
                  id={`${testIdPrefix}-service-${service.serviceId}`}
                  checked={value.includesServices.includes(service.serviceId)}
                  onCheckedChange={(checked) => toggleService(service.serviceId, checked === true)}
                  data-testid={`${testIdPrefix}-service-${service.serviceId}`}
                />
                {/* The label fills the 44px row so the whole row is a touch target. */}
                <label
                  htmlFor={`${testIdPrefix}-service-${service.serviceId}`}
                  className="flex min-h-11 flex-1 cursor-pointer items-center text-sm"
                >
                  {service.label}
                </label>
              </div>
            ))}
          </div>
        </fieldset>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${testIdPrefix}-notes`} className="text-sm">
          Примечание
        </Label>
        <Textarea
          id={`${testIdPrefix}-notes`}
          value={value.notes ?? ""}
          onChange={(event) => patch({ notes: event.target.value })}
          rows={2}
          placeholder="Источник цены, условия, комментарий"
          className="text-base"
          data-testid={`${testIdPrefix}-notes`}
        />
      </div>

      {errors.length > 0 && (
        <ul className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive space-y-1" role="alert">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
