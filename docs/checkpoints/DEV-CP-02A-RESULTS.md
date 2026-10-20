# DEV-CP-02A — SALAMAT CALC Stabilization & Mobile QA

RESULT: **PASS** (браузерная проверка выполнена на реальном Chromium; ограничения перечислены в §6)
Дата: 2026-10-20
MPE decision: `EXTEND_EXISTING`
Режим: BROWSER QA + CORRECTIVE / MINIMAL DIFF
Merge: **не выполнялся**
Deploy: **не выполнялся**

## 1. Идентификация и baseline

| Поле | Значение |
|---|---|
| Repository | `Murkin1980/mebel-kalkulator2` |
| PR | #1 — https://github.com/Murkin1980/mebel-kalkulator2/pull/1 (OPEN, без merge) |
| Baseline commit (актуальный HEAD PR #1) | `0ede19e9a2a82c8c33c6e5e95c8f2e5ca0945563` |
| Ветка сессии (фиксирована средой) | `arena/fb53f410-mebel-kalkulator2` |
| Предыдущий checkpoint | R-1/R-2 из прошлого прогона CP-02A (коммит `97c3408`) — переиспользованы, R-1 исправлен по результатам этого прогона (D-1) |
| Node / npm | Node `v22.22.3`, npm `10.9.8` |
| Browser engine | **Chromium 153.0.8010.0** (Blink/V8, headless new) через `playwright-core` 1.64.1 |

Прочитано до начала работ: `AGENTS.md`, `docs/governance/SCOPE-CHANGE-CONTROL.md`,
`docs/checkpoints/DEV-CP-02A-RESULTS.md` (предыдущая версия), `docs/checkpoints/DEV-CP-02-RESULTS.md`,
`client/src/lib/unsaved-navigation.ts`, `client/src/lib/tariff-store.ts`,
`client/src/pages/TariffEditorPage.tsx`, `client/src/pages/TariffProfilesPage.tsx`,
`client/src/components/tariffs/*`.

Ветка была на `350730c`. HEAD PR #1 получен через `git fetch origin refs/pull/1/head` и добавлен
fast-forward-ом; во время работы ветка PR ушла вперёд (`5b8684a` → `0ede19e`, коммиты
`27e18c6 test: add real Chromium mobile and IndexedDB QA script` и
`0ede19e ci: run isolated Playwright Chromium QA and upload evidence on PR branch`, только CI-обвязка),
поэтому изменения этого checkpoint перебазированы на актуальный head `0ede19e`. Незакоммиченных
изменений до работы не было. PR #1 остаётся OPEN.

### Baseline до изменений

| Проверка | Результат |
|---|---|
| `npm test` | PASS — **93/93**, 19 suites |
| `npm run check` | PASS |
| `npm run build` | PASS (прежние предупреждения про `@import` и Browserslist) |
| Live API | `GET /` 200, `GET /api/settings` 200, `POST /api/calculate` → `{"basePrice":56100,"markupPercent":30,"finalPrice":72930,"deadline":21,"area":6.6}` |

## 2. Как получен браузер (сеть ограничена)

`npx playwright install chromium` невозможен: `cdn.playwright.dev` и `storage.googleapis.com` отклоняются
сетевой политикой среды (`SSL_ERROR_SYSCALL`), `deb.debian.org` тоже, ОС-пакеты не устанавливаются.
Поэтому браузер взят из npm (registry доступен):

1. `npm i playwright-core@1.64.1` — только клиент автоматизации, без загрузки браузера;
2. `npm i @sparticuz/chromium@153.0.0` — brotli-архив Chromium для linux-x64 и архив `al2023.tar.br`
   с недостающими системными библиотеками;
3. распаковка в `/tmp`, запуск Playwright'ом с `executablePath` и `LD_LIBRARY_PATH=/tmp/al2023/lib`
   (даёт `libnspr4`, `libnss3`, `libnssutil3`, которых не хватало).

Проверено, что это рабочий браузер, а не заглушка: рендер страниц, React-события, нативный `confirm`/
`beforeunload`, история Back/Forward, downloads и настоящий IndexedDB. Версия подтверждена `browser.version()`.

В репозиторий не добавлено ни одной зависимости: пакеты установлены только в `/tmp/qa`,
`package.json` и `package-lock.json` не менялись.

## 3. Найденные дефекты и исправления (минимальный diff)

### D-1 — Browser Back уничтожал черновик без предупреждения (функциональный дефект)

Факт: на реальном Chromium при dirty-редакторе `history.back()` уводил на `#/tariffs` **без** `confirm`,
редактор размонтировался и черновик терялся. То есть заявленный в прошлом прогоне R-1 не работал в браузере.

Корневая причина: guard подписывался на `hashchange` из `useEffect`, то есть **после** того, как Wouter
(`useHashLocation`) подписался на тот же `hashchange` на `window`. На одном target слушатели вызываются в
порядке регистрации, флаг `capture` порядок не меняет, поэтому к моменту работы guard'а Wouter уже
перерисовал маршрут и размонтировал редактор (а `useEffect`-cleanup снимал блокировку).

Исправление (`client/src/lib/unsaved-navigation.ts`): guard ставится на `hashchange` один раз при
загрузке модуля, до монтирования React/Wouter; идемпотентность через `hashListenerInstalled`, лишний
cleanup-return удалён. Логика решения (`createUnsavedNavigationGuard`) не менялась.

Проверено в браузере после исправления (все три viewport):

- Back при dirty → `confirm("Есть несохранённые изменения. Выйти без сохранения?")`;
- «Отмена» → URL и редактор остаются, черновик `Моя мастерская QA` на месте;
- Back + «ОК» → один `confirm`, переход на `#/tariffs`, редактор закрыт;
- Forward → редактор снова открыт с сохранёнными данными, `dirty = false`;
- чистый редактор → Back без диалога;
- `beforeunload` (перезагрузка вкладки) → нативный диалог, отказ сохраняет черновик.

### D-2 — на 320 px обрезалась подпись «Создать копию»

Факт: кнопка шаблона 113 px, текст 127 px (`scrollWidth > clientWidth`) → подпись визуально обрезана
(видно на старом скриншоте профилей). Исправление `client/src/pages/TariffProfilesPage.tsx`:
`grid-cols-2` → `grid-cols-1 min-[380px]:grid-cols-2` — тот же приём, что уже используется для кнопок
пользовательского профиля. Новых стилей не вводилось.

### D-3 — подписи «Включённые услуги» были touch-target'ом высотой 20 px

Факт: чекбоксы 16×16, их `<label>` — 20 px по высоте, то есть на телефоне попасть в строку услуги
неудобно (норма проекта — ≥ 44 px). Исправление `client/src/components/tariffs/TariffForm.tsx`:
`<label>` получил `flex min-h-11 flex-1 items-center`, обёртка больше не задаёт `min-h-11`.
Теперь вся строка — цель нажатия (44 px), геометрия чекбокса не менялась.

Итог: изменены 3 файла: **+16 / −14** строк (`TariffForm.tsx` +6/−2, `unsaved-navigation.ts` +9/−11,
`TariffProfilesPage.tsx` +1/−1). API, схемы, `server/*`, `shared/pricing/*`, SQLite и зависимости
не менялись.

## 4. Browser QA — фактические результаты

Скриншоты и полный отчёт: `evidence/dev-cp-02a/browser/` (см. `README.md`).

### 4.1 Сводка

| Показатель | 320 px | 375 px | 430 px |
|---|---|---|---|
| Проверок harness | 55 | 55 | 55 |
| PASS | 55 | 55 | 55 |
| FAIL | 0 | 0 | 0 |
| Горизонтальная прокрутка (`scrollWidth - clientWidth`) | 0 px | 0 px | 0 px |
| Элементов за границей viewport | 0 | 0 | 0 |
| Обрезанных подписей кнопок | 0 | 0 | 0 |
| Обрезанных полей ввода | 0 | 0 | 0 |
| Интерактивных элементов < 44 px | 0 | 0 | 0 |
| Перекрытых кнопок (hit-test) | 0 | 0 | 0 |
| Ошибок в консоли/`pageerror` | 0 | 0 | 0 |

Всего по прогону: **165/165 PASS** (`qa-report.json → summary`), прогон на 3 viewport занял ~92 с.
Прогон выполнен на финальном коммите этого checkpoint (после rebase на head PR).
Дополнительно тот же harness прогнан против production-сборки (`npm start`, `dist/index.cjs`, порт 5001):
**55/55 PASS** на 320 px.

Отдельно: в PR-ветке появился workflow `Salamat Calc Browser QA`
(`.github/workflows/browser-qa.yml`, run `39481406720`) с собственным `scripts/browser-qa.mjs`
(Chromium + `npx playwright install --with-deps`). По `gh run list` этот run завершился **success**
(1 м 42 с), то есть браузерный QA теперь воспроизводим и в GitHub Actions. Скрипт workflow проверяет
меньше сценариев (профили/редактор/Saved/reload, IndexedDB stores, один Back), поэтому он не заменяет
этот прогон, но подтверждает, что окружение CI с браузером рабочее. Логи run из песочницы не
скачиваются (`results-receiver.actions.githubusercontent.com` недоступен); артефакты доступны в GitHub.

### 4.2 Проверенные сценарии (в реальном браузере)

| Проверка | Результат | Доказательство |
|---|---|---|
| Список профилей на пустом IndexedDB: шаблон + пустое состояние | PASS | `*-01-profiles.png` |
| Диалог создания: все кнопки нажимаемы, нет прокрутки | PASS | `*-02-create-dialog.png` |
| Создание профиля → id `user-moya-masterskaya`, запись в IndexedDB | PASS | `*-03-editor-top.png` |
| Редактор: открытие тарифа «Шкафы — ЛДСП Россия» | PASS | `*-04-editor-tariff-open.png` |
| Ввод `-5` → inline-ошибка, значение не проходит | PASS | `qa-report.json` (`steps.fill-tariff`) |
| Ввод `180000` + подтверждение цены | PASS | `*-04-editor-tariff-open.png` |
| Сохранение → IndexedDB `profiles`: `version=2`, `priceKzt=180000`, `isConfirmed=true` | PASS | `*-05-editor-saved.png` |
| Перезагрузка страницы → значения восстановлены | PASS | `*-06-editor-reopened.png` |
| Возврат к списку → повторное открытие профиля → значения на месте | PASS | `*-07-reopened-from-list.png` |
| Активный профиль и метаданные в IndexedDB (store `meta`) | PASS | `qa-report.json → viewports.*.indexedDb` |
| Dirty-черновик + native `beforeunload` при reload | PASS | `*-08/09-*.png`, `dialogs.json` |
| Browser Back при dirty: диалог, «Отмена» сохраняет черновик | PASS | `*-10-back-stay.png` |
| Browser Back при dirty: «ОК» выходит один раз | PASS | `*-11-back-discarded.png` |
| Browser Forward возвращает редактор с сохранёнными данными | PASS | `*-12-forward.png` |
| Чистый редактор: Back без диалогов | PASS | `qa-report.json → steps.clean-back` |
| Повреждённая запись в IndexedDB: предупреждение с ключом и причиной | PASS | `*-13-rejected-warning.png` |
| Экспорт повреждённых записей: реальный файл, raw-данные, запись не удалена | PASS | `*-rejected-export.json`, `*-14-*.png` |
| Валидный профиль рядом с повреждённой записью остаётся в списке | PASS | `*-14-rejected-exported.png` |
| Шаблон: read-only поля, кнопки сохранения нет | PASS | `*-15-template-readonly.png` |
| Низ редактора: предпроверка тарифа, фиксированная панель не перекрывает контент | PASS | `*-16-preview.png` |

Пример экспортированного файла восстановления (`320-rejected-export.json`):

```json
{ "format": "salamat-calc-rejected-profiles-v1",
  "records": [{ "key": "corrupt-qa-record",
    "reason": "Не пройдена проверка полей: version, currency, categories, calculationMethod, tariffs",
    "raw": { "profileId": "corrupt-qa-record", "name": "Повреждённая запись QA", "schemaVersion": 1 } }] }
```

### 4.3 Скриншоты (реальные PNG, 48 файлов)

`evidence/dev-cp-02a/browser/` — по 16 состояний на каждый viewport, DPR 2:

```
320-01-profiles.png              375-01-profiles.png              430-01-profiles.png
320-02-create-dialog.png         375-02-create-dialog.png         430-02-create-dialog.png
320-03-editor-top.png            375-03-editor-top.png            430-03-editor-top.png
320-04-editor-tariff-open.png    375-04-editor-tariff-open.png    430-04-editor-tariff-open.png
320-05-editor-saved.png          375-05-editor-saved.png          430-05-editor-saved.png
320-06-editor-reopened.png       375-06-editor-reopened.png       430-06-editor-reopened.png
320-07-reopened-from-list.png    375-07-reopened-from-list.png    430-07-reopened-from-list.png
320-08-dirty-draft.png           375-08-dirty-draft.png           430-08-dirty-draft.png
320-09-beforeunload-stay.png     375-09-beforeunload-stay.png     430-09-beforeunload-stay.png
320-10-back-stay.png             375-10-back-stay.png             430-10-back-stay.png
320-11-back-discarded.png        375-11-back-discarded.png        430-11-back-discarded.png
320-12-forward.png               375-12-forward.png               430-12-forward.png
320-13-rejected-warning.png      375-13-rejected-warning.png      430-13-rejected-warning.png
320-14-rejected-exported.png     375-14-rejected-exported.png     430-14-rejected-exported.png
320-15-template-readonly.png     375-15-template-readonly.png     430-15-template-readonly.png
320-16-preview.png               375-16-preview.png               430-16-preview.png
320-rejected-export.json         375-rejected-export.json         430-rejected-export.json
qa-report.json  dialogs.json  qa-harness.mjs  README.md
```

Нативные диалоги браузера невозможно снять скриншотом (они вне DOM), поэтому их тип и текст
зафиксированы через события Playwright в `dialogs.json`:
`beforeunload` (3×), `confirm` «Есть несохранённые изменения. Выйти без сохранения?» (6×).

## 5. Обязательные команды (после изменений)

| Проверка | Команда | Результат |
|---|---|---|
| Tests | `npm test` | PASS — **93/93**, 19 suites |
| Typecheck | `npm run check` | PASS, exit 0 |
| Build | `npm run build` | PASS, exit 0 |
| Live API (регрессия) | `POST /api/calculate` | `{"basePrice":56100,"markupPercent":30,"finalPrice":72930,"deadline":21,"area":6.6}` — не изменился |
| Dev server | `GET /` | 200 |
| Production build | `npm start` + harness | 55/55 PASS на 320 px |

Размеры бандла: `index-suOkjpcl.js` 283.90 kB (gzip 90.75 kB), `TariffProfilesPage` 15.78 kB,
`TariffEditorPage` 28.93 kB, `TariffProfilesProvider` 103.82 kB, `dist/index.cjs` 924.4 kB (без изменений).
Рост основного чанка на ~1.7 kB относительно CP-02 — из-за guard'а, установленного при загрузке модуля.

## 6. Ограничения (фактические)

1. **Браузер — Chromium 153 на linux-x64 (headless new), не реальное устройство.** Мобильные viewport,
   DPR 2 и touch-эмуляция настоящие, но iOS Safari/Android Chrome не проверялись. Специфика iOS
   (поведение клавиатуры, `env(safe-area-inset-bottom)`, авто-зум, «резина» при overscroll) остаётся
   непроверенной; защита от авто-зума (`text-base` + `maximum-scale=1`) заложена в разметке.
2. **Google Fonts недоступны в среде** (внешняя сеть заблокирована), поэтому скриншоты и измерение
   ширин выполнены с fallback-шрифтами. С подключёнными Inter/Manrope метрики текста могут отличаться;
   остаточный риск по обрезанию подписей сохраняется, но wireframe-структура и правила переноса
   проверены.
3. Проверен только светлый режим: `prefers-color-scheme` в контейнере — light; тёмная тема
   использует те же токены, но визуально не подтверждена.
4. Текст `beforeunload`-диалога задаёт браузер (в Chromium он пустой) — проверяется сам факт диалога
   и то, что отказ сохраняет черновик.
5. IndexedDB — настоящий, но сценарии квоты/вытеснения хранилища, приватного режима и multi-tab
   `onblocked` не воспроизводились; недоступность IndexedDB по-прежнему покрыта только unit-тестами
   (`createMemoryStore`).
6. Проверки выполнялись на пустом профиле/шаблоне; большие пользовательские профили (десятки позиций)
   и импорт JSON через файловый диалог визуально не проверялись (импорт покрыт unit-тестами).
7. Аудит размера целей и hit-test охватывает область `main` и открытый диалог; sticky-header и футер
   проверялись на прокрутку и перекрытие, но не на размер каждой иконки.
8. Страницы калькулятора/заявок/настроек визуально не перепроверялись — их API-регрессия подтверждена
   живым запросом, код этих страниц не менялся.
9. Harness (`qa-harness.mjs`) — evidence-инструмент: он не входит в сборку, не импортируется
   приложением и не запускается в CI (CI в репозитории отсутствует).

## 7. Deep-change и границы

- Deep-change: **нет**. Роутинг Wouter сохранён, публичные контракты, API, SQLite-схема и security
  boundary не менялись; новых зависимостей, сервисов и инфраструктуры нет.
- Изменения строго в границах CP-02A: мобильный редактор тарифов, защита черновика, диагностика
  повреждённых записей, мобильная вёрстка.
- Merge и deploy не выполнялись. DEV-CP-03 не начат.
- Артефакты предыдущего прогона (`97c3408`) не удалялись; его утверждения о R-1 скорректированы в §3 (D-1).
- CI-коммиты `27e18c6`/`0ede19e` принадлежат ветке PR #1 и не менялись; конфликтов при rebase не было.

## 8. Итоговые идентификаторы

- Repository: `Murkin1980/mebel-kalkulator2`
- PR #1: OPEN, без merge — https://github.com/Murkin1980/mebel-kalkulator2/pull/1
- Baseline (head PR #1): `0ede19e9a2a82c8c33c6e5e95c8f2e5ca0945563`
- Коммиты checkpoint: `3049de0` (guard), `f0fcda8` (mobile layout/touch), `25a01da` (browser evidence),
  `212d803` (этот отчёт); финальный HEAD — в отчёте сессии
- Branch: `arena/fb53f410-mebel-kalkulator2` (фиксирована средой; head PR #1 указывает на
  `arena/8e093f08-mebel-kalkulator2`, поэтому изменения этого checkpoint лежат в ветке сессии)
- Evidence: `evidence/dev-cp-02a/browser/` (48 PNG + 3 JSON-экспорта + `qa-report.json` + `dialogs.json`)

## 9. Следующее авторизованное действие

1. Review PR #1 (CP-01 + CP-02 + CP-02A) без merge.
2. Ручной проход на реальных iOS Safari / Android Chrome (клавиатура, safe-area, тёмная тема) —
   единственное, что эмуляция не заменяет.
3. Подтверждение владельцем цен на шкафы, камень, доп. изделия и правил округления (остаётся
   бизнес-вопросом, не дефектом).
4. Отдельный checkpoint на подключение редактора к рабочему калькулятору / PWA-контур — **не начат**.

STOP.
