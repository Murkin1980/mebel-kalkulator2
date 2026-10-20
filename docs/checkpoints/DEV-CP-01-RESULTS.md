# DEV-CP-01 — Salamat Calc: Pricing Engine & Editable Tariff Foundation

RESULT: **PASS**
Дата: 2026-10-20
MPE decision: `EXTEND_EXISTING`
Режим: SAFE / ADDITIVE ONLY
Merge: **не выполнялся** (запрещено)
Deploy: **не выполнялся** (запрещено)

## 1. Идентификация

| | |
|---|---|
| Repository | `Murkin1980/mebel-kalkulator2` |
| Base | `main` @ `350730cd42057d1f9da867f1bfe777ccad49a458` |
| Working branch | `arena/8e093f08-mebel-kalkulator2` |
| Commit (код, тесты, архитектура) | `51e68c2f0766fe69a9fa87003e9b6121dbf59d55` |
| PR | https://github.com/Murkin1980/mebel-kalkulator2/pull/1 (без merge) |
| Environment | Node v22.22.3, npm 10.9.8 |

> Отклонение от брифа: ветка `arena/dev-cp-01-salamat-calc-foundation` не создавалась.
> Сессия жёстко привязана к `arena/8e093f08-mebel-kalkulator2`; переключение и создание
> других ветвей запрещено. Работа выполнена в этой ветке, PR открыт из неё.

## 2. Governance (Phase 0)

Прочитано до изменений:

- `AGENTS.md`
- `docs/governance/SCOPE-CHANGE-CONTROL.md`
- `package.json`
- `shared/schema.ts`
- `server/routes.ts`
- `server/storage.ts`
- `client/src/pages/CalculatorPage.tsx`
- `client/src/pages/AdminPage.tsx`

Вывод по New Idea Filter: `EXTEND_EXISTING` — новый независимый модуль добавлен внутри
существующего репозитория; параллельный сервис, репозиторий и инфраструктура не создавались.

### Baseline до изменений (commit `350730c`)

| Проверка | Команда | Результат |
|---|---|---|
| Typecheck | `npm run check` (`tsc`) | **PASS**, exit 0 |
| Build | `npm run build` | **PASS**, exit 0; клиентский бандл `index-D4mB1RyU.js` 279.12 kB, сервер `dist/index.cjs` 924.4 kB |
| Tests | — | тестового скрипта и тестовых файлов в репозитории **не было** |

Замечания baseline: `vitest`/`jest` отсутствуют, новых тестовых библиотек не добавлялось;
использован стандартный `node:test` + уже установленный `tsx`.

## 3. Что изменено (аддитивно)

Новые файлы:

| Файл | Назначение |
|---|---|
| `shared/pricing/errors.ts` | Типизированные ошибки движка (`INVALID_REQUEST`, `INVALID_PROFILE`, `PRICE_NOT_CONFIRMED`, `DIMENSIONS_REQUIRED`, `INCLUDED_SERVICE_DOUBLE_CHARGE`, `TARIFF_NOT_FOUND`, `EXTRA_NOT_FOUND`) |
| `shared/pricing/schema.ts` | Версионируемая Zod-схема тарифного профиля, валидация, сериализация/десериализация JSON |
| `shared/pricing/engine.ts` | Чистый движок `calculatePrice(profile, request)`: `AREA`, `LINEAR`, `UNIT`, `COST_PLUS` |
| `shared/pricing/profiles/salamat-mebel.ts` | Начальный профиль Salamat Mebel v1 |
| `shared/pricing/index.ts` | Публичная поверхность модуля |
| `shared/pricing/tests/fixtures.ts` | Синтетические тестовые профили (не бизнес-цены) |
| `shared/pricing/tests/engine.test.ts` | 34 теста движка |
| `shared/pricing/tests/profile.test.ts` | 14 тестов схемы и профиля Salamat Mebel |
| `docs/architecture/PWA-ARCHITECTURE.md` | Спецификация целевой PWA-архитектуры (без реализации) |

Изменённые файлы:

| Файл | Изменение |
|---|---|
| `package.json` | добавлен скрипт `test` (`node --import tsx --test …`), округление newline в конце файла |
| `.gitignore` | новый файл: `node_modules/`, `dist/`, `*.db` — чтобы артефакты сборки не попадали в коммит |

Не изменялись: `shared/schema.ts`, `server/*`, `client/*`, `vite.config.ts`, `tsconfig.json`,
SQLite-схема, таблица `settings`, действующий `/api/calculate`.

## 4. Phase 1 — Pricing Engine

`shared/pricing/engine.ts`, функция `calculatePrice` — чистая функция:

- нет сети, часов, случайности, `eval` и исполнения пользовательского кода;
- вход: валидированный профиль + запрос; выход: детерминированный результат;
- размеры — только миллиметры (`dimensionUnit: "mm"`), деньги — только KZT, точность 1 тиын
  (целочисленная арифметика в тиынах, без накопления float-погрешности);

