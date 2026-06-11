# Bug Plan — Color Select Shows Red "✓" Mark + Unwanted Selected/Hover Styling

> Planned under `skills/TEAM-WORKFLOW.md`. **Status: PLANNING — awaiting Ariel approval. No code written yet.**
> Suggested branch (per branch policy): `fix/color-select-selection-indicator`

---

## Phase 0 — Intake

```
╔══════════════════════════════════════════════════════════════╗
║  📥 INTAKE — Work Item                                         ║
╠══════════════════════════════════════════════════════════════╣
║  Title:            Remove ✓ mark + selected/hover styling on   ║
║                    the color select options                    ║
║  Type:             Bug (UI / style)                            ║
║  Requestor:        Ariel                                       ║
║  Raw description:  On color select in the edit shape form a    ║
║                    red "vi" (✓) checkmark now appears near the ║
║                    selected option. Design should have NO      ║
║                    checkmark, NO extra styling on the selected ║
║                    option, and NO hover styling.               ║
║  Initial priority: 🟡 Medium                                   ║
╠══════════════════════════════════════════════════════════════╣
║  👉 Worth breaking down further?  YES — proceed to Phase 1.    ║
╚══════════════════════════════════════════════════════════════╝
```

---

## Phase 1 — Multi-Agent Planning Session

### Step 1.1 — Problem Statement (PM + Architect)

**User need:** The color picker in the edit-shape form (`app-style-input` with `inputName === 'Line Color'`) renders each color swatch as a `mat-option`. Angular Material's single-select now draws a selection indicator (a checkmark, themed red here) next to the selected swatch, and applies its default "selected" and "hover" background/highlight. The desired design is a clean grid of color swatches with **no** checkmark, **no** selected-state styling, and **no** hover styling.

**System impact:**

- [src/app/components/style-input/style-input.component.html](src/app/components/style-input/style-input.component.html) — `mat-select` + `mat-option` markup for all style inputs (Line Type, Line Width, Line Color).
- [src/app/components/style-input/style-input.component.scss](src/app/components/style-input/style-input.component.scss) — component styles; the component uses `ViewEncapsulation.None`, so its SCSS is global and is the correct place to override the Material overlay panel (`.style-input-panel--colors`).
- [src/app/components/style-input/style-input.component.ts](src/app/components/style-input/style-input.component.ts) — `panelClass` is `style-input-panel style-input-panel--colors` for the color input.

**Root cause:** Angular Material 16 (MDC-based `mat-select`/`mat-option`) shows a single-selection indicator (checkmark) on the selected option by default, and applies `.mdc-list-item--selected` + `:hover`/`.mat-mdc-option-active` background styling. This is Material default behavior surfacing through the overlay panel — not custom code we added.

**Acceptance criteria:**

- [ ] No checkmark / selection indicator appears on the selected color option.
- [ ] The selected color option has no extra background/highlight/text styling distinguishing it from the others.
- [ ] No hover background/highlight appears on any color option.
- [ ] The trigger (collapsed control) still shows the currently selected color swatch.
- [ ] Selecting a color still updates the form value (no functional regression).
- [ ] Decide & document whether this applies to **only** Line Color or **all** style inputs (Line Type / Line Width too).

**Out of scope:**

- Changing the color palette, swatch images, or the set of options.
- Restyling Line Type / Line Width unless we explicitly decide to include them.
- Any change to the form/value-accessor logic.

---

### Step 1.2 — Agent Reviews

