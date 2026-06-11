# Feature Plan — Editable `lineType` & `lineWidth` for Circle Shape

> Planned under `skills/TEAM-WORKFLOW.md`. **Status: PLANNING — awaiting Ariel approval. No code written yet.**
> Suggested branch (per branch policy): `feature/circle-line-style`

---

## Phase 0 — Intake

```
╔══════════════════════════════════════════════════════════════╗
║  📥 INTAKE — Work Item                                         ║
╠══════════════════════════════════════════════════════════════╣
║  Title:            Editable lineType & lineWidth for Circle    ║
║  Type:             Feature                                     ║
║  Requestor:        Ariel                                       ║
║  Raw description:  Add HTML controls to edit lineType and      ║
║                    lineWidth for the circle shape; changing    ║
║                    each must affect the circle Cesium entity   ║
║                    the same way it does for polyline/polygon.  ║
║  Initial priority: 🟡 Medium                                   ║
╠══════════════════════════════════════════════════════════════╣
║  👉 Worth breaking down further?  YES — proceed to Phase 1.    ║
╚══════════════════════════════════════════════════════════════╝
```

---

## Phase 1 — Multi-Agent Planning Session

### Step 1.1 — Problem Statement (PM + Architect)

**User need:** When editing a circle, the user can currently only change its radius and line color. They cannot change the line *style* (solid / dashed / dotted) or the line *width*, even though polyline and polygon support both. The user wants parity: the circle outline should react live to `lineType` and `lineWidth` exactly like polyline/polygon.

**System impact:**
- `EditDrawComponent` template — the `lineType` / `lineWidth` `app-style-input` controls are currently gated with `*ngIf` to `DRAW_POLYGON` / `DRAW_POLYLINE` only.
- `DrawToolService.createTemporaryEntity` — the circle branch renders a Cesium `ellipse` with `outline: true`, `outlineColor`, `outlineWidth`. It ignores `lineType` and the `outlineWidth` is not honored by WebGL.
- `SavedShapesService.createEntityFromDto` (+ `createHitEntitiesFromDto`) — the persisted/restored circle entity uses the same `ellipse.outline` rendering.
- Form/model layer (`EditShapeFacadeService`, `ShapeDto`) — **already** carries `lineType` and `lineWidth` for every shape, so no model change is needed.

**Acceptance criteria:**
- [ ] When the circle draw/edit panel is open, `Line Type` and `Line Width` controls are visible (same component used by polyline/polygon).
- [ ] Changing `lineType` updates the live circle outline to solid / dashed / dotted, matching the visual produced by `getPolylineMaterial` for polyline/polygon.
- [ ] Changing `lineWidth` visibly changes the circle outline thickness (2 / 4 / 6 px) — actually rendered, not silently ignored.
- [ ] The chosen `lineType` / `lineWidth` persist in the saved `ShapeDto` and re-render correctly when the saved circle is reloaded.
- [ ] Hit-detection (click-to-select) for the circle still works after the rendering change.
- [ ] Existing polyline/polygon/text behavior is unchanged (regression-safe).

**Out of scope:**
- Circle *fill* styling (the circle stays unfilled — `fill: false`).
- Adding new line widths/types beyond the existing options (2/4/6 px; solid/dashed/dotted).
- Changing the radius UX.
- Backend/API schema changes (DTO already supports the fields).

---

### Step 1.2 — Agent Reviews