| Метод | Формула | Единица тарифа |
|---|---|---|
| `AREA` | (ширина мм / 1000) × (высота мм / 1000) × цена за м² × количество | `KZT_PER_M2` |
| `LINEAR` | (длина мм / 1000) × цена за пог. м × количество | `KZT_PER_LINEAR_M` |
| `UNIT` | количество × цена за единицу | `KZT_PER_UNIT` |
| `COST_PLUS` | себестоимость × (1 + наценка / 100) × количество | `KZT_PER_UNIT` (цена выводится из себестоимости) |

Реализовано:

- проверка входных данных (Zod + строгие объекты, запрет лишних ключей, положительные размеры/количество);
- настраиваемое округление итога: `NONE` / `NEAREST` / `UP` / `DOWN` + шаг в KZT; профиль задаёт
  правило по умолчанию, запрос может переопределить его для конкретного расчёта;
- дополнительные позиции (`extras`) с собственными методом, ценой, количеством и размерами;
- запрет двойного начисления: если доп. позиция ссылается на услугу (`coversServiceId`),
  которая уже включена в профиль или в выбранный тариф, расчёт отклоняется с кодом
  `INCLUDED_SERVICE_DOUBLE_CHARGE`;
- в результат попадают `includedServices` выбранного тарифа, чтобы клиент не добавлял их повторно;
- в результат фиксируются `profileId`, `profileVersion`, `schemaVersion`, `profileUpdatedAt`.

Движок **не подключён** к действующему API и UI.

## 5. Phase 2 — Editable Tariff Schema

`shared/pricing/schema.ts` (Zod, уже установленный в проекте):

Поля профиля: `profileId`, `name`, `schemaVersion`, `version`, `currency`, `categories`,
`calculationMethod`, `tariffs`, `extras`, `includedServices`, `roundingRules`, `updatedAt`, `notes`.

Возможности:

- валидация через Zod, включая семантические проверки (`superRefine`);
- несколько независимых профилей: движок принимает профиль аргументом, глобального реестра нет;
- сериализация: `serializeProfile` → JSON, `deserializeProfile` → валидированный профиль;
- запрет отрицательных значений цен, себестоимости и наценки;
- запрет некорректных единиц: единица обязана соответствовать методу (`AREA` → `KZT_PER_M2` и т. д.);
- `COST_PLUS` требует `unitCostKzt` и `markupPercent`, запрещает заданную вручную `priceKzt`;
- запрет «подтверждённой» позиции без цены и наоборот;
- уникальность id, существование `categoryId`, `includesServices ⊆ includedServices`;
- `schemaVersion` фиксирован (`1`), `version` — версия содержимого профиля;
- запрет неизвестных ключей (защита от опечаток при импорте).

SQLite-схема и таблица `settings` не изменялись. Полноценный UI-редактор тарифов в CP-01 не делался.

## 6. Phase 3 — Профиль Salamat Mebel

`shared/pricing/profiles/salamat-mebel.ts`, `profileId: "salamat-mebel"`, `version: 1`.

Подтверждённые тарифы (кухни, ₸/пог. м, метод `LINEAR`):

| tariffId | Цена |
|---|---|
| `kitchen-ldsp-russia` | 159 500 |
| `kitchen-ldsp-egger` | 205 000 |
| `kitchen-mdf-film` | 247 500 |
| `kitchen-mdf-paint` | 319 000 |

Все четыре позиции помечены `isConfirmed: true`, `includesServices: ["hardware", "manufacturing", "installation"]`.

Включённые услуги (`includedServices`): средняя фурнитура, изготовление, монтаж — отдельно
не начисляются (движок это блокирует).

### Evidence: чего не хватает

В репозитории отсутствует утверждённый прайс на шкафы, искусственный камень и дополнительные
изделия (`docs/` содержит только governance-документ). Поэтому цены **не придумывались**:

| tariffId | Категория | `priceKzt` | `isConfirmed` |
|---|---|---|---|
| `wardrobe-ldsp-russia` | wardrobe | `null` | `false` |
| `wardrobe-ldsp-egger` | wardrobe | `null` | `false` |
| `wardrobe-mdf-film` | wardrobe | `null` | `false` |
| `wardrobe-mdf-paint` | wardrobe | `null` | `false` |
| `stone-countertop` | artificial-stone | `null` | `false` |
| `additional-drawer` | additional-products | `null` | `false` |
| `additional-mirror-door` | additional-products | `null` | `false` |

- Демонстрационные значения прежнего калькулятора (ящик 4 500 ₸, зеркальная дверь 18 000 ₸,
  материалы 8 500 / 12 000 / 15 000 / 28 000 ₸/м²) **не использованы**; это зафиксировано в
  `notes` позиций и проверяется тестом `never reuses demo prices from the previous calculator`.
