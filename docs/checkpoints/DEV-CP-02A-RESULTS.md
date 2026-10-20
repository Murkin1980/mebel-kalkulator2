# DEV-CP-02A — SALAMAT CALC Stabilization & Mobile QA

RESULT: **PARTIAL**  
Дата: 2026-10-20  
MPE decision: `EXTEND_EXISTING`  
Режим: CORRECTIVE / MINIMAL DIFF  
Merge: **не выполнялся**  
Deploy: **не выполнялся**

## 1. Идентификация и baseline

| Поле | Значение |
|---|---|
| Repository | `Murkin1980/mebel-kalkulator2` |
| Base commit (актуальный HEAD PR #1) | `cdf08c7dcdca8eb24434f0e99e760b0e7c7bd933` |
| PR #1 | открыт: `https://github.com/Murkin1980/mebel-kalkulator2/pull/1` |
| PR #1 head branch | `arena/8e093f08-mebel-kalkulator2` |
| Рабочая branch (фиксирована средой) | `arena/6ea47acb-mebel-kalkulator2` |
| Implementation commit | `97c3408e9255846b08ba7807a1f1463c58a27297` |
| Node / npm | Node `v22.22.3`, npm `10.9.8` |

Рабочая ветка изначально находилась на `350730c`; актуальный PR HEAD был проверен через GitHub и
fast-forward-ом добавлен в текущую ветку до начала изменений. Незакоммиченных изменений до работы
не было. PR #1 остаётся открыт и без merge.

Начальная `npm ci` не смогла собрать `better-sqlite3`: prebuilt download завершился ошибкой TLS,
а запрос Node headers к `nodejs.org` был сброшен. Установлены зафиксированные зависимости через
`npm ci --ignore-scripts`, затем native binding собран локально (`npm rebuild better-sqlite3
--nodedir=/usr/local`). `package-lock.json` и список зависимостей не изменялись.

### Baseline на `cdf08c7`

| Проверка | Результат |
|---|---|
| Незакоммиченные изменения | отсутствовали |
| `npm test` | PASS — **87/87**, 18 suites |
| `npm run check` | PASS |
| `npm run build` | PASS; существующее предупреждение о порядке CSS `@import` и устаревшем Browserslist |

## 2. Изменения и причина исправлений

### R-1 — защита от потери черновика

Причина: Wouter 3 в используемом hash-router не предоставляет блокировку переходов; существующий
`beforeunload` защищал только закрытие/перезагрузку документа, а ручная проверка была только у кнопки
«Назад». `Link`, верхнее меню, программная навигация и Browser Back/Forward могли уничтожить редактор
без подтверждения.

Исправление:

- добавлен минимальный совместимый с Wouter hash-hook в `client/src/lib/unsaved-navigation.ts`;
  внутренняя навигация через Wouter `Link`/`navigate` проверяет текущий dirty editor;
- изменение hash при Browser Back/Forward перехватывается до подписчиков Wouter; при отказе маршрут
  истории возвращается, редактор не размонтируется;
- подтверждение спрашивается один раз: остаться/отмена сохраняет черновик в смонтированном редакторе,
  явное подтверждение разрешает выход без сохранения;
- существующий `beforeunload` сохранён для обновления/закрытия вкладки;
- после успешного сохранения новой копии навигация разрешается без второго подтверждения;
- guard удаляется при cleanup, основной калькулятор не регистрирует guard и не блокируется.

Добавлены четыре unit-регрессии решений guard (чистый переход, отказ от выхода, очистка блокировки,
навигация после durable-копии). Реальные сценарии с браузерными событиями не запускались из-за
отсутствия браузерного движка в среде; см. Mobile/Browser QA ниже. Поэтому R-1 реализован и покрыт
логическими тестами, но реальное поведение Back/Forward остаётся не подтверждено браузером.

### R-2 — повреждённые записи IndexedDB

Причина: чтение пропускало невалидные записи и выводило только `console.warn`; пользователь не видел,
что профиль исключён, и не мог сохранить исходную запись.

Исправление:

- `ProfileStore.load()` теперь возвращает валидные профили отдельно от `rejectedProfiles`;
  отклонённая запись содержит IndexedDB key, безопасную причину (без значений полей) и исходный raw
  объект в памяти;
- невалидные записи и записи, пытающиеся подменить шаблон Salamat Mebel, остаются в IndexedDB и
  не участвуют в списке доступных расчётов;
- экран профилей показывает количество/ключи/причины ошибок и предлагает явный локальный экспорт
  оригинальных записей; экспорт запускается только по нажатию, серверу данные не передаются;
- обработчики чтения/записи не заменяют ошибку пустым профилем; недоступность IndexedDB уже даёт
  явное сообщение и режим памяти, а ошибка чтения оставляет статус ошибки вместо ложного успеха.

Проверены тестами (in-memory IndexedDB test double): сохранение/повторное чтение, активный профиль,
удаление и сохранность оставшихся, шаблон (включая подменяющую запись), отказ валидации, недоступная
IndexedDB, атомарная запись профиля вместе с active marker и откат при ошибке транзакции, сохранение
повреждённой записи без удаления при одновременном показе валидных профилей.

Эти тесты не заменяют реальный browser IndexedDB QA. Исправление не добавляет автоматическое
восстановление/удаление; восстановление — только исходный JSON по явному запросу.

## 3. Изменённые файлы

| Файл | Изменение |
|---|---|
| `client/src/lib/unsaved-navigation.ts` | централизованный Wouter-compatible блокировщик dirty draft и native history |
| `client/src/App.tsx` | подключение hash-hook с навигационной защитой; Wouter сохранён |
| `client/src/pages/TariffEditorPage.tsx` | регистрация dirty state; сохранён `beforeunload`; безопасный переход после копирования |
| `client/src/lib/tariff-store.ts` | результат чтения включает диагностику повреждённых записей; сырьё не удаляется |
| `client/src/components/tariffs/TariffProfilesProvider.tsx` | передача diagnostic records экрану профилей |
| `client/src/pages/TariffProfilesPage.tsx` | явное предупреждение и локальный экспорт raw rejected records |
| `client/src/lib/tests/unsaved-navigation.test.ts` | 4 регрессионных теста решений guard |
| `client/src/lib/tests/tariff-store.test.ts` | тесты повреждённых записей и атомарного abort |
| `client/src/lib/tests/fake-indexeddb.ts` | getAllKeys и staging/abort в тестовом хранилище |
| `package.json` | новый тестовый файл включён в `npm test` |

Новых runtime/development-зависимостей нет. `server/*`, `shared/schema.ts`, `shared/pricing/*`,
SQLite и действующий API не менялись.

## 4. Проверки после изменений

| Проверка | Результат |
|---|---|
| `npm test` | PASS — **93/93**, 19 suites |
| `npm run check` | PASS |
| `npm run build` | PASS; те же ранее существовавшие CSS/Browserslist warnings |
| Dev server | запущен; `GET /` → 200, `GET /api/settings` → 200 |
| Regression `/api/calculate` | `POST` с прежним fixture вернул `{"basePrice":56100,"markupPercent":30,"finalPrice":72930,"deadline":21,"area":6.6}` |
| API / SQLite diff | отсутствует; API route, схемы и файлы хранения не изменены |
| Pricing Engine | четыре метода и независимость сервера покрыты прежними тестами; preview остаётся локальным |
| Salamat wardrobe / included services | требования существующего pricing engine остаются проверены тестами CP-01/02; файлы движка не изменялись |

## 5. Mobile QA и Browser Storage QA

**BROWSER_STORAGE_QA: NOT VERIFIED**  
**MOBILE QA: NOT VERIFIED**

В контейнере отсутствуют исполняемые Chromium/Chrome/Firefox (`which chromium chromium-browser
google-chrome firefox` не нашёл браузер). Browser automation tools и установленный browser binary
недоступны. Предыдущий checkpoint DEV-CP-02 фиксировал, что установка Chromium Playwright CDN блокируется
сетевой политикой, а Chromium package требует отсутствующие системные библиотеки `libnspr4.so`,
`libnss3.so`, `libnssutil3.so`. Поэтому реальный браузерный движок и настоящий IndexedDB в этом
checkpoint не запускались.

| Viewport / сценарий | Результат |
|---|---|
| 320 px — список профилей / редактор / диалоги / ввод | NOT VERIFIED |
| 375 px — список профилей / редактор / диалоги / ввод | NOT VERIFIED |
| 430 px — список профилей / редактор / диалоги / ввод | NOT VERIFIED |
| Реальные скриншоты | отсутствуют; фиктивные изображения не создавались |
| Реальный IndexedDB: create/edit/save/reload/reopen/active/export/import conflict copy | NOT VERIFIED |
| Browser Back/Forward при dirty draft, stay/discard | NOT VERIFIED |

Статические/SSR и fake IndexedDB-тесты не засчитаны как mobile visual QA или real storage QA.

## 6. Ограничения / deep-change / PR

- Итог — `PARTIAL`: R-1/R-2 реализованы, обязательные команды проходят, но требуемые реальные
  браузерные и трёх viewport QA недоступны в среде.
- Deep-change: **нет**. Роутинг Wouter сохранён; новый backend, инфраструктура, миграция SQLite,
  изменение API и новые зависимости отсутствуют.
- Рабочая ветка Arena фиксирована как `arena/6ea47acb-mebel-kalkulator2`, в то время как PR #1
  указывает head на `arena/8e093f08-mebel-kalkulator2`. Переключение/пуш в PR head branch запрещены
  текущей средой; дублирующий второй PR не создавался. PR #1 остаётся OPEN без merge, но его head
  не содержит этот commit; реализация сохранена в рабочей ветке.
- Preview dev server — не deploy; deployment не выполнялся.

## 7. Итоговые идентификаторы

- Base commit: `cdf08c7dcdca8eb24434f0e99e760b0e7c7bd933`
- Source implementation commit: `97c3408e9255846b08ba7807a1f1463c58a27297`
- Evidence file is committed separately as a documentation-only follow-up; branch final HEAD is
  reported in the final session report.
- Branch: `arena/6ea47acb-mebel-kalkulator2`
- PR #1: OPEN, no merge

## 8. Следующее авторизованное действие

Перед объявлением полного PASS нужно выполнить реальный проход на браузерном движке: три viewport
(320/375/430), dirty-draft navigation включая Back/Forward, native beforeunload, настоящий IndexedDB
workflow из checkpoint brief, затем сохранить браузерные скриншоты/evidence. DEV-CP-03 не начат.

STOP.
