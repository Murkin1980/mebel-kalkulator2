/**
 * «Мои тарифы» — mobile-first editor for one tariff profile (DEV-CP-02).
 *
 * Editing happens on an in-memory draft validated by the shared Zod schema.
 * Nothing is written to storage until the user saves; the price preview always
 * uses the draft and never calls the server.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { AlertTriangle, ArrowLeft, Check, Copy, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PRICING_SCHEMA_VERSION,
  parseTariffProfile,
  salamatMebelProfile,
  serializeProfile,
  tariffProfileSchema,
  type ExtraItem,
  type PricingMethod,
  type Tariff,
  type TariffProfile,
} from "@shared/pricing";
import { useTariffProfiles, nowIso, withTariffProfiles } from "@/components/tariffs/TariffProfilesProvider";
import { TariffForm, type PricedDraft } from "@/components/tariffs/TariffForm";
import { TariffPreview } from "@/components/tariffs/TariffPreview";
import { NumberField } from "@/components/tariffs/NumberField";
import {
  METHOD_OPTIONS,
  ROUNDING_MODE_OPTIONS,
  formatKzt,
  formatPrice,
  methodLabel,
} from "@/lib/tariff-meta";
import {
  addCategory,
  blankExtra,
  blankTariff,
  createProfileFromSource,
  duplicateProfile,
  isTemplateProfile,
  removeExtra,
  removeTariff,
  replaceExtra,
  replaceTariff,
  touchProfile,
} from "@/lib/tariff-profiles";

interface Issue {
  path: (string | number)[];
  message: string;
}

function workingCopy(profile: TariffProfile | undefined): TariffProfile | null {
  return profile ? (JSON.parse(serializeProfile(profile)) as TariffProfile) : null;
}

function comparable(profile: TariffProfile): string {
  return JSON.stringify({ ...profile, version: 0, updatedAt: "" });
}

function TariffEditorPageInner() {
  const params = useParams<{ profileId: string }>();
  const profileId = params.profileId ?? "";
  const [, navigate] = useLocation();
  const { getProfile, saveProfile, lastError, clearError, allProfiles, status } = useTariffProfiles();

  const source = getProfile(profileId);
  const readOnly = !source || isTemplateProfile(source);

  const [draft, setDraft] = useState<TariffProfile | null>(() => workingCopy(source));
  const [base, setBase] = useState<TariffProfile | null>(() => workingCopy(source));
  const [editingTariff, setEditingTariff] = useState<string | null>(null);
  const [editingExtra, setEditingExtra] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [deleteTariffId, setDeleteTariffId] = useState<string | null>(null);
  const [deleteExtraId, setDeleteExtraId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const syncedRef = useRef<{ profileId: string; version: number } | null>(null);

  // Load a working copy whenever the route profile (or its stored version) changes.
  useEffect(() => {
    if (!source) return;
    const synced = syncedRef.current;
    // Already showing this exact stored version (e.g. right after saving):
    // keep the draft so unsaved field state and the "saved" marker survive.
    if (synced && synced.profileId === source.profileId && synced.version === source.version) return;

    const copy = workingCopy(source);
    syncedRef.current = { profileId: source.profileId, version: source.version };
    setDraft(copy);
    setBase(copy);
    setEditingTariff(null);
    setEditingExtra(null);
    setSavedAt(null);
    setSaveError(null);
  }, [source?.profileId, source?.version, status]);

  const dirty = Boolean(draft && base && comparable(draft) !== comparable(base));

  const validation = useMemo(() => {
    if (!draft) return { profile: null as TariffProfile | null, issues: [] as Issue[] };
    const result = tariffProfileSchema.safeParse(draft);
    if (result.success) return { profile: result.data, issues: [] as Issue[] };
    return {
      profile: null,
      issues: result.error.issues.map((issue) => ({ path: issue.path as (string | number)[], message: issue.message })),
    };
  }, [draft]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function updateDraft(next: TariffProfile) {
    setDraft(next);
    setSavedAt(null);
  }

  function guardLeave(): boolean {
    if (!dirty) return true;
    return window.confirm("Есть несохранённые изменения. Выйти без сохранения?");
  }

  async function handleSave() {
    if (!draft) return;
    if (!validation.profile) {
      setSaveError("Исправьте ошибки в профиле — сохранение отменено");
      return;
    }
    setSaveError(null);
    const next = touchProfile(validation.profile, nowIso());
    const saved = await saveProfile(next);
    if (saved) {
      syncedRef.current = { profileId: next.profileId, version: next.version };
      setDraft(next);
      setBase(next);
      setSavedAt(next.updatedAt);
    } else {
      setSaveError("Не удалось сохранить изменения. Проверьте локальное хранилище и повторите.");
    }
  }

  async function startOwnCopy() {
    const copy = createProfileFromSource({
      name: "Мой профиль",
      source: draft ?? salamatMebelProfile,
      takenIds: allProfiles.map((profile) => profile.profileId),
      takenNames: allProfiles.map((profile) => profile.name),
      now: nowIso(),
    });
    const saved = await saveProfile(copy, { setActive: false });
    if (saved) navigate(`/tariffs/${copy.profileId}`);
  }

  async function handleDuplicate() {
    if (!draft) return;
    const copy = duplicateProfile(
      draft,
      nowIso(),
      allProfiles.map((profile) => profile.profileId),
      allProfiles.map((profile) => profile.name),
    );
    const saved = await saveProfile(copy, { setActive: false });
    if (saved) navigate(`/tariffs/${copy.profileId}`);
  }

  if (!source) {
    return (
      <div className="space-y-4 pb-8">
        <p className="text-sm text-muted-foreground">Профиль не найден.</p>
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/tariffs">К профилям</Link>
        </Button>
      </div>
    );
  }

  if (!draft) {
    return <p className="text-sm text-muted-foreground pb-8">Загрузка профиля…</p>;
  }

  const tariffIssues = (tariffId: string): string[] => {
    const index = draft.tariffs.findIndex((tariff) => tariff.tariffId === tariffId);
    return validation.issues
      .filter((issue) => issue.path[0] === "tariffs" && issue.path[1] === index)
      .map((issue) => `${issue.path.slice(2).join(".") || "тариф"}: ${issue.message}`);
  };
  const extraIssues = (extraId: string): string[] => {
    const index = draft.extras.findIndex((extra) => extra.extraId === extraId);
    return validation.issues
      .filter((issue) => issue.path[0] === "extras" && issue.path[1] === index)
      .map((issue) => `${issue.path.slice(2).join(".") || "доплата"}: ${issue.message}`);
  };
  const globalIssues = validation.issues
    .filter((issue) => issue.path[0] !== "tariffs" && issue.path[0] !== "extras")
    .map((issue) => `${issue.path.join(".") || "профиль"}: ${issue.message}`);

  function patchTariff(next: PricedDraft) {
    updateDraft(replaceTariff(draft!, next as Tariff));
  }

  function patchExtra(next: PricedDraft) {
    updateDraft(replaceExtra(draft!, next as ExtraItem));
  }

  return (
    <div className="space-y-4 pb-28" data-testid="tariff-editor">
      <div className="flex items-start gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0"
          aria-label="Назад к профилям"
          onClick={() => guardLeave() && navigate("/tariffs")}
          data-testid="back-to-profiles"
        >
          <ArrowLeft size={18} />
        </Button>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold break-words" style={{ fontFamily: "var(--font-display)" }}>
            {readOnly ? "Шаблон Salamat Mebel" : draft.name}
          </h1>
          <p className="text-xs text-muted-foreground">
            v{draft.version} · схема {draft.schemaVersion} ·{" "}
            {readOnly ? "только чтение" : "изменения сохраняются на этом устройстве"}
          </p>
        </div>
      </div>

      {readOnly && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300 space-y-2" data-testid="template-banner">
          <p className="font-medium">Это неизменяемый шаблон. Правки в него не сохраняются.</p>
          <Button size="sm" className="min-h-11" onClick={() => void startOwnCopy()} data-testid="template-copy-edit">
            <Copy size={14} className="mr-1.5" />
            Создать копию и редактировать
          </Button>
        </div>
      )}

      {lastError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive" role="alert">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span className="flex-1">{lastError}</span>
          <button onClick={clearError} className="underline">
            Скрыть
          </button>
        </div>
      )}
      {saveError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive" role="alert" data-testid="save-error">
          {saveError}
        </div>
      )}
      {validation.issues.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive space-y-1" role="alert" data-testid="validation-summary">
          <p className="font-medium">Профиль содержит ошибки ({validation.issues.length})</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {validation.issues.slice(0, 6).map((issue) => (
              <li key={`${issue.path.join(".")}-${issue.message}`} className="break-words">
                {issue.path.join(".") || "профиль"}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Profile settings */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Параметры профиля</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name" className="text-sm">
              Название профиля
            </Label>
            <Input
              id="profile-name"
              value={draft.name}
              disabled={readOnly}
              onChange={(event) => updateDraft({ ...draft, name: event.target.value })}
              className="min-h-11 text-base"
              data-testid="profile-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-method" className="text-sm">
              Основной метод расчёта
            </Label>
            <select
              id="profile-method"
              value={draft.calculationMethod}
              disabled={readOnly}
              onChange={(event) => updateDraft({ ...draft, calculationMethod: event.target.value as PricingMethod })}
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base"
              data-testid="profile-method"
            >
              {METHOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} — {option.unitLabel}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rounding-mode" className="text-sm">
                Округление итога
              </Label>
              <select
                id="rounding-mode"
                value={draft.roundingRules.mode}
                disabled={readOnly}
                onChange={(event) =>
                  updateDraft({
                    ...draft,
                    roundingRules: { ...draft.roundingRules, mode: event.target.value as TariffProfile["roundingRules"]["mode"] },
                  })
                }
                className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base"
                data-testid="rounding-mode"
              >
                {ROUNDING_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <NumberField
              id="rounding-step"
              label="Шаг округления"
              value={draft.roundingRules.incrementKzt}
              unit="₸"
              onChange={(value) =>
                updateDraft({
                  ...draft,
                  roundingRules: { ...draft.roundingRules, incrementKzt: value ?? 1 },
                })
              }
              testId="rounding-step"
              hint="Например: 1, 100, 1000"
            />
          </div>
          <p className="text-xs text-muted-foreground">Схема профиля: версия {PRICING_SCHEMA_VERSION}. Данные сохраняются только на устройстве.</p>
        </CardContent>
      </Card>

      {/* Categories */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Категории</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {draft.categories.map((category) => (
              <span key={category.categoryId} className="rounded-full bg-muted px-3 py-1 text-xs">
                {category.label}
              </span>
            ))}
          </div>
          {!readOnly && (
            showCategoryInput ? (
              <div className="flex gap-2">
                <Input
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  placeholder="Название категории"
                  aria-label="Название новой категории"
                  className="min-h-11 text-base"
                  data-testid="category-name"
                />
                <Button
                  className="min-h-11"
                  onClick={() => {
                    if (!categoryName.trim()) return;
                    updateDraft(addCategory(draft, categoryName).profile);
                    setCategoryName("");
                    setShowCategoryInput(false);
                  }}
                  data-testid="category-save"
                >
                  Добавить
                </Button>
              </div>
            ) : (
              <Button variant="outline" className="min-h-11" onClick={() => setShowCategoryInput(true)} data-testid="add-category">
                <Plus size={15} className="mr-1.5" />
                Своя категория
              </Button>
            )
          )}
        </CardContent>
      </Card>

      {/* Tariffs */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Тарифы</CardTitle>
          {!readOnly && (
            <Button
              size="sm"
              variant="outline"
              className="min-h-11"
              onClick={() => {
                const created = blankTariff(draft.categories[0]?.categoryId ?? "", draft.tariffs.map((tariff) => tariff.tariffId));
                updateDraft({ ...draft, tariffs: [...draft.tariffs, created] });
                setEditingTariff(created.tariffId);
              }}
              data-testid="add-tariff"
            >
              <Plus size={14} className="mr-1" />
              Добавить
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {draft.categories.map((category) => {
            const items = draft.tariffs.filter((tariff) => tariff.categoryId === category.categoryId);
            if (items.length === 0) return null;
            return (
              <div key={category.categoryId} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category.label}</h3>
                {items.map((tariff) => {
                  const open = editingTariff === tariff.tariffId;
                  return (
                    <div key={tariff.tariffId} className="rounded-lg border border-border" data-testid={`tariff-row-${tariff.tariffId}`}>
                      <button
                        type="button"
                        onClick={() => setEditingTariff(open ? null : tariff.tariffId)}
                        disabled={readOnly}
                        className="flex w-full items-start justify-between gap-3 p-3 min-h-11 text-left disabled:cursor-default"
                        aria-expanded={open}
                        data-testid={`toggle-tariff-${tariff.tariffId}`}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-medium break-words">{tariff.label || "Без названия"}</span>
                          <span className="block text-xs text-muted-foreground">
                            {methodLabel(tariff.method)}
                            {tariff.method === "COST_PLUS"
                              ? ` · ${formatKzt(tariff.unitCostKzt ?? 0)} + ${tariff.markupPercent ?? 0}%`
                              : ` · ${formatPrice(tariff.priceKzt)}`}
                          </span>
                        </span>
                        {!readOnly && <span className="text-xs text-muted-foreground shrink-0">{open ? "свернуть" : "изменить"}</span>}
                      </button>
                      {open && (
                        <div className="border-t border-border p-3 space-y-3">
                          <TariffForm
                            value={tariff}
                            categories={draft.categories}
                            includedServices={draft.includedServices}
                            onChange={patchTariff}
                            errors={tariffIssues(tariff.tariffId)}
                            testIdPrefix={`tariff-${tariff.tariffId}`}
                          />
                          <Button
                            variant="outline"
                            className="min-h-11 w-full text-destructive hover:text-destructive"
                            onClick={() => setDeleteTariffId(tariff.tariffId)}
                            data-testid={`delete-tariff-${tariff.tariffId}`}
                          >
                            <Trash2 size={14} className="mr-1.5" />
                            Удалить тариф
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Extras */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Дополнительные позиции</CardTitle>
          {!readOnly && (
            <Button
              size="sm"
              variant="outline"
              className="min-h-11"
              onClick={() => {
                const created = blankExtra(draft.extras.map((extra) => extra.extraId));
                updateDraft({ ...draft, extras: [...draft.extras, created] });
                setEditingExtra(created.extraId);
              }}
              data-testid="add-extra"
            >
              <Plus size={14} className="mr-1" />
              Добавить
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {draft.extras.length === 0 && (
            <p className="text-sm text-muted-foreground" data-testid="extras-empty">
              Дополнительных позиций нет.
            </p>
          )}
          {draft.extras.map((extra) => {
            const open = editingExtra === extra.extraId;
            return (
              <div key={extra.extraId} className="rounded-lg border border-border" data-testid={`extra-row-${extra.extraId}`}>
                <button
                  type="button"
                  onClick={() => setEditingExtra(open ? null : extra.extraId)}
                  disabled={readOnly}
                  className="flex w-full items-start justify-between gap-3 p-3 min-h-11 text-left disabled:cursor-default"
                  aria-expanded={open}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium break-words">{extra.label || "Без названия"}</span>
                    <span className="block text-xs text-muted-foreground">
                      {methodLabel(extra.method)} · {formatPrice(extra.priceKzt)}
                      {extra.coversServiceId ? " · за услугу" : ""}
                    </span>
                  </span>
                  {!readOnly && <span className="text-xs text-muted-foreground shrink-0">{open ? "свернуть" : "изменить"}</span>}
                </button>
                {open && (
                  <div className="border-t border-border p-3 space-y-3">
                    <TariffForm
                      value={extra}
                      categories={draft.categories}
                      includedServices={draft.includedServices}
                      onChange={patchExtra}
                      errors={extraIssues(extra.extraId)}
                      testIdPrefix={`extra-${extra.extraId}`}
                    />
                    <p className="text-xs text-muted-foreground">
                      Услуги, отмеченные в тарифе как включённые, нельзя начислить повторно — расчёт отклонит такую доплату.
                    </p>
                    <Button
                      variant="outline"
                      className="min-h-11 w-full text-destructive hover:text-destructive"
                      onClick={() => setDeleteExtraId(extra.extraId)}
                    >
                      <Trash2 size={14} className="mr-1.5" />
                      Удалить позицию
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <TariffPreview
        profile={validation.profile}
        disabledReason={readOnly ? "Шаблон доступен только для просмотра — создайте копию, чтобы менять цены." : undefined}
      />

      {globalIssues.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive" role="alert">
          {globalIssues.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}

      {!readOnly && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-5xl items-center gap-2">
            <div className="flex-1 min-w-0 text-xs">
              {dirty ? (
                <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400" data-testid="dirty-indicator">
                  <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                  Не сохранено
                </span>
              ) : savedAt ? (
                <span className="flex items-center gap-1.5 text-muted-foreground" data-testid="saved-indicator">
                  <Check size={13} /> Сохранено
                </span>
              ) : (
                <span className="text-muted-foreground">Изменений нет</span>
              )}
            </div>
            <Button variant="outline" className="min-h-11 px-3 text-xs" onClick={() => void handleDuplicate()}>
              <Copy size={14} className="mr-1" />
              Копия
            </Button>
            <Button
              className="min-h-11 px-3 text-xs"
              onClick={() => void handleSave()}
              disabled={!dirty || !validation.profile}
              data-testid="save-profile"
            >
              <Save size={15} className="mr-1" />
              Сохранить
            </Button>
          </div>
        </div>
      )}

      {/* Delete tariff confirm */}
      <Dialog open={Boolean(deleteTariffId)} onOpenChange={(open) => !open && setDeleteTariffId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить тариф?</DialogTitle>
            <DialogDescription>Позиция исчезнет из профиля после сохранения.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => setDeleteTariffId(null)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              className="min-h-11"
              onClick={() => {
                if (deleteTariffId) {
                  updateDraft(removeTariff(draft, deleteTariffId));
                  setEditingTariff(null);
                }
                setDeleteTariffId(null);
              }}
              data-testid="confirm-delete-tariff"
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete extra confirm */}
      <Dialog open={Boolean(deleteExtraId)} onOpenChange={(open) => !open && setDeleteExtraId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить позицию?</DialogTitle>
            <DialogDescription>Позиция исчезнет из профиля после сохранения.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => setDeleteExtraId(null)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              className="min-h-11"
              onClick={() => {
                if (deleteExtraId) {
                  updateDraft(removeExtra(draft, deleteExtraId));
                  setEditingExtra(null);
                }
                setDeleteExtraId(null);
              }}
              data-testid="confirm-delete-extra"
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {status === "memory" && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Внимание: локальное хранилище недоступно, изменения не сохранятся после перезагрузки.
        </p>
      )}
    </div>
  );
}

export default withTariffProfiles(TariffEditorPageInner);
