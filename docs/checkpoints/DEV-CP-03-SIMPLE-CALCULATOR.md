# DEV-CP-03 — Simple Furniture Calculator UI

Status: OWNER-APPROVED PRODUCT SCOPE / IMPLEMENTATION PENDING
Repository: `Murkin1980/mebel-kalkulator2`
Branch: `feature/dev-cp-03-simple-calculator`
New Idea Filter: `EXTEND_EXISTING`
Merge: FORBIDDEN without owner approval
Deploy: FORBIDDEN without owner approval

## Purpose
Deliver a truly simple, mobile-first calculator: furniture type → sizes → base material → optional premium facades, upgraded hardware, and artificial stone → amount and itemized estimate. Ordinary users must never see `AREA`, `LINEAR`, `COST_PLUS`, `schemaVersion`, profile ids, JSON or pricing internals on the calculation screen. Tariffs remain editable from simple separate sections.

## Phase 0: mandatory preflight
Read `AGENTS.md`, `docs/governance/SCOPE-CHANGE-CONTROL.md`, `docs/architecture/PWA-ARCHITECTURE.md`, `docs/checkpoints/DEV-CP-01-RESULTS.md`, `docs/checkpoints/DEV-CP-02-RESULTS.md`, `docs/checkpoints/DEV-CP-02A-RESULTS.md` and only related client/pricing/store code. Run `npm test`, `npm run check`, `npm run build`. Check PR #1 and browser-QA status. Do not merge PR #1 as part of CP-03; preserve existing API / SQLite and historical behavior. Reuse existing Zod profile, IndexedDB storage, pure Pricing Engine and UI components. Implement on this feature branch, with its own PR targeting the intended branch. If PR #1 is unmerged, use its head as PR base or explicitly document the dependency; never create a PR against main containing duplicated CP-01/02 work.

## Phase 1: simple main UI
Present: furniture type (kitchen/wardrobe), dimensions in mm, main material, optional expandable sections "Премиальные фасады", "Дополнительная фурнитура", "Искусственный камень", total and detailed estimate. Optional sections collapsed initially; no automatic selections of paid options. Always show pricing units near user inputs. Provide explicit missing-price state rather than 0 KZT. Keep the existing calculator/API route intact unless owner authorizes changing its public contracts; preferably provide an isolated new preview route with client-side pure pricing.

## Phase 2: base tariffs, included services and premium facades
Existing owner-confirmed kitchen tariff data (KZT/linear metre): LDSP Russia 159500; LDSP Egger 205000; MDF film 247500; MDF paint 319000. DO NOT add the price of already priced film/paint kitchen package *and* a facade upgrade for the same selection.

The user approved **premium facade upgrade as DIFFERENCE versus included standard facade**, priced on actual facade square metres:

`facadeUpgrade = areaM2 * (premiumPriceKztPerM2 - standardIncludedFacadePriceKztPerM2)`.

Both price inputs must come from editable, explicit tariffs. Do not derive these two area prices by dividing overall kitchen linear price: it includes cabinets, worktop, hardware and mounting. If either facade m² tariff is missing/unconfirmed, block only the upgrade estimate and show a clear request to enter prices. Do not use sample numbers in production. Guard against a negative difference: show a transparent discount/negative line only if approved; default to requiring explicit confirmation instead of silent clamping to 0. Label premium types: MDF film, MDF paint, veneered MDF, plus user-added types. To avoid tariff double counting, select one *baseline kitchen package* that contains standard facades, and calculate an upgrade difference only when both compared facade tariffs are defined. Existing packaged MDF film/paint linear tariffs remain usable as standalone base selections, with upgrade field disabled for the same facade configuration.

Wardrobe pricing is AREA based on frontal elevation (width × height), not running metres. Approved prices are not in repository: do not invent. Prompt for a tariff instead of returning a fabricated total.

Base kitchen package **includes standard postforming worktop, standard hardware, fabrication and installation**. Do not add standard postforming worktop separately.

## Phase 3: editable hardware catalog
Simple screen "Фурнитура": create, edit, hide/remove hardware items, their category, name, price, unit and optionally "full add-on" versus "upgrade difference from standard" if standard component has a confirmed reference price. Examples: Tandem runners, Aventos lifts, expensive lower-mounted dish drainers. User selects item and quantity in calculator; add to itemized estimate only upon explicit selection. Prevent charging standard included hardware twice. All user prices editable and persisted locally; historical estimate keeps applied price snapshot.

## Phase 4: editable artificial stone catalog
Simple section "Искусственный камень": owner-editable Budget / Premium and arbitrarily added variants, each with either KZT/m² (width × length in mm) or KZT/linear metre (length in mm). No hardcoded demo values presented as approved. Separately editable sink/cutout/service items where priced and selected by user; no invented default prices. Artificial stone is NOT selected by default. When selected its added cost appears as a separate line, while the included postforming worktop remains in the base price. Do not automatically subtract postforming price unless owner has approved replacement credit rules and tariff.

## Phase 5: intuitive editable prices
Expose four simple navigation sections: "Калькулятор", "Мои цены", "Фурнитура", "Искусственный камень"; premium facade prices may appear under "Мои цены" with clear category. Reuse the CP-02 profile manager/storage, hiding technical fields from the everyday user UI. Support add/edit/remove in each catalog without modifying source code. Persist in IndexedDB and retain profile/export compatibility. Snapshot selected tariffs and their versions in estimates. Do not silently migrate or overwrite profiles; gate schema or data migrations under governance.

## Phase 6: estimate and verification
Display base furniture, upgrade difference (with reference standard price and area), selected hardware with qty, artificial stone with area/length, optional extras, and total. Support copy or export as simple human-readable estimate with exact selected values. Verify kitchen standard price, facade difference and double-charge prevention, facade unknown price, wardrobe AREA, stone AREA and LINEAR, hardware quantities, no paid options selected by default, profile edits survive reload, no failed IndexedDB reads silently masked, no previous routes/API regressions.

Real browser QA at 320/375/430 px and real IndexedDB; screenshots as evidence. Test mobile simplicity: customer price achievable from dimensions + material without visiting settings. Run `npm test`, `npm run check`, `npm run build`. Do not rely on SSR or fake IndexedDB alone. If Browser QA cannot run, report PARTIAL.

## Deep-change gate
The user approved the *business rules* and this product UI scope, not a silent change to server pricing contracts or storage schema. If the only feasible implementation demands a public route/API change, migration, architecture change, or unapproved recurring costs, stop that portion and report `DEEP_CHANGE_APPROVAL_REQUIRED`, continue isolated UI/engine work safely.

## Deliverables
Functioning preview calculator, editable catalogs, stable calculations and estimates, tests, real mobile/browser evidence if available, and `docs/checkpoints/DEV-CP-03-RESULTS.md`. Open a reviewable PR; no merge or deploy.

## Final report
```
RESULT: PASS | PARTIAL | BLOCKED
Repository / Base / Branch / Commit / PR:
Implemented:
Calculation verification:
Browser QA 320 / 375 / 430:
IndexedDB QA:
Tests / Typecheck / Build:
Unconfirmed prices:
Deep-change:
Merge: NOT DONE
Deploy: NOT DONE
Next authorized action:
```
STOP.
