# DEV-CP-02A — SALAMAT CALC Stabilization & Mobile QA

RESULT: **PASS**
Дата: 2026-10-20
MPE decision: `EXTEND_EXISTING`
Режим: CORRECTIVE / MINIMAL DIFF
Merge: **не выполнялся**
Deploy: **не выполнялся**

## 1. Идентификация и baseline

| Поле | Значение |
|---|---|
| Repository | `Murkin1980/mebel-kalkulator2` |
| PR #1 | открыт: `https://github.com/Murkin1980/mebel-kalkulator2/pull/1` |
| PR #1 head branch | `arena/8e093f08-mebel-kalkulator2` |
| PR #1 head commit на старте сессии | `5b8684a13da3b6aa8b7cd46545b7dfe4e1d33f0e` |
| PR #1 head commit к концу сессии | `0ede19e9a2a82c8c33c6e5e95c8f2e5ca0945563` (+2 CI-коммита `27e18c6`/`0ede19e`: `scripts/browser-qa.mjs` + `.github/workflows/browser-qa.yml`, добавлены в head-ветку PR во время сессии; на локальную проверку не влияли) |
| Рабочая branch (фиксирована средой) | `arena/34f31b03-mebel-kalkulator2` |
| Baseline этой сессии | fast-forward рабочей ветки до PR head `5b8684a` |
| Implementation commits этой сессии | см. §8 |
| Node / npm | Node `v22.22.3`, npm `10.9.8` |

Рабочая ветка изначально находилась на `350730c`; актуальный head PR #1 (`5b8684a`) был получен через
`git fetch origin pull/1/head` и добавлен fast-forward-ом. Незакоммиченных изменений не было.

Сессия выполняется в режиме коррекции уже собранных R-1/R-2 (см. §2): реализация и unit-тесты
сохранены, обязательные команды проходили; итог предыдущего прохода был **PARTIAL** только из-за
недоступности реального браузера (Browser QA / Browser Storage QA — NOT VERIFIED). Задача этой
сессии — завершить именно реальную браузерную проверку и зафиксировать факты.

Установка зависимостей: `npm ci --ignore-scripts`, затем `npm rebuild better-sqlite3
--nodedir=/usr/local` (prebuilt-download TLS недоступен). `package-lock.json` и список зависимостей
проекта не изменялись.

## 2. Наследие прошлого прохода (без изменений)

- **R-1 — защита от потери черновика.** Wouter hash-router без блокировки переходов; добавлен
  совместимый hash-hook `client/src/lib/unsaved-navigation.ts` (guard для Link/навигации/Browser
  Back/Forward + существующий `beforeunload`), 4 unit-регрессии в `unsaved-navigation.test.ts`.
- **R-2 — повреждённые записи IndexedDB.** `ProfileStore.load()` возвращает `rejectedProfiles`
  (key + безопасная причина + raw в памяти), записи не удаляются, экран профилей показывает
  предупреждение и локальный экспорт оригинала; тесты в `tariff-store.test.ts`.

## 3. Найденные в этой сессии дефекты и исправления

Оба дефекта найдены реальным браузером (Chromium + Playwright), исправлены минимальным diff.

### R-3 — Browser Back/Forward обходил защиту несохранённых изменений (ДЕФЕКТ)

Наблюдение: при dirty-черновике кнопка «Назад» и меню показывали confirm, но **Browser Back/Forward
переходил без предупреждения** и уничтожал черновик.

Диагностика (страница инструментировалась через `addInitScript`: логи `addEventListener`,
`window.confirm`, `history.go`, прослушивание `hashchange`):

- Wouter (`use-hash-location.js`) подписывается на `hashchange` при первой React-рендер-подписке
  `useSyncExternalStore` и на **реальные**, и на свои синтетические события `dispatchEvent`;
- guard был установлен в `useEffect` — **позже** подписчика Wouter. На `window` обработчики
  выполняются в порядке регистрации (capture-фаза не даёт приоритет, т.к. target события — само
  `window`), поэтому при реальном `hashchange` от Back/Forward Wouter реагировал первым, React
  синхронно размонтировал редактор, и guard-слушатель снимался до вызова `confirm` (подтверждено
  логами: `confirm` не вызывался, `history.go` не вызывался, событие доходило до поздних
  слушателей);
- побочный эффект: при пересоздании guard-замыкания в `approvedRoute` (module-level) могла
  остаться «хвостовая» маршрутная метка.

Исправление (`client/src/lib/unsaved-navigation.ts`, минимальный diff):

- установка hash-guard **на уровне модуля** (при загрузке, до первого React-рендера и, значит, до
  подписки Wouter) — порядок регистрации детерминирован: guard всегда первый слушатель `hashchange`
  и может `stopImmediatePropagation()` до размонтирования редактора;
- `useEffect`-установка оставлена как fallback (флаг `hashListenerInstalled` исключает повтор);
- уточнён комментарий (capture-фаза не является механизмом приоритета).

### R-4 — маленькая зона нажатия чекбоксов «Включённые услуги» (ДЕФЕКТ)

