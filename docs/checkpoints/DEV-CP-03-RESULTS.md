# DEV-CP-03 — RESULTS

RESULT: PASS — isolated preview implementation and automated acceptance verified.
Scope: DEV-CP-03 MVP; not merged, not deployed.
Repository: Murkin1980/mebel-kalkulator2
Feature branch: feature/dev-cp-03-simple-calculator
Base: arena/8e093f08-mebel-kalkulator2 (PR #1 head, dependency)
Draft PR: https://github.com/Murkin1980/mebel-kalkulator2/pull/3
Verified source SHA: d6e927c3887e82c656b938efe42e6e6eded82a6f

## Implemented
- `/#/simple`: isolated compact calculator with kitchen/wardrobe dimensions, base material, KZT estimate, copy text.
- Kitchen base prices from Salamat Mebel approved template; standard postforming worktop, average hardware, manufacture and installation are included in base tariff and are not charged again.
- Optional upgraded hardware with explicit quantity; additional artificial stone with unit, linear metre or area measuring; neither selected automatically.
- Optional premium facades: explicit standard and premium facade m² rates, actual surface area, surcharge as difference only; no extrapolation of m² price from kitchen linear tariff; blocks ambiguous MDF film/paint package double charge and missing prices.
- `/#/simple/catalog`: user-addable and editable hardware, artificial-stone, and facade positions; per-item unit and price; persist in current IndexedDB tariff profile via existing provider. First save creates user-owned active profile copy rather than mutating immutable Salamat template.
- Salamat Mebel black/graphite/bronze/ivory palette imported from salamat-mebel-kz `styles.css`, scoped to preview screen.
- Existing app calculator / API / database unaffected.

## Verification
GitHub Actions Workflow: Salamat Calc Browser QA #9
Run: https://github.com/Murkin1980/mebel-kalkulator2/actions/runs/39486766712
Result: SUCCESS.
CI `npm test`: PASS; `npm run check`: PASS; `npm run build`: PASS.
Real Playwright Chromium scenarios: 16/16 PASS (320, 375, 430 px; no horizontal overflow; base 3m Egger kitchen 615000 KZT; hardware 2 × 25000; stone 3 linear m × 120000; premium facade area 4m² × (50000 − 20000); real IndexedDB persistence after reload; old CP02 profile tests).
Screenshots and results: workflow artifact `salamat-calc-browser-qa-9`.

## Boundaries and notes
- All extra prices used in tests are synthetic test-only values entered via browser; NOT published as production Salamat tariffs.
- Production/artificial-stone/premium-facade tariff defaults remain unconfirmed until owner edits own profile.
- Catalog editing intentionally targets the CP03 entries; legacy advanced editor remains available at `/#/tariffs`.
- Estimate is copied as a dated-free text snapshot, not saved to an independent estimate-history database. Persistent history is out of this MVP.
- Checkout/merge into production is NOT DONE, site deployment is NOT DONE, server-side API changes are NOT DONE.
- PR #3 depends on PR #1 branch; when PR #1 is merged the PR base may be reviewed/retargeted only with owner approval.

## Outcome
Checkpoint preview implementation verified. Await owner review/approval of PR #3 and separate merge/deploy instruction. STOP.
