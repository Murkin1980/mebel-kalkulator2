import "./salamat-calc.css";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { calculatePrice, type Tariff, type TariffProfile } from "@shared/pricing";
import { useTariffProfiles, withTariffProfiles } from "@/components/tariffs/TariffProfilesProvider";

const money = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " ₸";
const valid = (s: string) => { const n = Number(s); return s.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null; };
type EstimateLine = { name: string; amount: number };
function SimpleCalculatorInner() {
  const { activeProfile, status, storageMessage } = useTariffProfiles();
  const [kind, setKind] = useState<"kitchen" | "wardrobe">("kitchen");
  const [width, setWidth] = useState("3000");
  const [height, setHeight] = useState("2500");
  const [choice, setChoice] = useState("");
  const [showHardware, setShowHardware] = useState(false);
  const [hardwareQty, setHardwareQty] = useState<Record<string, number>>({});
  const [showStone, setShowStone] = useState(false);
  const [stoneId, setStoneId] = useState("");
  const [stoneLength, setStoneLength] = useState("3000");
  const [stoneWidth, setStoneWidth] = useState("600");
  const [showFacade, setShowFacade] = useState(false);
  const [standardId, setStandardId] = useState("");
  const [premiumId, setPremiumId] = useState("");
  const [facadeArea, setFacadeArea] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const baseTariffs = activeProfile.tariffs.filter(x => x.categoryId === kind);
  const selected = baseTariffs.find(x => x.tariffId === choice) ?? baseTariffs[0];
  const hardware = activeProfile.extras.filter(x => x.extraId.startsWith("cp03-hardware-"));
  const stones = activeProfile.tariffs.filter(x => x.categoryId === "artificial-stone" && x.tariffId.startsWith("cp03-stone-"));
  const facades = activeProfile.tariffs.filter(x => x.categoryId === "premium-facades" && x.tariffId.startsWith("cp03-facade-") && x.method === "AREA");
  const stone = stones.find(x => x.tariffId === stoneId);
  const standard = facades.find(x => x.tariffId === standardId);
  const premium = facades.find(x => x.tariffId === premiumId);
  const estimate = useMemo(() => {
    const w = valid(width), h = valid(height);
    if (status === "loading") return { error: "Загрузка тарифов…" };
    if (!selected) return { error: "Тариф не найден. Добавьте его в «Мои цены»." };
    if (!w || (selected.method === "AREA" && !h)) return { error: "Введите корректные размеры мебели." };
    try {
      const base = calculatePrice(activeProfile as TariffProfile, { tariffId: selected.tariffId, dimensionsMm: { lengthMm: w, widthMm: w, ...(h ? {heightMm: h} : {}) } });
      const lines: EstimateLine[] = base.lines.map(x => ({ name: x.label, amount: x.amountKzt }));
      if (showHardware) for (const item of hardware) {
        const qty = hardwareQty[item.extraId] ?? 0;
        if (qty <= 0) continue;
        if (!Number.isInteger(qty) || qty > 9999) return { error: "Укажите допустимое количество фурнитуры." };
        if (!item.isConfirmed || item.priceKzt === null) return { error: "Не задана цена фурнитуры: " + item.label };
        lines.push({ name: `${item.label} × ${qty}`, amount: Math.round(item.priceKzt * qty * 100) / 100 });
      }
      if (showFacade) {
        if (selected.tariffId === "kitchen-mdf-film" || selected.tariffId === "kitchen-mdf-paint") return { error: "Для доплаты за фасады выберите базовый тариф со стандартными фасадами, чтобы не начислять их дважды." };
        if (!standard || !premium || !valid(facadeArea)) return { error: "Для фасадов выберите стандартный и премиальный тарифы и укажите площадь, м²." };
        if (!standard.isConfirmed || !premium.isConfirmed || standard.priceKzt === null || premium.priceKzt === null) return { error: "Заполните обе цены фасадов в справочнике." };
        if (premium.priceKzt < standard.priceKzt) return { error: "Премиальный фасад дешевле стандартного. Проверьте выбор: скидка требует отдельного согласования." };
        const extra = Math.round(valid(facadeArea)! * (premium.priceKzt - standard.priceKzt) * 100) / 100;
        lines.push({ name: `Доплата за ${premium.label}, ${facadeArea} м² (разница со стандартным)`, amount: extra });
      }
      if (showStone) {
        if (!stone || !stone.isConfirmed || stone.priceKzt === null) return { error: "Выберите искусственный камень с установленной ценой." };
        const length = valid(stoneLength), stoneW = valid(stoneWidth);
        if (stone.method === "LINEAR" && !length) return { error: "Укажите длину столешницы." };
        if (stone.method === "AREA" && (!length || !stoneW)) return { error: "Укажите длину и ширину столешницы." };
        const measure = stone.method === "LINEAR" ? length! / 1000 : stone.method === "AREA" ? length! * stoneW! / 1e6 : 1;
        lines.push({ name: `${stone.label} (${measure.toLocaleString("ru-RU")} ${stone.method === "LINEAR" ? "пог. м" : stone.method === "AREA" ? "м²" : "шт."})`, amount: Math.round(measure * stone.priceKzt * 100) / 100 });
      }
      return { lines, total: Math.round(lines.reduce((sum, x) => sum + x.amount, 0) * 100) / 100 };
    } catch(e) { return { error: e instanceof Error ? e.message : "Невозможно рассчитать смету" }; }
  }, [activeProfile, status, selected, width, height, showHardware, hardwareQty, showStone, stone, stoneLength, stoneWidth, showFacade, standard, premium, facadeArea]);
  const input = "min-h-11 w-full rounded-lg border px-3 text-base";
  const copy = async () => {
    if (!estimate.lines || estimate.total === undefined) return;
    const quote = [`Смета — ${selected.label}`, `Размеры: ${width} × ${height} мм`, ...estimate.lines.map(x => x.name + ": " + money(x.amount)), "Итого: " + money(estimate.total), `Тарифный профиль: ${activeProfile.name}, версия ${activeProfile.version}`].join("\n");
    try { await navigator.clipboard.writeText(quote); setCopyStatus("Смета скопирована"); } catch { setCopyStatus("Копирование недоступно в браузере"); }
  };
  return <div className="salamat-calc mx-auto max-w-xl space-y-4 pb-8" data-testid="simple-calculator">
    <h1 className="text-2xl font-bold">Расчёт мебели</h1><p className="salamat-muted text-sm">Укажите размеры — получите стоимость и смету.</p>
    {storageMessage && <p role="alert" className="salamat-panel p-2 text-sm">{storageMessage}</p>}
    <div className="grid grid-cols-2 gap-2">{(["kitchen","wardrobe"] as const).map(k => <button type="button" className="salamat-choice min-h-11 rounded-lg border" key={k} aria-pressed={kind === k} onClick={() => { setKind(k); setChoice(""); setShowFacade(false); }}>{k === "kitchen" ? "Кухня" : "Шкаф"}</button>)}</div>
    <div className="grid grid-cols-2 gap-3">
      <label className="text-sm">Ширина, мм<input data-testid="calc-width" className={input} type="number" min="1" value={width} onChange={e => setWidth(e.target.value)} /></label>
      <label className="text-sm">Высота, мм<input data-testid="calc-height" className={input} type="number" min="1" value={height} disabled={selected?.method === "LINEAR"} onChange={e => setHeight(e.target.value)} /></label>
    </div>
    <label className="block text-sm">Материал
      <select data-testid="calc-material" className={input} value={selected?.tariffId ?? ""} onChange={e => { setChoice(e.target.value); setShowFacade(false); }}>
        {baseTariffs.length === 0 && <option value="">Нет тарифов</option>}
        {baseTariffs.map((t: Tariff) => <option key={t.tariffId} value={t.tariffId}>{t.label}{!t.isConfirmed ? " — цена не задана" : ""}</option>)}
      </select>
    </label>
    {kind === "kitchen" && <p className="salamat-muted text-xs">Стандартная столешница (постформинг), обычная фурнитура, изготовление и монтаж уже включены.</p>}
    <section className="salamat-panel space-y-2 p-3">
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={showFacade} onChange={e => setShowFacade(e.target.checked)} disabled={kind !== "kitchen"} /> Премиальные фасады (доплата)</label>
      {showFacade && <div className="space-y-2">
        <label className="block text-sm">Стандартные фасады<select className={input} value={standardId} onChange={e => setStandardId(e.target.value)}><option value="">Выбрать</option>{facades.map(x => <option key={x.tariffId} value={x.tariffId}>{x.label}</option>)}</select></label>
        <label className="block text-sm">Премиальные фасады<select className={input} value={premiumId} onChange={e => setPremiumId(e.target.value)}><option value="">Выбрать</option>{facades.map(x => <option key={x.tariffId} value={x.tariffId}>{x.label}</option>)}</select></label>
        <label className="block text-sm">Площадь фасадов, м²<input className={input} type="number" min="0" step="0.01" value={facadeArea} onChange={e => setFacadeArea(e.target.value)} /></label>
        <Link href="/simple/catalog">Добавить или изменить тарифы фасадов</Link>
      </div>}
    </section>
    <section className="salamat-panel space-y-2 p-3">
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={showHardware} onChange={e => setShowHardware(e.target.checked)} /> Дополнительная фурнитура</label>
      {showHardware && <div className="space-y-2">{hardware.map(x => <div className="flex items-center gap-2" key={x.extraId}><span className="flex-1 text-sm">{x.label} — {x.priceKzt === null ? "без цены" : money(x.priceKzt)}</span><input className="min-h-11 w-20 rounded-lg border px-2" aria-label={"Количество " + x.label} type="number" min="0" max="9999" step="1" value={hardwareQty[x.extraId] ?? 0} onChange={e => setHardwareQty(p => ({...p, [x.extraId]: Number(e.target.value)}))}/></div>)}<Link href="/simple/catalog">Добавить или изменить фурнитуру</Link></div>}
    </section>
    <section className="salamat-panel space-y-2 p-3">
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={showStone} onChange={e => setShowStone(e.target.checked)} /> Искусственный камень (дополнительно)</label>
      {showStone && <div className="space-y-2">
        <label className="block text-sm">Материал<select className={input} value={stoneId} onChange={e => setStoneId(e.target.value)}><option value="">Выбрать</option>{stones.map(x => <option key={x.tariffId} value={x.tariffId}>{x.label} — {x.method === "AREA" ? "м²" : x.method === "LINEAR" ? "пог. м" : "шт."}</option>)}</select></label>
        {stone?.method !== "UNIT" && <div className="grid grid-cols-2 gap-2"><label className="text-sm">Длина, мм<input className={input} type="number" min="1" value={stoneLength} onChange={e => setStoneLength(e.target.value)} /></label>{stone?.method === "AREA" && <label className="text-sm">Ширина, мм<input className={input} type="number" min="1" value={stoneWidth} onChange={e => setStoneWidth(e.target.value)} /></label>}</div>}
        <Link href="/simple/catalog">Добавить или изменить искусственный камень</Link>
      </div>}
    </section>
    <section className="salamat-panel space-y-3 p-4" data-testid="estimate"><h2 className="font-semibold">Смета</h2>
      {estimate.lines && estimate.total !== undefined ? <><div className="space-y-2">{estimate.lines.map((x,i) => <div className="flex justify-between gap-2 text-sm" key={i}><span>{x.name}</span><span className="shrink-0 tabular-nums">{money(x.amount)}</span></div>)}</div>
        <div className="flex justify-between gap-2 border-t pt-3 text-lg font-bold"><span>Итого</span><span data-testid="calc-total">{money(estimate.total)}</span></div>
        <button type="button" className="salamat-primary min-h-11 w-full rounded-lg font-medium" onClick={() => void copy()}>Скопировать смету</button>{copyStatus && <p role="status" className="text-xs">{copyStatus}</p>}</> : <p role="status" className="text-sm">{estimate.error}</p>}
    </section>
    <Link href="/tariffs" className="block rounded-lg border p-3 text-center">Мои цены / профили</Link>
  </div>;
}
export default withTariffProfiles(SimpleCalculatorInner);