Наблюдение (320/375/430 px): Radix-checkbox `16×16`, подпись без `min-h-11` — суммарная зона
нажатия `~177×20`, ниже минимума 24 px и ниже собственной конвенции интерфейса `min-h-11`.

Исправление (`client/src/components/tariffs/TariffForm.tsx`, 1 строка): подпись услуги получила
`flex min-h-11 flex-1 items-center` — зона нажатия стала `~239×44`; клик по подписи переключает
чекбокс (проверено реальным браузером: `aria-checked` меняется, label→button activation работает).

## 4. Реальная браузерная проверка (Mobile QA + Browser Storage QA)

**BROWSER_STORAGE_QA: VERIFIED (реальный IndexedDB)**
**MOBILE QA: VERIFIED (320 / 375 / 430 px)**

Движок: **реальный Chromium `153.0.8010.0`** (headless) под управлением **playwright-core 1.64.1**.
В контейнере нет системного браузера и доступа к Playwright/Chrome CDN; бинарник взят из npm-пакета
`@sparticuz/chromium` (сам Chromium внутри tarball), недостающие системные `libnspr4/libnss3/…`
подключены из архива `al2023.tar` того же пакета через `LD_LIBRARY_PATH`. Это настоящий
Chromium-рендеринг + настоящий IndexedDB, не статические/SSR-проверки.

Скрипт проверки (сохранён как воспроизводимое evidence):
`evidence/dev-cp-02a/browser-qa.mjs`; сводка — `evidence/dev-cp-02a/browser-qa-summary.md`.
Итог прогона: **103 проверки PASS, 0 FAIL** (список в сводке).

### 4.1 Вёрстка 320 / 375 / 430 px

| Сценарий | 320 | 375 | 430 |
|---|---|---|---|
| Профили (пустой список / с данными / диалог создания) | PASS | PASS | PASS |
| Редактор (параметры / форма тарифа / длинное имя / sticky-панель) | PASS | PASS | PASS |
| Нет горизонтальной прокрутки (`documentElement`/`body` ≤ viewport) | PASS | PASS | PASS |
| Нет обрезанных/вылезающих полей и элементов | PASS | PASS | PASS |
| Нет недоступных/слишком мелких (<24 px) контроллов | PASS | PASS | PASS |
| Реальные PNG-скриншоты | есть | есть | есть |

Замечание (не дефектируется): `theme-toggle` в шапке — `34×34` (существующий элемент вне тарифного
редактора; кликабелен, фиксируется как наблюдение).

### 4.2 Реальный IndexedDB (`salamat-calc`)

| Сценарий | Результат |
|---|---|
| Создание профиля (3 шт., по одному на каждую ширину) → редактор | PASS |
| Записи видны при прямом чтении `profiles` store из страницы | PASS (`["QA 320","QA 375","QA 430"]`) |
| Редактирование: новый тариф «QA кухня EGGER 18 мм», цена 55000, «Цена подтверждена» → «Сохранить» | PASS |
| Прямое чтение сохранённой записи из IndexedDB | PASS (`priceKzt=55000, isConfirmed=true`, version=2) |
| Полная перезагрузка → повторное открытие: имя, тариф, цена, подтверждение на месте | PASS |
| Выбор активного профиля → перезагрузка → бейдж «активный» сохранён (meta store) | PASS |
| Шаблон Salamat Mebel: read-only баннер, нет панели сохранения, «Создать копию и редактировать» | PASS |
| Повреждённые записи (`qa-broken-001/002` вставлены напрямую в store) | не участвуют в списке, показаны с ключами и причинами |
| Экспорт повреждённых записей | PASS: скачан `salamat-calc-rejected-profiles-v1` JSON с raw-записями (см. `rejected-export-sample.json`), только по нажатию, без сервера |
| Повреждённые записи не удаляются молча (после reload предупреждение остаётся) | PASS |

### 4.3 Навигация, несохранённые изменения, Back/Forward

| Сценарий | Результат |
|---|---|
| Кнопка «Назад» при dirty → confirm «Есть несохранённые изменения. Выйти без сохранения?» | PASS |
| Отмена → редактор и черновик сохранены (имя в поле не потеряно) | PASS |
| Browser Back при dirty → confirm; отмена → история восстановлена (`#/tariffs/:id` остался), черновик цел | PASS (после R-3) |
| Browser Back + подтверждение выхода → переход на список профилей | PASS |
| Browser Forward → редактор переоткрыт из хранилища (непройденный черновик сброшен — ожидаемо) | PASS |
| Меню/ссылки при dirty тоже под confirm; после «Сохранить» выход без второго confirm | PASS |
| `beforeunload` при перезагрузке с dirty-черновиком | PASS (диалог `beforeunload` реально срабатывает) |
| Чистый выход без dirty → confirm не показывается | PASS |

### 4.4 Скриншоты