- **Architect:** The form & DTO already model `lineType`/`lineWidth`, so this is purely a *render* problem. The core constraint: Cesium `ellipse.outline` does **not** support dash materials and `outlineWidth` is effectively clamped to 1px on most WebGL drivers. To get true parity with polyline/polygon we must render the circle perimeter as a **polyline** (sampled ellipse boundary) and reuse `getPolylineMaterial` + `width`. This is the central decision — see Step 1.3 vote.
- **Frontend:** Un-gating the two `app-style-input` controls is trivial (extend the `*ngIf` array to include `DRAW_CIRCLE`). The real work is in the service layer. The live-update plumbing (`lineTypeChanges$` / `lineWidthChanges$` → `updateStyle`) already exists and is shape-agnostic; `updateStyle` recreates the temporary entity, so the circle will pick up changes automatically once its entity honors the style.
- **Backend:** No API/business-logic change. `ShapeDto` already has `lineType`, `lineWidth`. Mapping in `EditShapeFacadeService.toShapeDto` / `fromShapeDto` already handles these fields generically.
- **Tester:** Need E2E coverage for: controls visibility on circle, live style change while drawing, persistence round-trip, and a regression pass on polyline/polygon. A hit-detection regression test is important because we're changing how the circle entity is built.
- **SRE/Perf:** Sampling the ellipse boundary every frame via a `CallbackProperty` during live radius drag could allocate many points. Cap the sample count (e.g. 64–128 segments) and avoid per-frame array churn where possible.
- **Security/Pentester:** No new input surface beyond bounded enum/number choices already validated elsewhere. No threat surface introduced.
- **DB Expert / Data Engineer / DevOps / ML:** N/A.

---

### Step 1.3 — Architecture Proposal (Architect leads)

**Decision point — how to render the circle outline so `lineType` + `lineWidth` actually apply:**

**Option A — Keep `ellipse.outline`, just pass `lineType`/`lineWidth` through.**
- Pros: smallest change; touches only style values.
- Cons: **Fails acceptance criteria.** `ellipse.outline` can't render dashed/dotted, and `outlineWidth` is ignored by WebGL → `lineType` would do nothing and `lineWidth` would not visibly change. Not "like polyline/polygon".

**Option B — Render the circle perimeter as a computed polyline. (RECOMMENDED)**
- Approach: compute N points around the ellipse boundary from `center + radius`, render them as a Cesium `polyline` with `width: lineWidth` and `material: getPolylineMaterial(...)` — exactly the path polyline/polygon use. Drop reliance on `ellipse.outline` for the visible stroke (keep `ellipse` only if a future fill is needed; for now an unfilled circle = polyline ring).
- Pros: true visual parity with polyline/polygon; `lineType` and `lineWidth` both work; reuses the existing, tested `getPolylineMaterial`.
- Cons: more code; must handle live radius updates (CallbackProperty that re-samples the ring) and update hit-entity generation accordingly.

**Option C — Hybrid: keep `ellipse` (fill:false) for selection/geometry, overlay a polyline ring for the visible stroke.**
- Pros: keeps existing ellipse-based hit logic untouched.
- Cons: two entities per circle to keep in sync (radius, position, lifecycle); more state, more regression risk than B.

**Vote (Architecture / system design — Architect ×3, Backend, Frontend, SRE, DB Expert):**

| Option | Architect (3) | Backend | Frontend | SRE | DB Expert | Total |
|---|---|---|---|---|---|---|
| A | — | — | — | — | — | 0 |
| **B** | ✅ 3 | ✅ 1 | ✅ 1 | ✅ 1 | ✅ 1 | **7** |
| C | — | — | — | — | — | 0 |

**Result: Option B passes with 7 effective votes (threshold 5). No veto.**

**Architecture summary (Option B):**
- **Approach:** Render circle stroke as a sampled-boundary polyline using the same width/material pipeline as polyline/polygon. Compute boundary points from center + radius (`EllipseOutlineGeometry`-style sampling, or manual ring sampling on the ellipsoid surface).
- **Components affected:**
  - `EditDrawComponent` template — add `DRAW_CIRCLE` to the `*ngIf` arrays of the `lineType` and `lineWidth` `app-style-input` controls.
  - `DrawToolService.createTemporaryEntity` (circle branch) — replace/augment `ellipse.outline` with a polyline ring driven by `CallbackProperty` (re-samples on radius/position change) using `width: lineWidth` + `getPolylineMaterial()`.
  - `SavedShapesService.createEntityFromDto` (circle branch) — same boundary-polyline rendering for saved/reloaded circles.
  - `SavedShapesService.createHitEntitiesFromDto` (circle branch) — ensure the invisible hit entity still matches the new stroke geometry so click-select keeps working.
