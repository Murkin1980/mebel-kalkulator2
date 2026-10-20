/**
 * "Проверить тариф" — local price preview (DEV-CP-02).
 * Calls the shared calculatePrice() directly in the browser; no API request.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calculator, ShieldCheck } from "lucide-react";
import { calculatePrice, isPricingError, type CalculationResult, type TariffProfile } from "@shared/pricing";
import { MEASURE_UNIT_LABELS, formatKzt, methodLabel, unitLabel } from "@/lib/tariff-meta";
import { NumberField } from "./NumberField";

interface TariffPreviewProps {
  /** Validated draft profile; `null` while the draft is invalid. */
  profile: TariffProfile | null;
  disabledReason?: string;
}

export function TariffPreview({ profile, disabledReason }: TariffPreviewProps) {
  const [tariffId, setTariffId] = useState<string>("");
  const [widthMm, setWidthMm] = useState<number | null>(null);
  const [heightMm, setHeightMm] = useState<number | null>(null);
  const [lengthMm, setLengthMm] = useState<number | null>(null);
  const [quantity, setQuantity] = useState<number | null>(1);
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tariffs = profile?.tariffs ?? [];
  const selectedTariff = tariffs.find((tariff) => tariff.tariffId === tariffId) ?? tariffs[0];
  const method = selectedTariff?.method ?? "UNIT";

  const extras = useMemo(
    () => (profile?.extras ?? []).filter((extra) => extra.isConfirmed && extra.priceKzt !== null),
    [profile],
  );

  function calculate() {
    if (!profile || !selectedTariff) return;
    setError(null);
    setResult(null);
    try {
      const computed = calculatePrice(profile, {
        tariffId: selectedTariff.tariffId,
        quantity: method === "UNIT" || method === "COST_PLUS" ? quantity ?? 1 : 1,
        dimensionsMm:
          method === "AREA"
            ? { widthMm: widthMm ?? undefined, heightMm: heightMm ?? undefined }
            : method === "LINEAR"
              ? { lengthMm: lengthMm ?? undefined }
              : undefined,
        extras: extraIds.map((extraId) => ({ extraId, quantity: 1 })),
      });
      setResult(computed);
    } catch (caught) {
      setResult(null);
      setError(
        isPricingError(caught) ? caught.message : caught instanceof Error ? caught.message : "Не удалось рассчитать",
      );
    }
  }

  const canCalculate = Boolean(profile && selectedTariff) && !disabledReason;

  return (
    <Card data-testid="tariff-preview">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator size={16} />
          Проверить тариф
        </CardTitle>
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <ShieldCheck size={13} />
          Расчёт выполняется локально, без запроса к серверу, по несохранённому черновику.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {disabledReason && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            {disabledReason}
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="preview-tariff" className="text-sm">
            Тариф
          </Label>
          <select
            id="preview-tariff"
            value={selectedTariff?.tariffId ?? ""}
            onChange={(event) => {
              setTariffId(event.target.value);
              setResult(null);
              setError(null);
            }}
            disabled={!profile}
            className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base"
            data-testid="preview-tariff"
          >
            {tariffs.map((tariff) => (
              <option key={tariff.tariffId} value={tariff.tariffId}>
                {tariff.label || tariff.tariffId} — {methodLabel(tariff.method)}
              </option>
            ))}
          </select>
          {selectedTariff && (
            <p className="text-xs text-muted-foreground">
              Метод: {methodLabel(selectedTariff.method)} · {unitLabel(selectedTariff.unit)} ·{" "}
              {selectedTariff.priceKzt === null
                ? "цена не задана"
                : formatKzt(selectedTariff.priceKzt)}
            </p>
          )}
        </div>

        {method === "AREA" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <NumberField id="preview-width" label="Ширина" value={widthMm} onChange={setWidthMm} unit="мм" inputMode="numeric" testId="preview-width" />
            <NumberField id="preview-height" label="Высота" value={heightMm} onChange={setHeightMm} unit="мм" inputMode="numeric" testId="preview-height" />
          </div>
        )}
        {method === "LINEAR" && (
          <NumberField id="preview-length" label="Длина" value={lengthMm} onChange={setLengthMm} unit="мм" inputMode="numeric" testId="preview-length" />
        )}
        {(method === "UNIT" || method === "COST_PLUS") && (
          <NumberField id="preview-quantity" label="Количество" value={quantity} onChange={setQuantity} unit="шт." inputMode="numeric" testId="preview-quantity" />
        )}

        {extras.length > 0 && (
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium mb-2">Дополнительные позиции</legend>
            {extras.map((extra) => {
              const checked = extraIds.includes(extra.extraId);
              return (
                <div key={extra.extraId} className="flex items-center gap-3 min-h-11">
                  <Checkbox
                    id={`preview-extra-${extra.extraId}`}
                    checked={checked}
                    onCheckedChange={(value) => {
                      setExtraIds((previous) =>
                        value === true ? [...previous, extra.extraId] : previous.filter((id) => id !== extra.extraId),
                      );
                      setResult(null);
                    }}
                    data-testid={`preview-extra-${extra.extraId}`}
                  />
                  <label htmlFor={`preview-extra-${extra.extraId}`} className="text-sm cursor-pointer flex-1">
                    {extra.label}
                  </label>
                  <span className="text-xs text-muted-foreground">{formatKzt(extra.priceKzt ?? 0)}</span>
                </div>
              );
            })}
          </fieldset>
        )}

        <Button onClick={calculate} disabled={!canCalculate} className="w-full min-h-11" data-testid="preview-calculate">
          Рассчитать
        </Button>

        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive" role="alert" data-testid="preview-error">
            {error}
          </p>
        )}

        {result && (
          <div className="space-y-3 rounded-lg border border-border p-3" data-testid="preview-result">
            <div className="text-xs text-muted-foreground">
              {result.profileName} · версия {result.profileVersion} · схема {result.schemaVersion}
            </div>
            <dl className="space-y-2 text-sm">
              {result.lines.map((line) => (
                <div key={`${line.sourceType}-${line.sourceId}`} className="flex flex-col gap-0.5 border-b border-border/60 pb-2 last:border-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="font-medium">
                      {line.sourceType === "TARIFF" ? "Тариф" : "Доплата"}: {line.label}
                    </dt>
                    <dd className="font-semibold whitespace-nowrap">{formatKzt(line.amountKzt)}</dd>
                  </div>
                  <dd className="text-xs text-muted-foreground">
                    {methodLabel(line.method)} · {line.measure.value.toLocaleString("ru-RU")}{" "}
                    {MEASURE_UNIT_LABELS[line.measure.unit]} × {formatKzt(line.unitPriceKzt)}
                    {line.quantity !== 1 ? ` × ${line.quantity} шт.` : ""}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Стоимость без округления</span>
              <span>{formatKzt(result.subtotalKzt)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Округление ({result.rounding.mode}, шаг {formatKzt(result.rounding.incrementKzt)})
              </span>
              <span>{result.rounding.adjustmentKzt === 0 ? "0 ₸" : formatKzt(result.rounding.adjustmentKzt)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
              <span>Итого</span>
              <span data-testid="preview-total">{formatKzt(result.totalKzt)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