- **Frontend:** Two levers. (1) Hide the checkmark — Angular Material 16 exposes `hideSingleSelectionIndicator` on `mat-select` (and a global `MAT_SELECT_CONFIG` default). That's the clean, semantic fix for the ✓. (2) Remove selected/hover background — must be done in SCSS targeting the MDC option classes within `.style-input-panel--colors` (`.mat-mdc-option`, `.mdc-list-item--selected`, `:hover`, `.mat-mdc-option-active`). Because the panel renders in an overlay, the styles must be global — which they already are via `ViewEncapsulation.None`.
- **Architect:** Prefer the framework-provided input (`hideSingleSelectionIndicator`) over brittle deep selectors for the checkmark. Keep the SCSS overrides scoped to the `--colors` panel class so Line Type / Line Width are unaffected unless we choose otherwise. Avoid `::ng-deep` (deprecated); rely on the existing global panel class instead. No `!important` unless Material specificity forces it (the file already uses `!important` for panel overrides, so it's consistent).
- **PM/UX:** Confirm the intent: a flat swatch grid with zero affordance for selected/hover is what's wanted. Slight UX note — removing hover entirely means no pointer feedback; that matches the explicit request, so proceed. The collapsed trigger already communicates the current color.
- **Tester:** Add/extend a component spec to assert the selected option carries no selection-indicator markup and that the `mat-select` is configured to hide it. Pure-CSS effects (hover/background) are hard to unit test meaningfully; cover the checkmark config + an E2E/visual check that the panel opens and selection still updates the value. Confirm Line Type / Line Width are visually unchanged.
- **Security/Pentester:** No threat surface — presentation only.
- **SRE / DB / Data / DevOps / ML:** N/A.

---

### Step 1.3 — Architecture Proposal (Architect leads)

**Decision point — how to remove the ✓ checkmark:**

**Option A — Use `hideSingleSelectionIndicator` on `mat-select`. (RECOMMENDED)**

- Add `[hideSingleSelectionIndicator]="true"` to the `mat-select` in the template (applies to all three style inputs, which is fine — none should show a checkmark).
- Pros: framework-supported, declarative, version-correct for Material 16, no fragile selectors, survives Material internal class renames.
- Cons: none meaningful.

**Option B — Hide the indicator purely via SCSS** (e.g. `.style-input-panel .mat-pseudo-checkbox, … .mdc-list-item__start { display: none }`).

- Pros: keeps all styling in one SCSS file.
- Cons: couples to Material's internal DOM/class names; more brittle across upgrades. Rejected in favor of A for the checkmark itself.

**For the selected/hover background removal (both options need this):** scope SCSS overrides to `.style-input-panel--colors` (and optionally the base `.style-input-panel`) to neutralize:

- `.mat-mdc-option:hover` / `:focus` background,
- `.mat-mdc-option.mdc-list-item--selected` background + primary-text color,
- `.mat-mdc-option-active` (keyboard-active) background,
- any ripple highlight.

**Scope decision to confirm with Ariel:** apply the no-indicator/no-hover treatment to **all** style inputs (Line Type, Line Width, Line Color) for consistency, OR **only** Line Color. Recommendation: checkmark hidden for all (via Option A); background/hover neutralization scoped to the color panel first, extended to the others only if desired.

**Vote (Feature scope / UX — PM, Frontend, Backend, Architect):**

| Option              | Architect (3) | PM   | Frontend | Backend | Total |
| ------------------- | ------------- | ---- | -------- | ------- | ----- |
| **A + scoped SCSS** | ✅ 3          | ✅ 1 | ✅ 1     | ✅ 1    | **6** |
| B + scoped SCSS     | —             | —    | —        | —       | 0     |

**Result: Option A + scoped SCSS passes with 6 effective votes (threshold 5). No veto.**

**Architecture summary:**

- Template: add `[hideSingleSelectionIndicator]="true"` to the `mat-select`.
- SCSS (global via `ViewEncapsulation.None`): under `.style-input-panel--colors`, remove selected-state and hover/active background + text styling so all swatches look identical.
- No TS/logic change. No API/DB/infra change.

---

## Phase 2 — Task Breakdown

### TASK-CSI-01: Hide the single-selection checkmark on style selects

- **Type:** Frontend (template)
- **Lead:** Frontend
- **Effort:** S
- **Priority:** Medium
- **Dependencies:** —
- **Acceptance criteria:**
  - [ ] `[hideSingleSelectionIndicator]="true"` on the `mat-select`.
  - [ ] No ✓ appears on the selected option for Line Color (and Line Type / Line Width).
- **Required tests:** Component spec asserting the select hides the indicator; E2E opens the color panel and confirms no indicator element.

### TASK-CSI-02: Remove selected + hover styling on color options

- **Type:** Frontend (SCSS)
- **Lead:** Frontend
- **Effort:** S
- **Priority:** Medium
- **Dependencies:** TASK-CSI-01
- **Acceptance criteria:**
  - [ ] Selected color option visually identical to unselected ones (no background/text highlight).
  - [ ] No hover/active background on color options.
  - [ ] Line Type / Line Width panels visually unchanged (unless Ariel opts to include them).
- **Required tests:** E2E/visual confirmation; manual before/after screenshots.

### TASK-CSI-03: Regression check

- **Type:** Testing
- **Lead:** Tester
- **Effort:** S
- **Priority:** Medium
- **Dependencies:** TASK-CSI-01, 02
- **Acceptance criteria:**
  - [ ] Selecting a color still updates the form value and the trigger swatch.
  - [ ] `style-input.component.spec.ts` passes; full unit suite green.
- **Required tests:** Existing `style-input.component.spec.ts` + value-update assertion.

---

## Phase 5 — Review Gate (during implementation)

Each task: Tester → Code Reviewer → Architect before PR. (Ariel merges.)

---

## Open questions for Ariel

1. **Approve Option A** (`hideSingleSelectionIndicator` for the checkmark + scoped SCSS for selected/hover)?
2. Apply the no-indicator + no-hover treatment to **all** style inputs, or **only** Line Color?
3. Confirm branch name `fix/color-select-selection-indicator`.
