import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Lead } from "@shared/schema";
import {
  Phone, MessageCircle, Trash2, ChefHat, DoorOpen,
  LayoutGrid, CheckCircle2, Clock, UserCheck, Download
} from "lucide-react";

const TYPE_LABELS: Record<string, { label: string; icon: typeof ChefHat }> = {
  kitchen:  { label: "Кухня",      icon: ChefHat },
  wardrobe: { label: "Шкаф-купе",  icon: DoorOpen },
  dressing: { label: "Гардероб",   icon: LayoutGrid },
};

const STATUS_OPTIONS = [
  { value: "new",       label: "Новая",         className: "badge-new" },
  { value: "contacted", label: "Связались",      className: "badge-contacted" },
  { value: "done",      label: "Выполнено",      className: "badge-done" },
];

function fmt(n: number) {
  return n.toLocaleString("ru-RU") + " ₸";
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function matLabel(key: string) {
  const m: Record<string, string> = {
    mat_ldsp: "ЛДСП", mat_mdf: "МДФ", mat_eco: "Экошпон", mat_massiv: "Массив",
  };
  return m[key] ?? key;
}
function hwLabel(key: string) {
  const h: Record<string, string> = { hw_econom: "Эконом", hw_blum: "Blum", hw_hettich: "Hettich" };
  return h[key] ?? key;
}

export default function LeadsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: leads, isLoading } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/leads/${id}/status`, { status }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/leads"] }),
    onError: () => toast({ title: "Ошибка обновления", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/leads/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Заявка удалена" });
    },
    onError: () => toast({ title: "Ошибка удаления", variant: "destructive" }),
  });

  function exportCSV() {
    if (!leads?.length) return;
    const headers = ["ID", "Дата", "Клиент", "Телефон", "Тип", "Ш×В×Г (см)", "Материал", "Фурнитура", "Базовая цена", "Наценка%", "Итого", "Срок(дн.)", "Комментарий", "Статус"];
    const rows = leads.map((l) => [
      l.id, formatDate(l.createdAt), l.clientName, l.clientPhone,
      TYPE_LABELS[l.furnitureType]?.label ?? l.furnitureType,
      `${l.width}×${l.height}×${l.depth}`,
      matLabel(l.material), hwLabel(l.hardware),
      l.basePrice, l.markupPercent, l.finalPrice, l.deadline,
      l.notes ?? "", l.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "заявки.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
      </div>
    );
  }

  const sorted = [...(leads ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Stats
  const total = sorted.length;
  const totalRevenue = sorted.filter((l) => l.status === "done").reduce((s, l) => s + l.finalPrice, 0);
  const newCount = sorted.filter((l) => l.status === "new").length;

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Заявки клиентов
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Все расчёты и контакты в одном месте</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={!total} data-testid="btn-export">
          <Download size={14} className="mr-1.5" />
          Экспорт CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold">{total}</div>
            <div className="text-xs text-muted-foreground">Всего заявок</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold text-primary">{newCount}</div>
            <div className="text-xs text-muted-foreground">Новых</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-lg font-bold text-green-600 dark:text-green-400 leading-tight">
              {totalRevenue > 0 ? (totalRevenue / 1000).toFixed(0) + "к" : "—"}
            </div>
            <div className="text-xs text-muted-foreground">Выполнено (₸)</div>
          </CardContent>
        </Card>
      </div>

      {/* Leads list */}
      {sorted.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock size={40} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Заявок пока нет</p>
            <p className="text-xs text-muted-foreground mt-1">Заявки появятся после расчёта в калькуляторе</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((lead) => {
            const typeInfo = TYPE_LABELS[lead.furnitureType];
            const Icon = typeInfo?.icon ?? ChefHat;
            const statusOpt = STATUS_OPTIONS.find((s) => s.value === lead.status) ?? STATUS_OPTIONS[0];

            return (
              <Card key={lead.id} className="hover:shadow-md transition-shadow" data-testid={`lead-card-${lead.id}`}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon size={20} className="text-primary" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{lead.clientName}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusOpt.className}`}>
                          {statusOpt.label}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">{formatDate(lead.createdAt)}</span>
                      </div>

                      <div className="text-xs text-muted-foreground mt-0.5">
                        {typeInfo?.label} · {lead.width}×{lead.height}×{lead.depth} см · {matLabel(lead.material)} · {hwLabel(lead.hardware)}
                      </div>

                      {lead.notes && (
                        <div className="text-xs text-muted-foreground italic mt-0.5">"{lead.notes}"</div>
                      )}

                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="text-base font-bold text-foreground">{fmt(lead.finalPrice)}</span>
                        <span className="text-xs text-muted-foreground">срок: {lead.deadline} дн.</span>
                        <span className="text-xs text-muted-foreground">наценка: {lead.markupPercent}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border flex-wrap">
                    <a
                      href={`tel:${lead.clientPhone}`}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      data-testid={`lead-phone-${lead.id}`}
                    >
                      <Phone size={13} />
                      {lead.clientPhone}
                    </a>
                    <a
                      href={`https://wa.me/${lead.clientPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Здравствуйте, ${lead.clientName}! По вашему расчёту мебели на ${fmt(lead.finalPrice)}.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:underline ml-1"
                      data-testid={`lead-wa-${lead.id}`}
                    >
                      <MessageCircle size={13} />
                      WhatsApp
                    </a>

                    <div className="flex items-center gap-1 ml-auto">
                      {STATUS_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => statusMut.mutate({ id: lead.id, status: opt.value })}
                          disabled={lead.status === opt.value || statusMut.isPending}
                          className={`text-xs px-2 py-0.5 rounded-full border transition-colors
                            ${lead.status === opt.value
                              ? `${opt.className} border-transparent font-semibold`
                              : "border-border text-muted-foreground hover:border-primary/40"
                            }`}
                          data-testid={`status-${lead.id}-${opt.value}`}
                        >
                          {opt.value === "done" ? <CheckCircle2 size={10} className="inline mr-0.5" /> :
                           opt.value === "contacted" ? <UserCheck size={10} className="inline mr-0.5" /> :
                           <Clock size={10} className="inline mr-0.5" />}
                          {opt.label}
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          if (confirm("Удалить заявку?")) deleteMut.mutate(lead.id);
                        }}
                        className="ml-1 p-1 text-muted-foreground hover:text-destructive transition-colors rounded"
                        data-testid={`delete-lead-${lead.id}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
