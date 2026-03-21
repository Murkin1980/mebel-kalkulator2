import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import type { Settings } from "@shared/schema";
import {
  ChefHat, DoorOpen, LayoutGrid,
  Ruler, Package, Wrench,
  MessageCircle, CheckCircle2, Loader2, Send
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type FurnitureType = "kitchen" | "wardrobe" | "dressing";
type Material = "mat_ldsp" | "mat_mdf" | "mat_massiv" | "mat_eco";
type Hardware = "hw_econom" | "hw_blum" | "hw_hettich";

interface CalcResult {
  basePrice: number;
  markupPercent: number;
  finalPrice: number;
  deadline: number;
  area: number;
}

// ─── Options ──────────────────────────────────────────────────────────────────
const FURNITURE_OPTIONS: { type: FurnitureType; label: string; sub: string; icon: typeof ChefHat }[] = [
  { type: "kitchen", label: "Кухня", sub: "Кухонный гарнитур", icon: ChefHat },
  { type: "wardrobe", label: "Шкаф-купе", sub: "Встроенный шкаф", icon: DoorOpen },
  { type: "dressing", label: "Гардероб", sub: "Гардеробная комната", icon: LayoutGrid },
];

const MATERIAL_OPTIONS: { key: Material; label: string; sub: string }[] = [
  { key: "mat_ldsp", label: "ЛДСП", sub: "Эконом класс" },
  { key: "mat_mdf", label: "МДФ", sub: "Средний класс" },
  { key: "mat_eco", label: "Экошпон", sub: "Премиум шпон" },
  { key: "mat_massiv", label: "Массив", sub: "Натуральное дерево" },
];

const HARDWARE_OPTIONS: { key: Hardware; label: string; sub: string }[] = [
  { key: "hw_econom", label: "Эконом", sub: "Стандартная фурнитура" },
  { key: "hw_hettich", label: "Hettich", sub: "Немецкое качество" },
  { key: "hw_blum", label: "Blum", sub: "Австрийский премиум" },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function CalculatorPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const priceRef = useRef<HTMLDivElement>(null);

  // Form state
  const [furnitureType, setFurnitureType] = useState<FurnitureType>("kitchen");
  const [width, setWidth] = useState("300");
  const [height, setHeight] = useState("220");
  const [depth, setDepth] = useState("60");
  const [material, setMaterial] = useState<Material>("mat_ldsp");
  const [hardware, setHardware] = useState<Hardware>("hw_econom");
  const [hasDrawers, setHasDrawers] = useState(false);
  const [drawerCount, setDrawerCount] = useState("3");
  const [hasMirror, setHasMirror] = useState(false);

  // Contact form
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<CalcResult | null>(null);

  const { data: settings } = useQuery<Settings[]>({ queryKey: ["/api/settings"] });
  const whatsappNum = settings?.find((s) => s.key === "whatsapp_number")?.value ?? "77001234567";

  // Calculate mutation
  const calcMutation = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/calculate", body).then((r) => r.json()),
    onSuccess: (data: CalcResult) => {
      setResult(data);
      // Scroll to result
      setTimeout(() => {
        priceRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        priceRef.current?.classList.add("price-pop");
        setTimeout(() => priceRef.current?.classList.remove("price-pop"), 500);
      }, 100);
    },
    onError: () => toast({ title: "Ошибка расчёта", variant: "destructive" }),
  });

  // Submit lead mutation
  const leadMutation = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/leads", body).then((r) => r.json()),
    onSuccess: (lead) => {
      toast({ title: "Заявка отправлена!", description: "Менеджер свяжется с вами." });
      qc.invalidateQueries({ queryKey: ["/api/leads"] });
      // Open WhatsApp
      openWhatsApp(lead);
    },
    onError: () => toast({ title: "Ошибка отправки заявки", variant: "destructive" }),
  });

  function handleCalculate() {
    calcMutation.mutate({
      furnitureType,
      width: parseFloat(width),
      height: parseFloat(height),
      depth: parseFloat(depth),
      material,
      hardware,
      hasDrawers,
      drawerCount: hasDrawers ? parseInt(drawerCount) : 0,
      hasMirror,
    });
  }

  function handleSubmit() {
    if (!result) return;
    if (!clientName.trim()) {
      toast({ title: "Введите ваше имя", variant: "destructive" }); return;
    }
    if (!clientPhone.trim()) {
      toast({ title: "Введите номер телефона", variant: "destructive" }); return;
    }
    leadMutation.mutate({
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim(),
      furnitureType,
      width: parseFloat(width),
      height: parseFloat(height),
      depth: parseFloat(depth),
      material,
      hardware,
      hasDrawers,
      drawerCount: hasDrawers ? parseInt(drawerCount) : 0,
      hasMirror,
      basePrice: result.basePrice,
      markupPercent: result.markupPercent,
      finalPrice: result.finalPrice,
      deadline: result.deadline,
      notes: notes.trim(),
    });
  }

  function openWhatsApp(lead: { clientName: string; furnitureType: string; finalPrice: number; deadline: number }) {
    const typeLabel = FURNITURE_OPTIONS.find((f) => f.type === lead.furnitureType)?.label ?? lead.furnitureType;
    const msg = encodeURIComponent(
      `Здравствуйте! Меня зовут ${lead.clientName}.\nХочу заказать: ${typeLabel}\n${width}×${height}×${depth} см\nМатериал: ${MATERIAL_OPTIONS.find((m) => m.key === material)?.label}\nФурнитура: ${HARDWARE_OPTIONS.find((h) => h.key === hardware)?.label}\nСтоимость: ${fmt(lead.finalPrice)}\nСрок: ${lead.deadline} дней\n\nОжидаю вашего звонка.`
    );
    window.open(`https://wa.me/${whatsappNum}?text=${msg}`, "_blank");
  }

  const fmt = (n: number) => n.toLocaleString("ru-RU") + " ₸";

  return (
    <div className="space-y-6 pb-8">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          Рассчитайте стоимость мебели
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Введите размеры, выберите материал и фурнитуру — получите цену за 1 секунду
        </p>
      </div>

      {/* Step 1 — Furniture type */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">1</span>
            Тип мебели
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {FURNITURE_OPTIONS.map(({ type, label, sub, icon: Icon }) => (
              <button
                key={type}
                onClick={() => setFurnitureType(type)}
                className={`furniture-card border-2 rounded-xl p-4 flex flex-col items-center gap-2 text-center
                  ${furnitureType === type ? "selected border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                data-testid={`furniture-type-${type}`}
              >
                <Icon size={28} className={furnitureType === type ? "text-primary" : "text-muted-foreground"} />
                <div>
                  <div className="font-semibold text-sm">{label}</div>
                  <div className="text-xs text-muted-foreground">{sub}</div>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 2 — Dimensions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">2</span>
            <Ruler size={16} />
            Размеры (в сантиметрах)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {[
              { id: "width", label: "Ширина", value: width, set: setWidth, placeholder: "300" },
              { id: "height", label: "Высота", value: height, set: setHeight, placeholder: "220" },
              { id: "depth", label: "Глубина", value: depth, set: setDepth, placeholder: "60" },
            ].map(({ id, label, value, set, placeholder }) => (
              <div key={id} className="space-y-1.5">
                <Label htmlFor={id} className="text-sm">{label}</Label>
                <div className="relative">
                  <Input
                    id={id}
                    type="number"
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    placeholder={placeholder}
                    min="10"
                    max="1000"
                    className="pr-8"
                    data-testid={`input-${id}`}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">см</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 3 — Material */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">3</span>
            <Package size={16} />
            Материал корпуса
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {MATERIAL_OPTIONS.map(({ key, label, sub }) => {
              const pricePerM = settings?.find((s) => s.key === key)?.value;
              return (
                <button
                  key={key}
                  onClick={() => setMaterial(key)}
                  className={`furniture-card border-2 rounded-xl p-3 text-left
                    ${material === key ? "selected border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                  data-testid={`material-${key}`}
                >
                  <div className="font-semibold text-sm">{label}</div>
                  <div className="text-xs text-muted-foreground">{sub}</div>
                  {pricePerM ? (
                    <div className="text-xs font-medium text-primary mt-1">{parseInt(pricePerM).toLocaleString("ru-RU")} ₸/м²</div>
                  ) : (
                    <Skeleton className="h-3 w-16 mt-1" />
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Step 4 — Hardware */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">4</span>
            <Wrench size={16} />
            Фурнитура
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {HARDWARE_OPTIONS.map(({ key, label, sub }) => {
              const coef = settings?.find((s) => s.key === key)?.value;
              return (
                <button
                  key={key}
                  onClick={() => setHardware(key)}
                  className={`furniture-card border-2 rounded-xl p-3 text-center
                    ${hardware === key ? "selected border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                  data-testid={`hardware-${key}`}
                >
                  <div className="font-semibold text-sm">{label}</div>
                  <div className="text-xs text-muted-foreground">{sub}</div>
                  {coef ? (
                    <div className="text-xs font-medium text-primary mt-1">×{parseFloat(coef).toFixed(2)}</div>
                  ) : (
                    <Skeleton className="h-3 w-8 mx-auto mt-1" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Extras */}
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <Checkbox
                id="drawers"
                checked={hasDrawers}
                onCheckedChange={(v) => setHasDrawers(!!v)}
                data-testid="checkbox-drawers"
              />
              <label htmlFor="drawers" className="text-sm cursor-pointer flex-1">
                Выдвижные ящики
              </label>
              {hasDrawers && (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    value={drawerCount}
                    onChange={(e) => setDrawerCount(e.target.value)}
                    min="1"
                    max="20"
                    className="w-16 h-8 text-sm text-center"
                    data-testid="input-drawer-count"
                  />
                  <span className="text-sm text-muted-foreground">шт.</span>
                </div>
              )}
            </div>
            {furnitureType !== "kitchen" && (
              <div className="flex items-center gap-3">
                <Checkbox
                  id="mirror"
                  checked={hasMirror}
                  onCheckedChange={(v) => setHasMirror(!!v)}
                  data-testid="checkbox-mirror"
                />
                <label htmlFor="mirror" className="text-sm cursor-pointer">
                  Зеркальная дверь (+{settings ? parseInt(settings.find(s => s.key === "mirror_price")?.value ?? "18000").toLocaleString("ru-RU") : "…"} ₸)
                </label>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Calculate button */}
      <Button
        onClick={handleCalculate}
        disabled={calcMutation.isPending}
        className="w-full h-12 text-base font-semibold"
        data-testid="btn-calculate"
      >
        {calcMutation.isPending ? (
          <><Loader2 size={18} className="animate-spin mr-2" />Считаем…</>
        ) : (
          "Рассчитать стоимость →"
        )}
      </Button>

      {/* Result card */}
      {result && (
        <div ref={priceRef}>
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-5 pb-5">
              <div className="text-center mb-4">
                <CheckCircle2 size={32} className="text-primary mx-auto mb-2" />
                <div className="text-3xl font-bold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                  {fmt(result.finalPrice)}
                </div>
                <div className="text-sm text-muted-foreground mt-1">Итоговая стоимость</div>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-4 text-center">
                <div className="bg-card rounded-lg p-3">
                  <div className="text-lg font-bold">{fmt(result.basePrice)}</div>
                  <div className="text-xs text-muted-foreground">Базовая цена</div>
                </div>
                <div className="bg-card rounded-lg p-3">
                  <div className="text-lg font-bold">{result.markupPercent}%</div>
                  <div className="text-xs text-muted-foreground">Наценка</div>
                </div>
                <div className="bg-card rounded-lg p-3">
                  <div className="text-lg font-bold">{result.deadline} дн.</div>
                  <div className="text-xs text-muted-foreground">Срок изготовления</div>
                </div>
              </div>

              {/* Contact form */}
              <div className="mt-5 space-y-3 border-t border-border pt-5">
                <p className="font-semibold text-sm text-center">Оставить заявку</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Ваше имя</Label>
                    <Input
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Иван Иванов"
                      data-testid="input-client-name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Номер телефона</Label>
                    <Input
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="+7 700 000 0000"
                      type="tel"
                      data-testid="input-client-phone"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Комментарий (необязательно)</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Особые пожелания, цвет, дополнения..."
                    data-testid="input-notes"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <Button
                    onClick={handleSubmit}
                    disabled={leadMutation.isPending}
                    className="w-full"
                    data-testid="btn-submit"
                  >
                    {leadMutation.isPending ? (
                      <Loader2 size={16} className="animate-spin mr-1" />
                    ) : (
                      <Send size={16} className="mr-1.5" />
                    )}
                    Отправить заявку
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (!clientName.trim()) { toast({ title: "Введите ваше имя", variant: "destructive" }); return; }
                      openWhatsApp({ clientName, furnitureType, finalPrice: result.finalPrice, deadline: result.deadline });
                    }}
                    className="w-full border-green-500 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950"
                    data-testid="btn-whatsapp"
                  >
                    <MessageCircle size={16} className="mr-1.5" />
                    WhatsApp
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
