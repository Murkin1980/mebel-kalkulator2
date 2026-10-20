# DEV-CP-02A browser QA summary

- Base: http://127.0.0.1:5000
- Pass: 103, Fail: 0

| Status | Check | Viewport | Detail |
|---|---|---|---|
| PASS | BROWSER — Real Chromium browser version: 153.0.8010.0 | - | playwright-core driven |
| PASS | PROFILES-EMPTY — Profiles page renders (empty state) | 320 |  |
| PASS | LAYOUT-NO-HSCROLL — No horizontal scroll (profiles empty) | 320 | doc=320 body=320 vw=320 |
| PASS | LAYOUT-NO-CLIP — No clipped/out-of-viewport elements (profiles empty) | 320 | all elements inside viewport |
| PASS | LAYOUT-TARGETS — No unreachable/tiny controls (<24px) (profiles empty) | 320 | all testid buttons >= 24px; mid-size: ["theme-toggle 34x34 (raw 34x34)"] |
| PASS | PROFILES-CTA — Button create-profile visible and clickable | 320 |  |
| PASS | PROFILES-CTA — Button import-profile visible and clickable | 320 |  |
| PASS | PROFILES-CTA — Button open-template visible and clickable | 320 |  |
| PASS | PROFILES-CTA — Button copy-template visible and clickable | 320 |  |
| PASS | PROFILES-EMPTY — Profiles page renders (empty state) | 375 |  |
| PASS | LAYOUT-NO-HSCROLL — No horizontal scroll (profiles empty) | 375 | doc=375 body=375 vw=375 |
| PASS | LAYOUT-NO-CLIP — No clipped/out-of-viewport elements (profiles empty) | 375 | all elements inside viewport |
| PASS | LAYOUT-TARGETS — No unreachable/tiny controls (<24px) (profiles empty) | 375 | all testid buttons >= 24px; mid-size: ["theme-toggle 34x34 (raw 34x34)"] |
| PASS | PROFILES-CTA — Button create-profile visible and clickable | 375 |  |
| PASS | PROFILES-CTA — Button import-profile visible and clickable | 375 |  |
| PASS | PROFILES-CTA — Button open-template visible and clickable | 375 |  |
| PASS | PROFILES-CTA — Button copy-template visible and clickable | 375 |  |
| PASS | PROFILES-EMPTY — Profiles page renders (empty state) | 430 |  |
| PASS | LAYOUT-NO-HSCROLL — No horizontal scroll (profiles empty) | 430 | doc=430 body=430 vw=430 |
| PASS | LAYOUT-NO-CLIP — No clipped/out-of-viewport elements (profiles empty) | 430 | all elements inside viewport |
| PASS | LAYOUT-TARGETS — No unreachable/tiny controls (<24px) (profiles empty) | 430 | all testid buttons >= 24px; mid-size: ["theme-toggle 34x34 (raw 34x34)"] |
| PASS | PROFILES-CTA — Button create-profile visible and clickable | 430 |  |
| PASS | PROFILES-CTA — Button import-profile visible and clickable | 430 |  |
| PASS | PROFILES-CTA — Button open-template visible and clickable | 430 |  |
| PASS | PROFILES-CTA — Button copy-template visible and clickable | 430 |  |
| PASS | IDB-CREATE — Create profile "QA 320" opens editor | 320 | profile-name="QA 320" |
| PASS | LAYOUT-NO-HSCROLL — No horizontal scroll (editor after create) | 320 | doc=320 body=320 vw=320 |
| PASS | LAYOUT-NO-CLIP — No clipped/out-of-viewport elements (editor after create) | 320 | all elements inside viewport |
| PASS | LAYOUT-TARGETS — No unreachable/tiny controls (<24px) (editor after create) | 320 | all testid buttons >= 24px; mid-size: ["theme-toggle 34x34 (raw 34x34)"] |
| PASS | NAV-CLEAN-NO-CONFIRM — Back from clean editor needs no confirm | 320 |  |
| PASS | IDB-CREATE — Create profile "QA 375" opens editor | 375 | profile-name="QA 375" |
| PASS | LAYOUT-NO-HSCROLL — No horizontal scroll (editor after create) | 375 | doc=375 body=375 vw=375 |
| PASS | LAYOUT-NO-CLIP — No clipped/out-of-viewport elements (editor after create) | 375 | all elements inside viewport |
| PASS | LAYOUT-TARGETS — No unreachable/tiny controls (<24px) (editor after create) | 375 | all testid buttons >= 24px; mid-size: ["theme-toggle 34x34 (raw 34x34)"] |
| PASS | IDB-CREATE — Create profile "QA 430" opens editor | 430 | profile-name="QA 430" |
| PASS | LAYOUT-NO-HSCROLL — No horizontal scroll (editor after create) | 430 | doc=430 body=430 vw=430 |
| PASS | LAYOUT-NO-CLIP — No clipped/out-of-viewport elements (editor after create) | 430 | all elements inside viewport |
| PASS | LAYOUT-TARGETS — No unreachable/tiny controls (<24px) (editor after create) | 430 | all testid buttons >= 24px; mid-size: ["theme-toggle 34x34 (raw 34x34)"] |
| PASS | NAV-CLEAN-NO-CONFIRM — Back from clean editor needs no confirm | 430 |  |
| PASS | IDB-RAW-PERSIST — Created profiles exist in real IndexedDB (salamat-calc) | - | {"names":["QA 320","QA 375","QA 430"],"total":3,"active":null} |
| PASS | EDITOR-CONFIRMED-PRICE — Price marked as confirmed | 375 | aria-checked=true |
| PASS | LAYOUT-NO-HSCROLL — No horizontal scroll (editor tariff form) | 375 | doc=375 body=375 vw=375 |
| PASS | LAYOUT-NO-CLIP — No clipped/out-of-viewport elements (editor tariff form) | 375 | all elements inside viewport |
| PASS | LAYOUT-TARGETS — No unreachable/tiny controls (<24px) (editor tariff form) | 375 | all testid buttons >= 24px; mid-size: ["theme-toggle 34x34 (raw 34x34)"] |
| PASS | EDITOR-DIRTY — Unsaved indicator shown after edit | 375 |  |
| PASS | EDITOR-SAVE — Save persists draft (saved indicator) | 375 |  |
| PASS | IDB-SAVE-RAW — Saved tariff present in real IndexedDB after save | 375 | {"name":"QA 375","version":2,"tariff":{"label":"QA кухня EGGER 18 мм","priceKzt":55000,"isConfirmed":true}} |
| PASS | IDB-REOPEN — Profile reopens after reload with saved values | 375 | name=QA 375 price=55000 confirmed=true |
| PASS | NAV-SAVED-NO-CONFIRM — Back after save needs no confirm | 375 |  |
| PASS | LAYOUT-NO-HSCROLL — No horizontal scroll (profiles with data) | 375 | doc=375 body=375 vw=375 |
| PASS | LAYOUT-NO-CLIP — No clipped/out-of-viewport elements (profiles with data) | 375 | all elements inside viewport |
| PASS | LAYOUT-TARGETS — No unreachable/tiny controls (<24px) (profiles with data) | 375 | all testid buttons >= 24px; mid-size: ["theme-toggle 34x34 (raw 34x34)"] |
| PASS | IDB-ACTIVE — Active profile marked in UI | 375 |  |
| PASS | IDB-ACTIVE-PERSIST — Active profile survives reload (real meta store) | 375 |  |
| PASS | NAV-WARN-DIALOG — Unsaved-changes confirm dialog appears | 375 | {"type":"confirm","message":"Есть несохранённые изменения. Выйти без сохранения?","action":"dismiss"} |
| PASS | NAV-WARN-STAY — Cancel keeps editor and unsaved draft | 375 | name="QA 375 dirty" |
| PASS | NAV-BACK-STAY — Browser Back + cancel: history restored, draft intact | 375 | hash #/tariffs/user-qa-375 -> #/tariffs/user-qa-375, name="QA 375 dirty" |
| PASS | NAV-BACK-LEAVE — Browser Back + confirm: navigates to profiles | 375 |  |
| PASS | NAV-FORWARD — Browser Forward reopens editor from storage (unsaved draft discarded) | 375 | name="QA 375" |
| PASS | NAV-WARN-LEAVE — Confirm leave exits without saving | 375 |  |
| PASS | NAV-LINK-GUARDED — Menu link navigation is guarded when dirty | 375 | {"type":"confirm","message":"Есть несохранённые изменения. Выйти без сохранения?","action":"dismiss"} |
| PASS | EDITOR-REVERT-CLEAN — Reverting a field clears the dirty state (save disabled) | 375 |  |
| PASS | UNLOAD-WARN — beforeunload warning fires on reload with unsaved changes | 375 | {"type":"beforeunload","message":"","action":"accept"} |
| PASS | IDB-REJECT-WARN — Corrupt records are reported with keys and reasons | 375 | Найдено повреждённых записей: 2 \|  \| Они не участвуют в расчётах и не удалялись. Причина указана без содержимого записи. \|  \| Файл восстановления содержит и |
| PASS | IDB-REJECT-HIDDEN — Corrupt records excluded from usable profile list | 375 |  |
| PASS | IDB-REJECT-VALID-OK — Valid profiles still listed next to the warning | 375 |  |
| PASS | IDB-REJECT-EXPORT — Local raw export of corrupt records works | 375 | format=salamat-calc-rejected-profiles-v1, records=2 |
| PASS | IDB-REJECT-EXPORT-FILE — Exported file kept as evidence | 375 | evidence/dev-cp-02a/browser/rejected-export-sample.json |
| PASS | IDB-REJECT-PERSIST — Corrupt records are not silently deleted on reload | 375 |  |
| PASS | TEMPLATE-READONLY — Template editor is read-only (no save bar) | 375 |  |
| PASS | TEMPLATE-COPY — Template copy becomes editable | 375 |  |
| PASS | LAYOUT-NO-HSCROLL — No horizontal scroll (profiles with data) | 320 | doc=320 body=320 vw=320 |
| PASS | LAYOUT-NO-CLIP — No clipped/out-of-viewport elements (profiles with data) | 320 | all elements inside viewport |
| PASS | LAYOUT-TARGETS — No unreachable/tiny controls (<24px) (profiles with data) | 320 | all testid buttons >= 24px; mid-size: ["theme-toggle 34x34 (raw 34x34)"] |
| PASS | LAYOUT-NO-HSCROLL — No horizontal scroll (editor top) | 320 | doc=320 body=320 vw=320 |
| PASS | LAYOUT-NO-CLIP — No clipped/out-of-viewport elements (editor top) | 320 | all elements inside viewport |
| PASS | LAYOUT-TARGETS — No unreachable/tiny controls (<24px) (editor top) | 320 | all testid buttons >= 24px; mid-size: ["theme-toggle 34x34 (raw 34x34)"] |
| PASS | LAYOUT-NO-HSCROLL — No horizontal scroll (editor tariff form) | 320 | doc=320 body=320 vw=320 |
| PASS | LAYOUT-NO-CLIP — No clipped/out-of-viewport elements (editor tariff form) | 320 | all elements inside viewport |
| PASS | LAYOUT-TARGETS — No unreachable/tiny controls (<24px) (editor tariff form) | 320 | all testid buttons >= 24px; mid-size: ["theme-toggle 34x34 (raw 34x34)"] |
| PASS | LAYOUT-NO-HSCROLL — No horizontal scroll (editor long name) | 320 | doc=320 body=320 vw=320 |
| PASS | LAYOUT-NO-CLIP — No clipped/out-of-viewport elements (editor long name) | 320 | all elements inside viewport |
| PASS | LAYOUT-TARGETS — No unreachable/tiny controls (<24px) (editor long name) | 320 | all testid buttons >= 24px; mid-size: ["theme-toggle 34x34 (raw 34x34)"] |
| PASS | NAV-CLEAN-NO-CONFIRM — Back from clean editor needs no confirm | 320 |  |
| PASS | LAYOUT-NO-HSCROLL — No horizontal scroll (profiles with data) | 430 | doc=430 body=430 vw=430 |
| PASS | LAYOUT-NO-CLIP — No clipped/out-of-viewport elements (profiles with data) | 430 | all elements inside viewport |
| PASS | LAYOUT-TARGETS — No unreachable/tiny controls (<24px) (profiles with data) | 430 | all testid buttons >= 24px; mid-size: ["theme-toggle 34x34 (raw 34x34)"] |
| PASS | LAYOUT-NO-HSCROLL — No horizontal scroll (editor top) | 430 | doc=430 body=430 vw=430 |
| PASS | LAYOUT-NO-CLIP — No clipped/out-of-viewport elements (editor top) | 430 | all elements inside viewport |
| PASS | LAYOUT-TARGETS — No unreachable/tiny controls (<24px) (editor top) | 430 | all testid buttons >= 24px; mid-size: ["theme-toggle 34x34 (raw 34x34)"] |
| PASS | LAYOUT-NO-HSCROLL — No horizontal scroll (editor tariff form) | 430 | doc=430 body=430 vw=430 |
| PASS | LAYOUT-NO-CLIP — No clipped/out-of-viewport elements (editor tariff form) | 430 | all elements inside viewport |
| PASS | LAYOUT-TARGETS — No unreachable/tiny controls (<24px) (editor tariff form) | 430 | all testid buttons >= 24px; mid-size: ["theme-toggle 34x34 (raw 34x34)"] |
| PASS | LAYOUT-NO-HSCROLL — No horizontal scroll (editor long name) | 430 | doc=430 body=430 vw=430 |
| PASS | LAYOUT-NO-CLIP — No clipped/out-of-viewport elements (editor long name) | 430 | all elements inside viewport |
| PASS | LAYOUT-TARGETS — No unreachable/tiny controls (<24px) (editor long name) | 430 | all testid buttons >= 24px; mid-size: ["theme-toggle 34x34 (raw 34x34)"] |
| PASS | NAV-CLEAN-NO-CONFIRM — Back from clean editor needs no confirm | 430 |  |
| PASS | LAYOUT-NO-HSCROLL — No horizontal scroll (editor dirty state) | 320 | doc=320 body=320 vw=320 |
| PASS | LAYOUT-NO-CLIP — No clipped/out-of-viewport elements (editor dirty state) | 320 | all elements inside viewport |
| PASS | LAYOUT-TARGETS — No unreachable/tiny controls (<24px) (editor dirty state) | 320 | all testid buttons >= 24px; mid-size: ["theme-toggle 34x34 (raw 34x34)"] |
| PASS | LAYOUT-NO-HSCROLL — No horizontal scroll (editor dirty state) | 430 | doc=430 body=430 vw=430 |
| PASS | LAYOUT-NO-CLIP — No clipped/out-of-viewport elements (editor dirty state) | 430 | all elements inside viewport |
| PASS | LAYOUT-TARGETS — No unreachable/tiny controls (<24px) (editor dirty state) | 430 | all testid buttons >= 24px; mid-size: ["theme-toggle 34x34 (raw 34x34)"] |