- **New components:** A small shared helper to sample ellipse/circle boundary positions (e.g. `circleBoundaryPositions(center, radius, segments)`), placed in `helpers/` and reused by both services to avoid drift.
- **Data flow:** form control change → `lineTypeChanges$` / `lineWidthChanges$` (existing) → `updateStyle()` (existing) → `createTemporaryEntity()` rebuilds circle ring with new material/width. No new wiring needed beyond the circle render branch.
- **API/DB/Infra changes:** none.
- **Observability:** none required (client-only rendering).

---

## Phase 2 — Task Breakdown

### TASK-CLS-01: Shared circle-boundary sampling helper
- **Type:** Frontend (helper)
- **Lead:** Frontend
- **Effort:** S
- **Priority:** Medium
- **Dependencies:** —
- **Acceptance criteria:**
  - [ ] Pure function returns ring positions for a given center + radius + segment count.
  - [ ] Segment count capped (e.g. 64–128) for perf.
  - [ ] Unit-tested for radius edge cases (0, small, large).
- **Required tests:** Unit tests (geometry correctness, edge cases).

### TASK-CLS-02: Render live (temporary) circle stroke as styled polyline
- **Type:** Frontend (service)
- **Lead:** Frontend
- **Effort:** M
- **Priority:** Medium
- **Dependencies:** TASK-CLS-01
- **Acceptance criteria:**
  - [ ] `createTemporaryEntity` circle branch uses ring polyline with `width` + `getPolylineMaterial`.
  - [ ] Live `lineType`/`lineWidth`/radius changes re-render correctly via `CallbackProperty`.
  - [ ] Center drag handle preserved.
- **Required tests:** Unit (entity construction), Playwright E2E (live style change while drawing a circle).

### TASK-CLS-03: Render saved/reloaded circle stroke as styled polyline + fix hit entity
- **Type:** Frontend (service)
- **Lead:** Frontend
- **Effort:** M
- **Priority:** Medium
- **Dependencies:** TASK-CLS-01
- **Acceptance criteria:**
  - [ ] `createEntityFromDto` circle branch renders styled ring matching the live preview.
  - [ ] `createHitEntitiesFromDto` updated so click-select still works.
  - [ ] Persistence round-trip keeps `lineType`/`lineWidth`.
- **Required tests:** Unit (DTO→entity), Playwright E2E (save circle → reload → style preserved → selectable).

### TASK-CLS-04: Un-gate `lineType` / `lineWidth` controls for circle in template
- **Type:** Frontend (template)
- **Lead:** Frontend
- **Effort:** S
- **Priority:** Medium
- **Dependencies:** TASK-CLS-02 (so the controls do something when shown)
- **Acceptance criteria:**
  - [ ] `Line Type` and `Line Width` controls visible when `drawType === DRAW_CIRCLE`.
  - [ ] Radius field still shown.
- **Required tests:** Playwright E2E (controls visible for circle), component test.

### TASK-CLS-05: Regression sweep
- **Type:** Testing
- **Lead:** Tester
- **Effort:** S
- **Priority:** High
- **Dependencies:** TASK-CLS-02, 03, 04
- **Acceptance criteria:**
  - [ ] Polyline & polygon line styling unchanged.
  - [ ] Text shape unchanged.
  - [ ] Full E2E `draw-bugs.spec.ts` passes.
- **Required tests:** Existing E2E suite + new circle specs.

---

## Phase 5 — Review Gate (to be completed during implementation)

Each task must pass Tester → Code Reviewer → Architect before any PR. (Ariel merges.)

---

## Open questions for Ariel

1. **Approve Option B** (circle stroke = sampled polyline ring)? This is the only way to get true `lineType`/`lineWidth` parity given Cesium's `ellipse.outline` limitations.
2. Confirm the suggested branch name `feature/circle-line-style`.
3. Confirm we keep the circle **unfilled** (no fill styling in scope).
```
