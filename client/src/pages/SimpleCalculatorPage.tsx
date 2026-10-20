import { useMemo, useState } from "react";
import { Link } from "wouter";
import { calculatePrice, type TariffProfile, type Tariff } from "@shared/pricing";
import { useTariffProfiles, withTariffProfiles } from "@/components/tariffs/TariffProfilesProvider";

const money = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " ₸";
const positive = (s: string) => { const n = Number(s); return Number.isFinite(n) && n > 0 ? n : null; };

function SimpleCalculatorInner() {
  const { activeProfile, status, storageMessage } = useTariffProfiles();
  const [kind, setKind] = useState<"kitchen" | "wardrobe">("kitchen");
  const [width, setWidth] = useState("3000");
  const [height, setHeight] = useState("2500");
  const available = useMemo(() => activeProfile.tariffs.filter(t => t.categoryId === kind), [activeProfile, kind]);
  const [choice, setChoice] = useState("");
  const selected = available.find(t => t.tariffId === choice) ?? available[0];
  const [includeExtras, setIncludeExtras] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [copyStatus, setCopyStatus] = useState("");
  const estimate = useMemo(() => {
    if (!selected) return { error: "Добавьте тариф для выбранной мебели в разделе «Мои цены»." } as const;
    if (!positive(width) || (selected.method === "AREA" && !positive(height))) return { error: "Укажите корректные размеры." } as const;
    try {
      const extras = includeExtras ? activeProfile.extras.filter(x => (quantities[x.extraId] ?? 0) > 0).map(x => ({ extraId: x.extraId, quantity: quantities[x.extraId], dimensionsMm: { lengthMm: Number(width), widthMm: Number(width), heightMm: Number(height) } })) : [];
      return { result: calculatePrice(activeProfile as TariffProfile, {
        tariffId: selected.tariffId,
        dimensionsMm: { lengthMm: Number(width), widthMm: Number(width), heightMm: Number(height) },
        extras,
      }) } as const;
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Не удалось выполнить расчёт." } as const;
    }
  }, [activeProfile, selected, width, height, includeExtras, quantities]);
  const total = "result" in estimate ? estimate.result : null;
  const copy = async () => {
    if (!total) return;
    const lines = [`Смета: ${selected?.label ?? ""}`, `Ширина: ${width} мм`, ...(kind === "wardrobe" ? [`Высота: ${height} мм`] : []), ...total.lines.map(l => `${l.label}: ${money(l.amountKzt)}`), `Итого: ${money(total.totalKzt)}`];
    try { await navigator.clipboard.writeText(lines.join("\n")); setCopyStatus("Смета скопирована"); }
    catch { setCopyStatus("Не удалось скопировать. Проверьте разрешение браузера."); }
  };
  const inputStyle = "w-full min-h-11 rounded-lg border border-input bg-background px-3 text-base";
  return <div className="mx-auto max-w-xl space-y-5 pb-12" data-testid="simple-calculator">
    <div><h1 className="text-2xl font-bold">Расчёт мебели</h1><p className="text-sm text-muted-foreground">Размеры → материал → стоимость</p></div>
    {storageMessage && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{storageMessage}</p>}
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Вид мебели">
      {(["kitchen", "wardrobe"] as const).map(k => <button key={k} type="button" aria-pressed={kind === k} className={`min-h-11 rounded-lg border px-3 font-medium ${kind === k ? "bg-primary text-primary-foreground" : "bg-card"}`} onClick={() => { setKind(k); setChoice(""); setQuantities({}); }}>{k === "kitchen" ? "Кухня" : "Шкаф"}</button>)}
    </div>
    <div className="grid grid-cols-2 gap-3">
      <label className="space-y-1 text-sm font-medium">Ширина, мм<input data-testid="calc-width" className={inputStyle} type="number" min="1" inputMode="decimal" value={width} onChange={e => setWidth(e.target.value)} /></label>
      <label className="space-y-1 text-sm font-medium">Высота, мм<input data-testid="calc-height" className={inputStyle} type="number" min="1" inputMode="decimal" value={height} onChange={e => setHeight(e.target.value)} disabled={selected?.method === "LINEAR"} /></label>
    </div>
    <label className="block space-y-1 text-sm font-medium">Материал / базовый тариф
      <select data-testid="calc-material" className={inputStyle} value={selected?.tariffId ?? ""} onChange={e => setChoice(e.target.value)}>
        {available.length === 0 && <option value="">Нет тарифов</option>}
        {available.map((t: Tariff) => <option key={t.tariffId} value={t.tariffId}>{t.label}{t.isConfirmed ? "" : " — цена не задана"}</option>)}
      </select>
    </label>
    <p className="text-xs text-muted-foreground">Кухня включает стандартную столешницу из постформинга, базовую фурнитуру, изготовление и монтаж. Премиальные опции не добавляются автоматически.</p>
    <section className="space-y-3 rounded-xl border p-3">
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" checked={includeExtras} onChange={e => setIncludeExtras(e.target.checked)} />Дополнительные позиции</label>
      {includeExtras && (activeProfile.extras.length ? activeProfile.extras.map(item => <div key={item.extraId} className="flex items-center justify-between gap-2 text-sm">
        <div className="min-w-0 flex-1"><div className="font-medium">{item.label}</div><div className="text-muted-foreground">{item.priceKzt === null ? "Цена не задана" : money(item.priceKzt)}</div></div>
        <input className="min-h-11 w-20 rounded-lg border px-2" aria-label={`Количество: ${item.label}`} type="number" min="0" step="1" value={quantities[item.extraId] ?? 0} onChange={e => setQuantities(p => ({ ...p, [item.extraId]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} />
      </div>) : <p className="text-sm text-muted-foreground">Пока нет дополнительных позиций. <Link href="/tariffs">Добавить в тарифы</Link>.</p>)}
    </section>
    <section className="space-y-3 rounded-xl bg-muted p-4" data-testid="estimate">
      <h2 className="text-lg font-semibold">Смета</h2>
      {total ? <><div className="space-y-2">{total.lines.map((l,i) => <div key={i} className="flex justify-between gap-2 text-sm"><span>{l.label}</span><span className="shrink-0 tabular-nums">{money(l.amountKzt)}</span></div>)}</div><div className="flex justify-between border-t pt-3 text-lg font-bold"><span>Итого</span><span data-testid="calc-total" className="tabular-nums">{money(total.totalKzt)}</span></div><button type="button" className="min-h-11 w-full rounded-lg bg-primary px-4 font-medium text-primary-foreground" onClick={() => void copy()}>Скопировать смету</button>{copyStatus && <p role="status" className="text-xs">{copyStatus}</p>}</> : <p role="status" className="text-sm text-amber-700">{"error" in estimate ? estimate.error : "Укажите параметры для расчёта."}</p>}
    </section>
    <Link href="/tariffs" className="block min-h-11 rounded-lg border p-3 text-center text-sm font-medium">Мои цены и дополнительные позиции</Link>
    <p className="text-xs text-muted-foreground">Предварительный расчёт. Сумма зависит от выбранного тарифного профиля.</p>
  </div>;
}
export default withTariffProfiles(SimpleCalculatorInner);