- Попытка расчёта незаполненной позиции возвращает `PRICE_NOT_CONFIRMED`, а не «0 ₸».
- Метод расчёта для шкафов (`LINEAR`) — предположение, помечено в `notes` как требующее подтверждения.
- Правила округления Salamat Mebel не подтверждены; по умолчанию `NEAREST` / 1 ₸ (нейтральное
  значение), зафиксировано в `notes` профиля.
- `extras: []`: дополнительные изделия вынесены в отдельные тарифные позиции; неподтверждённые
  доплаты не добавлялись.

## 7. Phase 4 — PWA Architecture

`docs/architecture/PWA-ARCHITECTURE.md`: React + TypeScript (существующий стек), клиентские
расчёты на `shared/pricing`, IndexedDB для тарифов и истории, Service Worker, Web App Manifest,
резервное копирование JSON, отдельный Cloudflare-деплой `calc.salamat-mebel.kz`, границы миграции
и инварианты. Service Worker, манифест, инфраструктура и облачная БД **не создавались**;
монорепозиторий не вводился.

## 8. Phase 5 — Верификация

### Тесты

`npm test` → `node --import tsx --test shared/pricing/tests/engine.test.ts shared/pricing/tests/profile.test.ts`

```
# tests 48
# suites 10
# pass 48
# fail 0
```

Покрытие требований:

| № | Требование | Тесты |
|---|---|---|
| 1 | AREA, LINEAR, UNIT, COST_PLUS | `pricing methods` (5 тестов) |
| 2 | мм → м | `millimetre to metre conversion` (2) |
| 3 | Настраиваемое округление | `configurable rounding` (4) |
| 4 | Дополнительные позиции | `extra positions` (3) |
| 5 | Нет двойного начисления включённых услуг | `no double charge for included services` (3) |
| 6 | Независимость профилей | `profile isolation` (3), `is isolated: editing a copy…` |
| 7 | Отклонение недопустимых конфигураций | `input validation` (5), `tariff profile schema` (11) |
| 8 | Воспроизводимость по версии тарифа | `determinism and versioning` (4) + повторный расчёт после JSON-экспорта |
| 9 | Отсутствие регрессий | `npm run check`, `npm run build`, неизменность затронутых файлов |

Дополнительно проверено: тестовые файлы исключены из `tsconfig.json`, поэтому они отдельно
проверены компилятором:

```
npx tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler \
  --types node --skipLibCheck shared/pricing/tests/engine.test.ts shared/pricing/tests/profile.test.ts
→ exit 0
```

### Обязательные команды проекта

| Проверка | Команда | Результат |
|---|---|---|
| Tests | `npm test` | **PASS** 48/48 |
| Typecheck | `npm run check` (`tsc`) | **PASS**, exit 0 |
| Build | `npm run build` | **PASS**, exit 0; клиент `index-D4mB1RyU.js` 279.12 kB — **хэш совпадает с baseline**, сервер `dist/index.cjs` 924.4 kB |

Совпадение хэша клиентского бандла подтверждает, что UI и API не изменили поведения.

### Regression evidence

- `shared/pricing/*` не импортируется из `server/` и `client/`;
- `server/routes.ts`, `server/storage.ts`, `shared/schema.ts`, `client/src/pages/*` не менялись;
- действующий `/api/calculate` и таблица `settings` не затронуты;
- новых зависимостей нет (`package-lock.json` не изменён).

## 9. Deep-change

Не обнаружен. Все работы выполнены аддитивно, без изменения архитектуры, публичных контрактов,
схемы данных и без новой инфраструктуры.

## 10. Известные ограничения

1. Движок не подключён к API/UI — это требование CP-01, а не дефект.
2. Шкафы, искусственный камень и дополнительные изделия без подтверждённых цен (`null`) —
   расчёт по ним невозможен до внесения цен владельцем.
3. Метод расчёта шкафов и правила округления Salamat Mebel требуют подтверждения.
4. Округление применяется к итогу заказа (строки хранятся с точностью 1 тиын); построчное
   округление не реализовано.
5. Нет UI-редактора тарифов, IndexedDB, Service Worker, манифеста и деплоя — следующий checkpoint.
6. Ветка названа по идентификатору сессии, а не `arena/dev-cp-01-salamat-calc-foundation`.
7. `COST_PLUS` в профиле Salamat Mebel не используется: подтверждённых данных о себестоимости нет.

## 11. Следующее авторизованное действие

Ожидается решение владельца:

- review PR #1 без merge;
- подтверждение цен на шкафы, камень, дополнительные изделия, метода их расчёта и правил округления;
- отдельный checkpoint на редактор тарифов / подключение движка (CP-02) — **не начат**.

STOP.
