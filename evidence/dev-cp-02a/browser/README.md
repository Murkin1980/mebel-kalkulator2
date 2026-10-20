# DEV-CP-02A — Browser QA evidence

Дата: 2026-10-20
Проверяемый код: PR #1, commit `5b8684a13da3b6aa8b7cd46545b7dfe4e1d33f0e` + исправления этого checkpoint.
Приложение: локальный dev-server (`npm run dev`, Vite middleware + Express) на `http://127.0.0.1:5000`.

## Чем проверялось

| Компонент | Значение |
|---|---|
| Browser engine | **Chromium 153.0.8010.0** (реальный Blink/V8, headless new) |
| Automation | `playwright-core` 1.64.1 (CDP) |
| Библиотеки Chromium | `libnss3`, `libnspr4`, `libnssutil3`, `libfreebl3`, `libsoftokn3` из al2023-bundle (`LD_LIBRARY_PATH`) |
| Node | v22.22.3 |
| Хранилище | **настоящий IndexedDB** браузера (БД `salamat-calc` v1, stores `profiles`, `meta`) |
| Viewports | 320×740, 375×740, 430×740, DPR 2, `isMobile`, `hasTouch` |
| Скриншоты | реальные PNG (deviceScaleFactor 2), 16 на каждый viewport |

Путь получения браузера (сеть ограничена): CDN Playwright недоступен, поэтому Chromium взят из
npm-пакета `@sparticuz/chromium@153.0.0` (brotli-архив + `al2023.tar.br` с недостающими NSS/GLib
библиотеками), распакован в `/tmp` и запущен Playwright'ом по `executablePath`. Это полноценный
Chromium, а не заглушка: рендеринг, ввод, IndexedDB, история и нативные диалоги — настоящие.

## Что лежит в папке

| Файл | Содержимое |
|---|---|
| `320-01 … 320-16 *.png`, `375-*.png`, `430-*.png` | скриншоты сценария (16 состояний × 3 viewport) |
| `320-rejected-export.json`, `375-…`, `430-…` | реально скачанный файл восстановления повреждённых записей |
| `qa-report.json` | полный машинный отчёт: 165 проверок, аудиты layout, состояние IndexedDB, шаги сценария |
| `dialogs.json` | тексты нативных диалогов (`beforeunload`, `confirm`), перехваченные Playwright |
| `qa-harness.mjs` | воспроизводимый harness (не входит в сборку приложения, не импортируется кодом) |

## Сценарий (выполняется на каждом viewport)

1. `#/tariffs` на пустом IndexedDB → шаблон + пустое состояние.
2. Диалог «Новый профиль» → создать `Моя мастерская`.
3. Редактор: открыть тариф `Шкафы — ЛДСП Россия`, ввести `-5` (ожидается inline-ошибка), затем `180000`
   и подтвердить цену.
4. Сохранить → проверить реальный IndexedDB (`version = 2`, `priceKzt = 180000`, `isConfirmed = true`).
5. Перезагрузить страницу → цена и подтверждение восстановлены.
6. Вернуться к списку → открыть профиль заново → значение сохранено.
7. Ввести изменение в название профиля (dirty) → проверить native `beforeunload` при reload.
8. Browser Back при dirty → диалог; отказ → редактор и черновик на месте; повторный Back + согласие → выход;
   Forward → редактор с сохранёнными данными без dirty.
9. Чистый редактор → Back без диалогов.
10. Подложить повреждённую запись в IndexedDB → предупреждение, экспорт raw-записей, запись не удалена.
11. Read-only шаблон: поля disabled, кнопки сохранения нет.
12. Низ редактора: блок предпроверки тарифа, фиксированная панель сохранения не перекрывает контент,
    hit-test каждого видимого button/link.

## Аудит на каждом экране

- горизонтальная прокрутка: `document.scrollWidth - document.clientWidth` (и перечисление элементов за границей);
- обрезанные подписи кнопок (`scrollWidth > clientWidth`);
- обрезанные/вылезшие за viewport поля ввода;
- размеры интерактивных элементов ≥ 44 px (с учётом `<label>` для чекбоксов);
- hit-test через `document.elementFromPoint` (кнопка не перекрыта sticky-header/fixed-bar).

## Воспроизведение

```bash
npm run dev                        # http://127.0.0.1:5000
BASE_URL=http://127.0.0.1:5000 \
OUT_DIR=$PWD/evidence/dev-cp-02a/browser \
CHROMIUM_EXECUTABLE=/path/to/chromium \
PLAYWRIGHT_CORE_PATH=/path/to/playwright-core/index.js \
LD_LIBRARY_PATH=/path/to/chromium/libs \
VIEWPORTS=320,375,430 \
node evidence/dev-cp-02a/browser/qa-harness.mjs
```

Результат последнего прогона: **165/165 PASS**, 0 ошибок консоли (`qa-report.json → summary`).
Тот же harness на production-сборке (`npm start`, `dist/index.cjs`, порт 5001), viewport 320 px:
**55/55 PASS**.
