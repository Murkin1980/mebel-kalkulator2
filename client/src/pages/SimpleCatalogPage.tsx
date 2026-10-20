import { useState } from "react";
import { Link } from "wouter";
import { type TariffProfile, type Tariff, type ExtraItem, parseTariffProfile } from "@shared/pricing";
import { useTariffProfiles, withTariffProfiles, nowIso } from "@/components/tariffs/TariffProfilesProvider";
import "./salamat-calc.css";
import { createProfileFromSource } from "@/lib/tariff-profiles";

type Section = "hardware" | "stone" | "facade";
const makeId = (prefix: string) => prefix + "-" + crypto.randomUUID().slice(0, 12);
const sectionName: Record<Section, string> = { hardware: "Фурнитура", stone: "Искусственный камень", facade: "Фасады" };
const groups = ["hardware", "stone", "facade"] as const;
function Editor() {
  const { activeProfile, allProfiles, saveProfile, status, lastError } = useTariffProfiles();
  const [section, setSection] = useState<Section>("hardware");
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState<"UNIT" | "LINEAR" | "AREA">("UNIT");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const isTemplate = activeProfile.profileId === "salamat-mebel";
  const items = section === "hardware" ? activeProfile.extras.filter(x => x.extraId.startsWith("cp03-hardware-")) :
    activeProfile.tariffs.filter(x => x.categoryId === (section === "stone" ? "artificial-stone" : "premium-facades") && (section === "stone" ? x.tariffId.startsWith("cp03-stone-") : x.tariffId.startsWith("cp03-facade-")));
  const input = "min-h-11 w-full rounded-lg border px-3";
  const start = (item?: Tariff | ExtraItem) => {
    setEditing(item ? ("extraId" in item ? item.extraId : item.tariffId) : "new");
    setName(item?.label ?? ""); setPrice(item?.priceKzt === null || !item ? "" : String(item.priceKzt));
    setUnit(item?.method === "AREA" ? "AREA" : item?.method === "LINEAR" ? "LINEAR" : section === "facade" ? "AREA" : "UNIT");
    setSaved("");
  };
  async function updateProfile(transform: (profile: TariffProfile) => TariffProfile) {
    try {
      setBusy(true);
      const source = isTemplate ? createProfileFromSource({
        name: "Мои цены Salamat", source: activeProfile,
        takenIds: allProfiles.map(p => p.profileId),
        takenNames: allProfiles.map(p => p.name), now: nowIso()
      }) : activeProfile;
      const updated = transform(source);
      const valid = parseTariffProfile({ ...updated, version: source.version + 1, updatedAt: nowIso() });
      const ok = await saveProfile(valid, { setActive: true });
      setSaved(ok ? "Сохранено" : "Ошибка сохранения профиля");
      if (ok) setEditing(null);
    } catch (e) { setSaved(e instanceof Error ? e.message : "Ошибка данных"); }
    finally { setBusy(false); }
  }
  function saveItem() {
    const numericPrice = price.trim() === "" ? null : Number(price);
    if (!name.trim() || name.length > 160 || (numericPrice !== null && (!Number.isFinite(numericPrice) || numericPrice < 0))) { setSaved("Проверьте название и цену."); return; }
    void updateProfile(profile => {
      const method = section === "hardware" ? "UNIT" : section === "facade" ? "AREA" : unit;
      const fields = { label: name.trim(), method, unit: method === "AREA" ? "KZT_PER_M2" : method === "LINEAR" ? "KZT_PER_LINEAR_M" : "KZT_PER_UNIT", priceKzt: numericPrice, isConfirmed: numericPrice !== null, includesServices: [] as string[], source: "User-edited CP-03" };
      if (section === "hardware") {
        const entry = { ...fields, extraId: editing === "new" ? makeId("cp03-hardware") : editing!, notes: "Только явно выбранная дополнительная фурнитура" } as ExtraItem;
        return { ...profile, extras: editing === "new" ? [...profile.extras, entry] : profile.extras.map(i => i.extraId === editing ? entry : i) };
      }
      const categoryId = section === "stone" ? "artificial-stone" : "premium-facades";
      const tariff = { ...fields, categoryId, tariffId: editing === "new" ? makeId(section === "stone" ? "cp03-stone" : "cp03-facade") : editing! } as Tariff;
      return { ...profile, categories: profile.categories.some(c => c.categoryId === categoryId) ? profile.categories : [...profile.categories, {categoryId, label: sectionName[section]}],
        tariffs: editing === "new" ? [...profile.tariffs, tariff] : profile.tariffs.map(t => t.tariffId === editing ? tariff : t) };
    });
  }
  function deleteItem(id: string) {
    if (!window.confirm("Удалить позицию из справочника?")) return;
    void updateProfile(profile => section === "hardware" ? { ...profile, extras: profile.extras.filter(x => x.extraId !== id) } : { ...profile, tariffs: profile.tariffs.filter(x => x.tariffId !== id) });
  }
  return <div className="salamat-calc mx-auto max-w-xl space-y-4" data-testid="cp03-catalog">
    <h1 className="text-2xl font-bold">Мои материалы и цены</h1>
    <Link href="/simple">← К калькулятору</Link>
    <div className="grid grid-cols-3 gap-1">{groups.map(key => <button key={key} type="button" className="salamat-choice min-h-11 rounded-md border px-1 text-xs sm:text-sm" aria-pressed={section === key} onClick={() => { setSection(key); setEditing(null); setSaved(""); }}>{sectionName[key]}</button>)}</div>
    {isTemplate && <div className="salamat-panel p-3 text-sm">При первом сохранении создаётся личная копия тарифов. Стандартные цены Salamat Mebel останутся неизменными.</div>}
    {status === "loading" && <p>Загрузка тарифов…</p>}
    {items.map(item => { const id = "extraId" in item ? item.extraId : item.tariffId; return <div className="salamat-panel flex items-center gap-2 p-3" key={id}>
      <div className="min-w-0 flex-1"><div className="font-medium">{item.label}</div><div className="salamat-muted text-xs">{item.priceKzt === null ? "Цена не внесена" : new Intl.NumberFormat("ru-RU").format(item.priceKzt) + " ₸"} / {item.method === "AREA" ? "м²" : item.method === "LINEAR" ? "пог. м" : "шт."}</div></div>
      <button className="min-h-11 rounded-md border px-3 text-sm" disabled={busy} onClick={() => start(item)}>Изменить</button>
      <button aria-label={"Удалить " + item.label} className="min-h-11 rounded-md border px-2" disabled={busy} onClick={() => deleteItem(id)}>×</button>
    </div>; })}
    {!editing && <button className="salamat-primary min-h-11 w-full rounded-lg font-semibold" disabled={busy} onClick={() => start()}>+ Добавить {section === "hardware" ? "фурнитуру" : "материал"}</button>}
    {editing && <div className="salamat-panel space-y-3 p-3">
      <h2 className="font-semibold">{editing === "new" ? "Новая позиция" : "Редактирование"}</h2>
      <label className="block text-sm">Название<input aria-label="Название позиции" className={input} maxLength={160} value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="block text-sm">Стоимость, ₸<input aria-label="Цена позиции" className={input} type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="Не установлена" /></label>
      {section !== "hardware" && <label className="block text-sm">Расчёт<select aria-label="Способ расчёта" className={input} value={unit} onChange={e => setUnit(e.target.value as typeof unit)}>
        <option value="AREA">За м²</option>{section === "stone" && <option value="LINEAR">За погонный метр</option>}{section === "stone" && <option value="UNIT">За штуку</option>}
      </select></label>}
      <div className="flex gap-2"><button disabled={busy} className="salamat-primary min-h-11 flex-1 rounded-lg" onClick={saveItem}>Сохранить</button><button className="min-h-11 flex-1 rounded-lg border" onClick={() => setEditing(null)}>Отмена</button></div>
    </div>}
    {(saved || lastError) && <p role="status" className="text-sm">{saved || lastError}</p>}
    {section === "facade" && <p className="salamat-muted text-sm">Для доплаты по разнице укажите два тарифа: стандартные фасады (м²) и выбранные дорогие фасады (м²). Стоимость не включается автоматически.</p>}
  </div>;
}
export default withTariffProfiles(Editor);