`evidence/dev-cp-02a/browser/` — **28 реальных PNG** (Chromium, DPR=2, ширина 640/750/860 = 320/375/430 css-px),
включая: `profiles-empty-*`, `profiles-create-dialog-*`, `profiles-with-profiles-*`,
`profiles-active-375w`, `profiles-rejected-warning-*`, `editor-after-create-*`, `editor-profile-320w/430w`,
`editor-tariff-form-*`, `editor-saved-375w`, `editor-reopened-375w`, `editor-template-375w`,
`editor-dirty-save-bar-*`, `nav-confirm-stayed-*`; плюс `rejected-export-sample.json`.
Ни одного фиктивного изображения.

## 5. Обязательные проверки после исправлений

| Проверка | Результат |
|---|---|
| `npm test` | PASS — **93/93**, 19 suites |
| `npm run check` | PASS |
| `npm run build` | PASS; client `index.js` 284.01 kB (gzip 90.77 kB) + lazy chunks (TariffProfilesProvider 103.82 kB и др.), server `dist/index.cjs` 924.4 kB; прежние warnings по CSS `@import`/Browserslist |
| Dev server | `GET /` → 200, `GET /api/settings` → 200 |
| Regression `/api/calculate` | `POST` (kitchen, 220×300×60, mat_ldsp, hw_econom) → `{"basePrice":56100,"markupPercent":30,"finalPrice":72930,"deadline":21,"area":6.6}` — совпадает с прежним fixture |
| API / SQLite diff | отсутствует; `server/*`, `shared/pricing/*`, `shared/schema.ts`, миграции не изменялись |
| Зависимости | без изменений (`package-lock.json` не тронут); QA-инструменты установлены вне репозитория |

## 6. Изменённые файлы этой сессии

| Файл | Изменение |
|---|---|
| `client/src/lib/unsaved-navigation.ts` | R-3: установка hash-guard на уровне модуля (первый слушатель `hashchange`), комментарий |
| `client/src/components/tariffs/TariffForm.tsx` | R-4: зона нажатия подписи услуги `min-h-11` |
| `docs/checkpoints/DEV-CP-02A-RESULTS.md` | настоящий отчёт |
| `evidence/dev-cp-02a/browser/*` | 28 реальных PNG + `rejected-export-sample.json` |
| `evidence/dev-cp-02a/browser-qa.mjs` | воспроизводимый скрипт браузерной проверки |
| `evidence/dev-cp-02a/browser-qa-summary.md` | журнал 103 проверок, диалогов и скриншотов |

Runtime API, схемы БД, движок `shared/pricing/*` не изменялись. Deep-change: **нет**.

## 7. Ограничения

- Браузер — headless Chromium 153 из npm-бандла (`@sparticuz/chromium`) под playwright-core, а не
  штатный Playwright-Chromium (CDN браузеров недоступен политикой сети контейнера). Поведение
  реальное (Blink/IndexedDB/History API); отличия от канонической сборки Playwright теоретически
  возможны, практических расхождений в прогоне не замечено.
- Системная кнопка `theme-toggle` в шапке — `34×34` (меньше конвенции `min-h-11`); элемент
  существовал до CP-02 и не блокирует работу; зафиксировано как наблюдение, не исправлялось.
- Нативные confirm/beforeunload не скриншотятся (это chrome UI) — их фактические сообщения
  зафиксированы в `browser-qa-summary.md`.
- Шкафы, камень и доп. изделия по-прежнему без подтверждённых цен (product-статус, не дефект QA).
- Отдельный PR для CP-02A не создавался: PR #1 остаётся единственным (head-ветка
  `arena/8e093f08`). Коммиты этой сессии сохранены в рабочей ветке
  `arena/34f31b03-mebel-kalkulator2` (содержит `5b8684a` как предка). Переписывание/пуш в ветку
  PR #1 запрещены средой. В head-ветку PR во время сессии добавлены CI-коммиты
  (`scripts/browser-qa.mjs`, GitHub Actions workflow для Playwright QA на раннере GitHub) —
  этот CI здесь не запускался; локальное evidence получено скриптом
  `evidence/dev-cp-02a/browser-qa.mjs` на реальном Chromium контейнера.
- Preview dev server — не deploy; production deployment, merge, DEV-CP-03 не выполнялись.

## 8. Итоговые идентификаторы

- PR #1 head: `5b8684a13da3b6aa8b7cd46545b7dfe4e1d33f0e` (без merge)
- Рабочая branch: `arena/34f31b03-mebel-kalkulator2` (fast-forward `5b8684a` + коммиты сессии;
  финальный HEAD — в отчёте сессии)
- Evidence: `evidence/dev-cp-02a/browser/` (28 PNG + JSON), `evidence/dev-cp-02a/browser-qa.mjs`,
  `evidence/dev-cp-02a/browser-qa-summary.md`

## 9. Следующее авторизованное действие

Mobile QA и Browser Storage QA пройдены реальным браузером; R-1/R-2 подтверждены вживую (после
исправления R-3), R-4 исправлен. Итог — **PASS**. Merge/deploy — только по отдельному решению
владельца. DEV-CP-03 не начат.

STOP.
