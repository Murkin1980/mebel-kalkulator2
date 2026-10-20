# DEV-CP-02 — Salamat Calc: Mobile Tariff Editor

RESULT: **PASS** (с зафиксированным ограничением: реальные браузерные проверки в среде не выполнялись)
Дата: 2026-10-20
MPE decision: `EXTEND_EXISTING`
Режим: CHECKPOINT-ONLY
Merge: **не выполнялся**
Deploy: **не выполнялся**

## 1. Идентификация

| | |
|---|---|
| Repository | `Murkin1980/mebel-kalkulator2` |
| Base | `arena/8e093f08-mebel-kalkulator2` @ `526b700` (HEAD PR #1, включая `fix(pricing): use area method for Salamat wardrobe placeholders`) |
| Working branch | `arena/8e093f08-mebel-kalkulator2` |
| PR | https://github.com/Murkin1980/mebel-kalkulator2/pull/1 — тот же PR, новые коммиты CP-02 добавлены в него |
| Environment | Node v22.22.3, npm 10.9.8 |

**Отклонения от брифа (обязательные к учёту):**

1. **Отдельная ветка не создавалась.** Сессия жёстко привязана к `arena/8e093f08-mebel-kalkulator2`; создание/переключение ветвей запрещено. Работа выполнена в этой ветке поверх актуального HEAD PR #1.
2. **Отдельный PR не открывался.** GitHub не позволяет иметь два открытых PR с одинаковой парой head/base. Коммиты CP-02 добавлены в существующий PR #1 (без merge). PR обновлён описанием CP-01 + CP-02.

## 2. Phase 0 — Governance & baseline

Прочитано: `AGENTS.md`, `docs/governance/SCOPE-CHANGE-CONTROL.md`, `docs/architecture/PWA-ARCHITECTURE.md`,
`docs/checkpoints/DEV-CP-01-RESULTS.md`, `shared/pricing/schema.ts`, `shared/pricing/engine.ts`,
`shared/pricing/profiles/salamat-mebel.ts`, `client/src/pages/AdminPage.tsx`, `client/src/pages/CalculatorPage.tsx`.

Состояние PR #1 проверено: `git fetch` → HEAD `526b700`, включая корректировку метода шкафов на `AREA`
(`priceKzt: null`, метод подтверждён, цена — нет). Движок DEV-CP-01 переиспользован без переписывания.

### Baseline (до изменений CP-02, HEAD `526b700`)

| Проверка | Команда | Результат |
|---|---|---|
| Tests | `npm test` | **PASS** 48/48 |
| Typecheck | `npm run check` | **PASS**, exit 0 |
| Build | `npm run build` | **PASS**, exit 0; client `index-D4mB1RyU.js` 279.12 kB, server `dist/index.cjs` 924.4 kB |

## 3. Что реализовано

### Phase 1 — Управление профилями (`/tariffs`)

- список профилей: неизменяемый шаблон Salamat Mebel + пользовательские профили;
- создание профиля из шаблона (диалог с названием);
- копирование любого профиля, включая шаблон (`Salamat Mebel (копия)`);
- переименование (id не меняется, версия увеличивается);
- выбор активного профиля (сохраняется в IndexedDB, переживает перезагрузку);
- удаление с подтверждением в диалоге;
- шаблон всегда доступен, потому что хранится в коде: запись/удаление его id отклоняется слоем хранения,
  а сохраняемая копия с его id при чтении игнорируется — «восстановление шаблона» обеспечено конструктивно;
- для профиля хранятся `profileId`, `name`, `schemaVersion`, `version`, `updatedAt`, тарифы, доп. позиции,
  метод расчёта, правила округления;
- конфликт названий не приводит к перезаписи: id генерируется из названия с суффиксом, при совпадении
  названия к названию добавляется номер.

### Phase 2 — Редактор тарифов (`/tariffs/:profileId`)

Экран «Мои тарифы»:
- категории берутся из профиля (Кухни, Шкафы, Искусственный камень, Дополнительные изделия), доступно
  добавление собственных категорий (без изменения схемы — `categories[]` уже есть в схеме CP-01);
- поля тарифа: название, категория, метод, единица, цена, подтверждённость, включённые услуги, примечание;
- методы `AREA` (₸/м²), `LINEAR` (₸/пог. м), `UNIT` (₸/шт.), `COST_PLUS` (себестоимость + наценка);
- единица измерения выставляется автоматически при выборе метода (`UNIT_BY_METHOD`);
- для `COST_PLUS` показываются только себестоимость и наценка; фиксированная цена и поле подтверждения
  скрыты, а схема отклоняет одновременное задание цены и COST_PLUS;
- отрицательные значения, `NaN` и `Infinity` не проходят ни через поле ввода (`NumberField` → `null` + сообщение),
  ни через Zod-схему (при сохранении и при импорте);
- неподтверждённая цена отображается как «Цена не задана» (проверяется тестом и SSR-smoke-тестом), а расчёт
  такой позиции возвращает `PRICE_NOT_CONFIRMED`;
- дополнительные позиции: список, добавление, редактирование, удаление;
- инвариант `INCLUDED_SERVICE_DOUBLE_CHARGE` не изменялся; в редакторе есть пояснение, в тестах — проверка.

### Phase 3 — Локальное хранение

`client/src/lib/tariff-store.ts`:
- IndexedDB `salamat-calc` (версия 1), хранилища `profiles` (keyPath `profileId`) и `meta` (активный профиль);
- минимальная обёртка над встроенным API, без новых зависимостей и без облачной БД;
- запись профиля и активного id — одна `readwrite`-транзакция (атомарность);
- валидация Zod до записи и после чтения; нечитаемые записи пропускаются с предупреждением, а не перезаписываются;
- запрет записи/удаления шаблона на уровне хранилища;
- при недоступности IndexedDB — переход в in-memory режим и явное предупреждение «изменения не сохранятся
  после перезагрузки» (данные не теряются молча);
- ошибки сохранения показываются пользователю (`save-error`, баннер провайдера).

Время (`updatedAt`) и инкремент `version` выполняются в слое редактирования/хранения (`touchProfile`),
внутри `calculatePrice` времени нет. Миграция SQLite не выполнялась.

### Phase 4 — Импорт / экспорт

- экспорт одного профиля в JSON (`Blob` + `download`, имя `<profileId>-v<version>.json`);
- импорт через выбор файла, предварительный просмотр (название, id, версия, схема, число позиций);
- проверка `schemaVersion` до схемы, затем полная Zod-валидация;
- fail-closed: при любой ошибке сохранённые профили не меняются, показывается сообщение и список проблем;
- при конфликте `profileId` создаётся копия с новым id (баннер в диалоге предпросмотра), существующий профиль не перезаписывается;
- в экспорт попадают только данные профиля (тест проверяет отсутствие `clientPhone`, `leads`, `settings`, `sheets_webhook`).

### Phase 5 — Mobile UX

- существующий стек: React 18, TypeScript, Tailwind, Radix (dialog), wouter;
- маршруты preview: `/#/tariffs` и `/#/tariffs/:profileId`, лениво загружаемые (`React.lazy`), поэтому
  основной бандл калькулятора не раздувается;
- в навигацию добавлен пункт «Тарифы»; на ширине < 480 px скрывается текст логотипа, чтобы 4 иконки и
  переключатель темы помещались на 320 px;
- интерактивные элементы высотой ≥ 44 px (`min-h-11`), текстовые поля с `inputMode` и `text-base`
  (защита от авто-зума на iOS);
- явные единицы измерения рядом с полями;
- индикатор несохранённых изменений, `beforeunload`-предупреждение и подтверждение выхода по кнопке «Назад»;
- подтверждение удаления профиля/тарифа/доп. позиции;
- светлая тема поддерживается существующими токенами; собственный дизайн-фреймворк не создавался.

### Phase 6 — Предпросмотр цены

`TariffPreview` внутри редактора: выбор тарифа, поля по методу (мм / шт.), доп. позиции, вызов
`calculatePrice(profile, request)` в браузере по **несохранённому валидному черновику**, вывод применённого
тарифа, метода, измеренной величины, исходной стоимости, доплат, округления и итога. Черновик не сохраняется
автоматически, `/api/calculate` не используется.

## 4. Изменённые и добавленные файлы

Добавлены:

```
client/src/lib/tariff-meta.ts                 подписи методов/единиц, форматирование, транслитерация id
client/src/lib/tariff-profiles.ts             операции над профилями (копия, переименование, версия, импорт)
client/src/lib/tariff-store.ts                IndexedDB + in-memory хранилище
client/src/lib/tests/tariff-profiles.test.ts  26 тестов доменных операций
client/src/lib/tests/tariff-store.test.ts     9 тестов хранилища
client/src/lib/tests/pages-smoke.test.tsx     4 SSR-smoke теста страниц
client/src/lib/tests/fake-indexeddb.ts        тестовый in-memory IndexedDB (не зависимость)
client/src/components/tariffs/TariffProfilesProvider.tsx  состояние профилей + HOC
client/src/components/tariffs/TariffForm.tsx  форма тарифа/доп. позиции
client/src/components/tariffs/NumberField.tsx числовой ввод без NaN/Infinity
client/src/components/tariffs/TariffPreview.tsx  блок «Проверить тариф»
client/src/pages/TariffProfilesPage.tsx       экран «Профили»
client/src/pages/TariffEditorPage.tsx         экран «Мои тарифы»
tsconfig.test.json                            jsx: react-jsx для node --test (нужен tsx)
```

Изменены:

| Файл | Изменение |
|---|---|
| `client/src/App.tsx` | два ленивых preview-маршрута `/tariffs`, `/tariffs/:profileId` |
| `client/src/components/Layout.tsx` | пункт навигации «Тарифы», адаптив заголовка, активное состояние для вложенных маршрутов |
| `package.json` | расширен скрипт `test` (добавлены тесты CP-02, `TSX_TSCONFIG_PATH=tsconfig.test.json`) |

Не изменялись: `server/*`, `shared/schema.ts`, `shared/pricing/*` (движок CP-01 переиспользован как есть),
SQLite-схема, `/api/calculate`, `/api/settings`, `/api/leads`, страницы калькулятора, админки и заявок.
Новых зависимостей нет (`package-lock.json` не изменён).

## 5. Верификация

### Тесты

`npm test`:

```
# tests 87
# suites 18
# pass 87
# fail 0
```

Распределение: `engine.test.ts` 29, `profile.test.ts` 19 (CP-01), `tariff-profiles.test.ts` 26,
`tariff-store.test.ts` 9, `pages-smoke.test.tsx` 4 (CP-02).

Покрытие требований Phase 7:

| № | Требование | Где проверено |
|---|---|---|
| 1 | создание, копирование, переименование, удаление профилей | `tariff-profiles.test.ts` → `profile management`, `tariff-store.test.ts` → `deletes a profile…` |
| 2 | изоляция профилей | `keeps profiles isolated from each other`, `is isolated: editing a copy…` (CP-01) |
| 3 | изменение цены увеличивает версию | `bumps version and updatedAt on every saved change`, `updates a profile atomically` |
| 4 | AREA / LINEAR / UNIT / COST_PLUS | `calculates every method from an edited profile` + suite CP-01 |
| 5 | сохранение и восстановление через IndexedDB | `tariff-store.test.ts` (fake IndexedDB: persist, reload, active, delete, atomic) |
| 6 | стандартный профиль не меняется | `never mutates the template`, `refuses to store or delete the template`, `refuses to write or delete the template profile` |
| 7 | некорректные значения тарифов | `rejects invalid prices produced by the editor`, `rejects invalid data before writing`, `rejects negative prices and markups` (CP-01) |
| 8 | повреждённый JSON | `fails closed on corrupted JSON`, `rejects an unsupported schema version` |
| 9 | конфликт `profileId` | `creates a copy on profileId conflict instead of overwriting` |
| 10 | запрет двойного начисления | `keeps the double-charge guard for included services` + CP-01 |
| 11 | предпросмотр без сервера | `calculates locally and performs no network request` (fetch-шпион: 0 вызовов) |
| 12 | отсутствие регрессий калькулятора | сборка + неизменность затронутых файлов + живой вызов API (ниже) |

### Обязательные команды

| Проверка | Команда | Результат |
|---|---|---|
| Tests | `npm test` | **PASS** 87/87 |
| Typecheck | `npm run check` (`tsc`) | **PASS**, exit 0 |
| Build | `npm run build` | **PASS**, exit 0 |

Размеры бандла после изменений:

```
dist/public/assets/index-BMqlgjCj.js                   282.16 kB │ gzip: 90.08 kB   (было 279.12 kB)
dist/public/assets/TariffProfilesPage-kZdsnCk1.js       13.51 kB │ gzip:  4.21 kB
dist/public/assets/TariffEditorPage-DycNORh0.js         29.01 kB │ gzip:  8.33 kB
dist/public/assets/TariffProfilesProvider-BxSXIJXl.js  103.28 kB │ gzip: 29.02 kB
dist/index.cjs                                         924.4 kB  (без изменений)
```

Рост основного чанка на ~3 kB — пункт навигации и два ленивых маршрута. Движок и Zod вынесены в
ленивый чанк `TariffProfilesProvider`, который не загружается на маршруте калькулятора.

### Regression verification (живой сервер)

Dev-сервер поднят, приложение отвечает; поведение действующего API проверено вручную:

```
GET  /api/calculate?        → 200 (страница приложения)
GET  /api/settings          → 200, тот же набор из 17 настроек (mat_ldsp=8500, markup_kitchen=30, …)
POST /api/calculate         → {"basePrice":56100,"markupPercent":30,"finalPrice":72930,"deadline":21,"area":6.6}
```

Ответ `/api/calculate` совпадает с формулой прежнего калькулятора (6.6 м² × 8500 × 1.0 = 56 100; +30 % = 72 930).
Модули `/src/App.tsx`, `/src/pages/TariffProfilesPage.tsx`, `/src/pages/TariffEditorPage.tsx`,
`/src/components/tariffs/TariffForm.tsx` возвращают 200 от Vite (успешная трансформация).

### Mobile QA — ОГРАНИЧЕНИЕ

**Реальные браузерные проверки в этой среде не выполнялись, поэтому визуальные тесты НЕ считаются пройденными.**

Что предпринималось: `npx playwright install chromium` → загрузка с CDN Playwright заблокирована сетевой
политикой среды; получение Chromium из npm-пакета (`@sparticuz/chromium`) → бинарник требует системных
библиотек `libnspr4.so`, `libnss3.so`, `libnssutil3.so`, которых нет, а установка пакетов ОС недоступна.
Скриншоты не создавались.

Что проверено вместо этого:

- `client/src/lib/tests/pages-smoke.test.tsx` — SSR-рендер обеих страниц: экран профилей, шаблон,
  read-only редактор шаблона, «Цена не задана» (≥ 7 позиций), отсутствие кнопки сохранения у шаблона,
  сообщение «Профиль не найден»;
- статический разбор разметки на 320–430 px: отсутствие фиксированных ширин, `break-words` для длинных
  названий, `grid-cols-1` до 380 px для кнопок профиля, `min-h-11` у всех интерактивных элементов,
  скрытие текста логотипа ниже 480 px;
- успешная трансформация всех новых модулей dev-сервером Vite.

Требования «отсутствие горизонтальной прокрутки на 320/375/430 px», «размер элементов ≥ 44 px» и
«корректная работа клавиатуры смартфона» остаются **неподтверждёнными в реальном браузере** и вынесены
в Known limitations.

### Storage verification — ОГРАНИЧЕНИЕ

IndexedDB проверен на уровне кода через тестовый in-memory шим, реализующий используемый API
(open/upgrade, транзакции, get/getAll/put/delete) — без новой зависимости. Проверены: сохранение,
восстановление после «перезапуска», активный профиль (включая шаблон), обновление версии, удаление,
запрет шаблона, отказ при некорректных данных, недоступность IndexedDB. Проверка на реальном движке
браузера не выполнялась (см. выше).

## 6. Deep-change

Не обнаружен. Публичные контракты API, SQLite-схема, security boundary, архитектура и источник истины
не менялись; новых сервисов, репозиториев, облачных БД и зависимостей нет.

## 7. Known limitations

1. Визуальная проверка на 320/375/430 px и скриншоты не выполнены — в среде нет браузера (детали выше).
   Требуется ручной проход на устройстве/в DevTools перед следующим checkpoint.
2. IndexedDB протестирован шимом, а не реальным браузерным движком.
3. Шаблон Salamat Mebel по-прежнему содержит неподтверждённые цены (шкафы, камень, доп. изделия) — редактор
   позволяет внести их в копию, но исходные значения не выдумывались.
4. Правила округления Salamat Mebel (NEAREST / 1 ₸) остаются значением по умолчанию и требуют подтверждения.
5. Отдельные пункты навигации «Мои тарифы» и «Профили» не разделены: один пункт «Тарифы» ведёт на экран
   профилей, редактор открывается из него (в рамках одного preview-маршрута).
6. Инвариант «одна позиция — один метод» сохранён: тариф нельзя посчитать двумя способами одновременно.
7. Редактор не поддерживает переупорядочивание категорий/тарифов и drag-and-drop — вне объёма CP-02.
8. Ветка и PR общие с CP-01 (ограничение сессии), отдельный PR для CP-02 технически невозможен.
9. `tsconfig.test.json` нужен только для `node --test` (JSX runtime); на сборку приложения не влияет.
10. Экспорт формируется в браузере через `Blob`; в средах без DOM (SSR) не используется.

## 8. Следующее авторизованное действие

Ожидается решение владельца:

- review PR #1 (CP-01 + CP-02) без merge;
- ручная проверка мобильного UX на реальном устройстве/в браузере (320/375/430 px);
- подтверждение цен на шкафы, камень, дополнительные изделия и правил округления;
- отдельный checkpoint на подключение редактора к рабочему калькулятору / PWA-контур — **не начат**.

STOP.