## Dialogs observed
1. confirm: "Есть несохранённые изменения. Выйти без сохранения?" -> dismiss
2. confirm: "Есть несохранённые изменения. Выйти без сохранения?" -> dismiss
3. confirm: "Есть несохранённые изменения. Выйти без сохранения?" -> accept
4. confirm: "Есть несохранённые изменения. Выйти без сохранения?" -> accept
5. confirm: "Есть несохранённые изменения. Выйти без сохранения?" -> dismiss
6. beforeunload: "" -> accept

## Screenshots
- evidence/dev-cp-02a/browser/profiles-empty-320w.png
- evidence/dev-cp-02a/browser/profiles-empty-375w.png
- evidence/dev-cp-02a/browser/profiles-empty-430w.png
- evidence/dev-cp-02a/browser/profiles-create-dialog-320w.png
- evidence/dev-cp-02a/browser/editor-after-create-320w.png
- evidence/dev-cp-02a/browser/profiles-create-dialog-375w.png
- evidence/dev-cp-02a/browser/editor-after-create-375w.png
- evidence/dev-cp-02a/browser/profiles-create-dialog-430w.png
- evidence/dev-cp-02a/browser/editor-after-create-430w.png
- evidence/dev-cp-02a/browser/editor-tariff-form-375w.png
- evidence/dev-cp-02a/browser/editor-dirty-save-bar-375w.png
- evidence/dev-cp-02a/browser/editor-saved-375w.png
- evidence/dev-cp-02a/browser/editor-reopened-375w.png
- evidence/dev-cp-02a/browser/profiles-with-profiles-375w.png
- evidence/dev-cp-02a/browser/profiles-active-375w.png
- evidence/dev-cp-02a/browser/nav-confirm-stayed-375w.png
- evidence/dev-cp-02a/browser/nav-confirm-stayed-viewport-375w.png
- evidence/dev-cp-02a/browser/profiles-rejected-warning-375w.png
- evidence/dev-cp-02a/browser/profiles-rejected-warning-viewport-375w.png
- evidence/dev-cp-02a/browser/editor-template-375w.png
- evidence/dev-cp-02a/browser/profiles-with-profiles-320w.png
- evidence/dev-cp-02a/browser/editor-profile-320w.png
- evidence/dev-cp-02a/browser/editor-tariff-form-320w.png
- evidence/dev-cp-02a/browser/profiles-with-profiles-430w.png
- evidence/dev-cp-02a/browser/editor-profile-430w.png
- evidence/dev-cp-02a/browser/editor-tariff-form-430w.png
- evidence/dev-cp-02a/browser/editor-dirty-save-bar-320w.png
- evidence/dev-cp-02a/browser/editor-dirty-save-bar-430w.png