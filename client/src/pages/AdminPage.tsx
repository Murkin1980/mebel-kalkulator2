import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Settings } from "@shared/schema";
import { Save, AlertCircle, Info, ExternalLink } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  material: "💰 Цены на материалы (₸ за м²)",
  hardware: "🔩 Коэффициенты фурнитуры",
  markup:   "📊 Наценки и дополнительные настройки",
  deadline: "🗓 Сроки изготовления",
};

export default function AdminPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery<Settings[]>({ queryKey: ["/api/settings"] });

  // Local editable state keyed by setting key
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      apiRequest("PATCH", `/api/settings/${key}`, { value }).then((r) => r.json()),
    onSuccess: (_data, { key }) => {
      setSaving((s) => ({ ...s, [key]: false }));
      qc.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Сохранено" });
    },
    onError: (_e, { key }) => {
      setSaving((s) => ({ ...s, [key]: false }));
      toast({ title: "Ошибка сохранения", variant: "destructive" });
    },
  });

  function handleSave(key: string) {
    const val = edits[key];
    if (val === undefined) return;
    setSaving((s) => ({ ...s, [key]: true }));
    mutation.mutate({ key, value: val });
  }

  function getValue(key: string) {
    if (edits[key] !== undefined) return edits[key];
    return settings?.find((s) => s.key === key)?.value ?? "";
  }

  const grouped = settings?.reduce<Record<string, Settings[]>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {}) ?? {};

  // Ordered category list
  const categoryOrder = ["material", "hardware", "markup", "deadline"];

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6 space-y-3">
              {[1, 2, 3].map((j) => <Skeleton key={j} className="h-10 w-full" />)}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          Настройки калькулятора
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Меняйте цены, коэффициенты и сроки без программиста. Изменения применяются сразу.
        </p>
      </div>

      {/* Google Sheets Integration Guide */}
      <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30">
        <CardContent className="pt-5 pb-4">
          <div className="flex gap-3">
            <Info size={18} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm space-y-2">
              <p className="font-semibold text-blue-800 dark:text-blue-300">Интеграция с Google Sheets</p>
              <p className="text-blue-700 dark:text-blue-400">
                Чтобы новые заявки автоматически попадали в таблицу:
              </p>
              <ol className="list-decimal pl-4 space-y-1 text-blue-700 dark:text-blue-400">
                <li>Откройте Google Sheets → Расширения → Apps Script</li>
                <li>Вставьте скрипт-вебхук (кнопка ниже для скачивания)</li>
                <li>Опубликуйте как «Веб-приложение» → скопируйте URL</li>
                <li>Вставьте URL в поле «Google Sheets Webhook URL» ниже</li>
              </ol>
              <a
                href="https://script.google.com/home"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                Открыть Google Apps Script <ExternalLink size={13} />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {categoryOrder.map((cat) => {
        const items = grouped[cat];
        if (!items) return null;
        return (
          <Card key={cat}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{CATEGORY_LABELS[cat] ?? cat}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {items.map((s) => {
                  const isWebhook = s.key === "sheets_webhook";
                  const isWA = s.key === "whatsapp_number";
                  const val = getValue(s.key);
                  const isDirty = edits[s.key] !== undefined && edits[s.key] !== s.value;

                  return (
                    <div key={s.key} className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="text-sm font-medium block mb-1 leading-tight" htmlFor={`setting-${s.key}`}>
                          {s.label}
                        </label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              id={`setting-${s.key}`}
                              value={val}
                              onChange={(e) => setEdits((prev) => ({ ...prev, [s.key]: e.target.value }))}
                              placeholder={isWebhook ? "https://script.google.com/macros/s/..." : isWA ? "77001234567" : ""}
                              className={`${s.unit ? "pr-14" : ""} ${isDirty ? "border-primary" : ""}`}
                              type={isWebhook || isWA ? "text" : "number"}
                              data-testid={`setting-${s.key}`}
                            />
                            {s.unit && (
                              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                                {s.unit}
                              </span>
                            )}
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleSave(s.key)}
                            disabled={!isDirty || saving[s.key]}
                            className="shrink-0"
                            data-testid={`save-${s.key}`}
                          >
                            {saving[s.key] ? (
                              <span className="animate-pulse">…</span>
                            ) : (
                              <><Save size={14} className="mr-1" />Сохранить</>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* How pricing works */}
      <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30">
        <CardContent className="pt-5 pb-4">
          <div className="flex gap-3">
            <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-semibold">Как считается цена</p>
              <p>Базовая цена = Площадь (м²) × Цена материала × Коэффициент фурнитуры + Доплаты</p>
              <p>Итоговая цена = Базовая × (1 + Наценка / 100)</p>
              <p className="text-amber-700 dark:text-amber-400">Площадь = ширина × высота в метрах (глубина учитывается в наценке)</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
