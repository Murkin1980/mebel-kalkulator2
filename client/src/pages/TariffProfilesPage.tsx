/**
 * «Профили» — tariff profile management (DEV-CP-02).
 * Mobile-first list of the read-only template and user-owned profiles.
 */
import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { AlertTriangle, Check, Copy, Download, FileUp, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { salamatMebelProfile, serializeProfile, type TariffProfile } from "@shared/pricing";
import { useTariffProfiles, nowIso, withTariffProfiles } from "@/components/tariffs/TariffProfilesProvider";
import {
  createProfileFromSource,
  duplicateProfile,
  isTemplateProfile,
  prepareImport,
  renameProfile,
} from "@/lib/tariff-profiles";
import { formatKzt } from "@/lib/tariff-meta";

function downloadProfile(profile: TariffProfile) {
  const blob = new Blob([serializeProfile(profile)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${profile.profileId}-v${profile.version}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadRejectedProfiles(records: { key: string; reason: string; raw: unknown }[]) {
  const recovery = {
    format: "salamat-calc-rejected-profiles-v1",
    exportedAt: new Date().toISOString(),
    records,
  };
  const json = JSON.stringify(recovery, null, 2);
  if (!json) throw new Error("Повреждённые данные нельзя представить в JSON");
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `salamat-calc-rejected-profiles-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function TariffProfilesPageInner() {
  const { allProfiles, userProfiles, activeProfileId, rejectedProfiles, status, storageMessage, lastError, clearError, saveProfile, setActiveProfile, deleteProfile } =
    useTariffProfiles();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [renameTarget, setRenameTarget] = useState<TariffProfile | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TariffProfile | null>(null);
  const [importPreview, setImportPreview] = useState<{ profile: TariffProfile; renamedId: boolean; conflictWith: string | null; fileName: string } | null>(null);
  const [importError, setImportError] = useState<{ message: string; issues?: string[] } | null>(null);
  const [pendingJson, setPendingJson] = useState<string | null>(null);
  const [diagnosticExportError, setDiagnosticExportError] = useState<string | null>(null);

  async function handleCreate() {
    const profile = createProfileFromSource({
      name: createName,
      takenIds: allProfiles.map((item) => item.profileId),
      takenNames: allProfiles.map((item) => item.name),
      now: nowIso(),
    });
    const saved = await saveProfile(profile, { setActive: false });
    if (saved) {
      setCreateOpen(false);
      setCreateName("");
      navigate(`/tariffs/${profile.profileId}`);
    }
  }

  async function handleDuplicate(profile: TariffProfile) {
    const copy = duplicateProfile(
      profile,
      nowIso(),
      allProfiles.map((item) => item.profileId),
      allProfiles.map((item) => item.name),
    );
    await saveProfile(copy, { setActive: false });
  }

  async function handleRename() {
    if (!renameTarget) return;
    const renamed = renameProfile(renameTarget, renameValue, renameTarget.profileId, nowIso());
    const saved = await saveProfile(renamed);
    if (saved) setRenameTarget(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const done = await deleteProfile(deleteTarget.profileId);
    if (done) setDeleteTarget(null);
  }

  async function handleFile(file: File) {
    setImportError(null);
    setImportPreview(null);
    const text = await file.text();
    const outcome = prepareImport(text, userProfiles, nowIso());
    if (outcome.status === "error") {
      setImportError({ message: outcome.message, issues: outcome.issues });
      setPendingJson(null);
      return;
    }
    setPendingJson(text);
    setImportPreview({
      profile: outcome.profile,
      renamedId: outcome.renamedId,
      conflictWith: outcome.conflictWith,
      fileName: file.name,
    });
  }

  async function confirmImport() {
    if (!importPreview) return;
    const saved = await saveProfile(importPreview.profile);
    if (saved) {
      setImportPreview(null);
      setPendingJson(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const editableProfiles = userProfiles;

  return (
    <div className="space-y-5 pb-8" data-testid="profiles-page">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          Профили тарифов
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Свои цены, методы расчёта и округление. Шаблон Salamat Mebel остаётся неизменным.
        </p>
      </div>

      {storageMessage && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300" role="status">
          {storageMessage}
        </div>
      )}
      {rejectedProfiles.length > 0 && (
        <section className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200" role="alert" data-testid="rejected-profiles-warning">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-semibold">Найдено повреждённых записей: {rejectedProfiles.length}</p>
              <p className="text-xs">Они не участвуют в расчётах и не удалялись. Причина указана без содержимого записи.</p>
              <p className="text-xs">Файл восстановления содержит исходные локальные данные и создаётся только по нажатию; на сервер он не отправляется.</p>
              <ul className="space-y-1 text-xs">
                {rejectedProfiles.map(({ key, reason }) => (
                  <li key={key} className="break-all"><span className="font-medium">{key}:</span> {reason}</li>
                ))}
              </ul>
              <Button
                variant="outline"
                className="min-h-11 max-w-full whitespace-normal text-left"
                onClick={() => {
                  try {
                    downloadRejectedProfiles(rejectedProfiles);
                    setDiagnosticExportError(null);
                  } catch (error) {
                    setDiagnosticExportError(error instanceof Error ? error.message : "Не удалось создать файл восстановления");
                  }
                }}
                data-testid="export-rejected-profiles"
              >
                <Download size={14} className="mr-2 shrink-0" />
                Скачать исходные записи для восстановления
              </Button>
              {diagnosticExportError && <p className="text-xs text-destructive" role="alert">{diagnosticExportError}</p>}
            </div>
          </div>
        </section>
      )}

      {status === "error" && lastError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive" role="alert">
          {lastError}
        </div>
      )}
      {lastError && status !== "error" && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive" role="alert">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span className="flex-1">{lastError}</span>
          <button onClick={clearError} className="underline min-h-6">
            Скрыть
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Button onClick={() => setCreateOpen(true)} className="min-h-11 w-full" data-testid="create-profile">
          <Plus size={16} className="mr-2" />
          Новый профиль
        </Button>
        <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="min-h-11 w-full" data-testid="import-profile">
          <FileUp size={16} className="mr-2" />
          Импорт JSON
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Импорт тарифного профиля из JSON"
          data-testid="import-file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>

      {importError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive space-y-1" role="alert" data-testid="import-error">
          <p className="font-medium">{importError.message}</p>
          {importError.issues?.length ? (
            <ul className="list-disc pl-4 text-xs space-y-0.5">
              {importError.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs">Сохранённые профили не изменены.</p>
        </div>
      )}

      {/* Template */}
      <Card data-testid="template-profile">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock size={15} />
            {salamatMebelProfile.name}
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">шаблон</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Версия {salamatMebelProfile.version} · тарифов {salamatMebelProfile.tariffs.length} · округление{" "}
            {salamatMebelProfile.roundingRules.mode} {formatKzt(salamatMebelProfile.roundingRules.incrementKzt)}
          </p>
          <p className="text-xs text-muted-foreground">
            Защищён от изменений. Чтобы менять цены, создайте копию — правки применяются только к ней.
          </p>
          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => navigate("/tariffs/salamat-mebel")} data-testid="open-template">
              Открыть
            </Button>
            <Button
              className="min-h-11"
              onClick={() =>
                void saveProfile(
                  duplicateProfile(
                    salamatMebelProfile,
                    nowIso(),
                    allProfiles.map((item) => item.profileId),
                    allProfiles.map((item) => item.name),
                  ),
                )
              }
              data-testid="copy-template"
            >
              <Copy size={15} className="mr-1.5" />
              Создать копию
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* User profiles */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Мои профили</h2>
        {editableProfiles.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground" data-testid="profiles-empty">
            Пока нет своих профилей. Создайте копию шаблона или новый профиль.
          </p>
        )}
        {editableProfiles.map((profile) => {
          const isActive = activeProfileId === profile.profileId;
          return (
            <Card key={profile.profileId} data-testid={`profile-${profile.profileId}`}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm break-words">{profile.name}</span>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          <Check size={11} /> активный
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      v{profile.version} · схема {profile.schemaVersion} · тарифов {profile.tariffs.length} ·{" "}
                      {formatUpdatedAt(profile.updatedAt)}
                    </p>
                  </div>
                  {!isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11 shrink-0"
                      onClick={() => void setActiveProfile(profile.profileId)}
                      data-testid={`activate-${profile.profileId}`}
                    >
                      Выбрать
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2">
                  <Button size="sm" className="min-h-11" onClick={() => navigate(`/tariffs/${profile.profileId}`)} data-testid={`edit-${profile.profileId}`}>
                    <Pencil size={14} className="mr-1.5" />
                    Изменить
                  </Button>
                  <Button size="sm" variant="outline" className="min-h-11" onClick={() => void handleDuplicate(profile)} data-testid={`duplicate-${profile.profileId}`}>
                    <Copy size={14} className="mr-1.5" />
                    Копировать
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => {
                      setRenameTarget(profile);
                      setRenameValue(profile.name);
                    }}
                    data-testid={`rename-${profile.profileId}`}
                  >
                    Переименовать
                  </Button>
                  <Button size="sm" variant="outline" className="min-h-11" onClick={() => downloadProfile(profile)} data-testid={`export-${profile.profileId}`}>
                    <Download size={14} className="mr-1.5" />
                    Экспорт
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11 min-[380px]:col-span-2 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(profile)}
                    data-testid={`delete-${profile.profileId}`}
                  >
                    <Trash2 size={14} className="mr-1.5" />
                    Удалить профиль
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Профили хранятся только на этом устройстве (IndexedDB). Для переноса используйте экспорт и импорт JSON.
      </p>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Новый профиль</DialogTitle>
            <DialogDescription>Создаётся копия шаблона Salamat Mebel. Шаблон не изменяется.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="new-profile-name">Название</Label>
            <Input
              id="new-profile-name"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="Например: Моя мастерская"
              className="min-h-11 text-base"
              data-testid="new-profile-name"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="min-h-11">
              Отмена
            </Button>
            <Button onClick={() => void handleCreate()} className="min-h-11" data-testid="confirm-create">
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Переименовать профиль</DialogTitle>
            <DialogDescription>Идентификатор профиля останется прежним.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="rename-profile">Новое название</Label>
            <Input
              id="rename-profile"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              className="min-h-11 text-base"
              data-testid="rename-input"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRenameTarget(null)} className="min-h-11">
              Отмена
            </Button>
            <Button onClick={() => void handleRename()} disabled={!renameValue.trim()} className="min-h-11" data-testid="confirm-rename">
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить профиль?</DialogTitle>
            <DialogDescription>
              «{deleteTarget?.name}» и все его тарифы будут удалены с этого устройства. Действие необратимо.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="min-h-11">
              Отмена
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} className="min-h-11" data-testid="confirm-delete">
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import preview dialog */}
      <Dialog open={Boolean(importPreview)} onOpenChange={(open) => !open && setImportPreview(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Импорт профиля</DialogTitle>
            <DialogDescription>Проверьте данные перед сохранением. Существующие профили не перезаписываются.</DialogDescription>
          </DialogHeader>
          {importPreview && (
            <div className="space-y-2 text-sm" data-testid="import-preview">
              <p className="text-xs text-muted-foreground break-all">{importPreview.fileName}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">Название</dt>
                <dd className="break-words">{importPreview.profile.name}</dd>
                <dt className="text-muted-foreground">Идентификатор</dt>
                <dd className="break-all">{importPreview.profile.profileId}</dd>
                <dt className="text-muted-foreground">Версия</dt>
                <dd>
                  v{importPreview.profile.version} · схема {importPreview.profile.schemaVersion}
                </dd>
                <dt className="text-muted-foreground">Позиции</dt>
                <dd>
                  тарифов {importPreview.profile.tariffs.length} · доплат {importPreview.profile.extras.length}
                </dd>
              </dl>
              {importPreview.renamedId && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  Профиль с таким идентификатором уже существует — будет создана копия с новым идентификатором.
                </p>
              )}
              {importPreview.conflictWith === "name" && !importPreview.renamedId && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  Профиль с таким названием уже есть. Названия могут совпадать, идентификаторы — нет.
                </p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setImportPreview(null)} className="min-h-11">
              Отмена
            </Button>
            <Button onClick={() => void confirmImport()} disabled={!pendingJson} className="min-h-11" data-testid="confirm-import">
              Импортировать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground">
        Вернуться к <Link href="/" className="underline underline-offset-2">калькулятору</Link>
      </p>
    </div>
  );
}

export default withTariffProfiles(TariffProfilesPageInner);
