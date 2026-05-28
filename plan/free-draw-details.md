# Free Draw Tool - Canonical Instructions (Phase 1 Baseline)

## Status

- Phase: 4 (execution work plan and workflow gating)
- Coding status: blocked until explicit user approval
- Allowed edits in planning stage: instructions and bugs files only

## Source of Truth Used

- Current chat requirements and clarifications
- Historical chat transcript in [chat-history/chat1.md](chat-history/chat1.md)
- Existing requirements draft merged into this file

## Process Gates

1. No implementation edits until explicit user go-ahead.
2. Work in gated phases and pause for approval between phases.
3. Planning-stage file changes are restricted to instruction and bugs markdown files.
4. Every fix must be proven with tests and evidence before closure.

## Scope

Build and stabilize Free Draw behavior in Angular + Cesium for:

- Text
- Circle
- Polyline
- Polygon

Cover end-to-end behavior:

- Tool modes and map operations
- Form behavior and synchronization
- Style controls and rendering
- Save, edit, delete, cancel lifecycle
- Context menu and selection behavior
- Regression-safe verification

## Baseline Tech Constraint

- Cesium version target: ^1.93.0

## Code Design Architecture Rules (Project-Wide)

These rules apply across the full Free Draw project scope and must be followed for new code and refactors.

1. Constants placement:

- Keep reusable constants in dedicated files under `src/app/consts/*`.
- Avoid inline duplicated constant values in services/components when they represent shared behavior or configuration.

2. Server conversion placement:

- Keep server request/response mapping logic (to/from DTO, domain <-> API mapping) in adapter files under `src/app/adapters/*`.
- Services/components should call adapters instead of embedding conversion logic inline.

3. Cesium utility placement:

- Keep Cesium coordinate/math conversion and shared Cesium utility logic in helpers, with default location `src/app/helpers/cesium.helpers.ts`.
- Services/components should consume helper functions and avoid duplicating Cesium conversion snippets.

4. Consumption rule:

- Services and components are orchestration layers and should import constants/adapters/helpers rather than redefining those concerns locally.

5. CSS sizing units rule:

- For size-related CSS values, use `rem` instead of `px` (for example: `font-size`, `width`, `height`, `padding`, `margin`, `gap`, `border-radius`).
- New UI changes and refactors should follow rem-based sizing for consistency and scalability.

6. Exported model declarations placement rule:

- Exported TypeScript `interface`, `type`, and `enum` declarations must be in separate dedicated files under `src/app/models/*`.
- Avoid declaring exported interfaces/types/enums inside service/component files.

7. TypeScript import alias rule:

- Use `@`-based import aliases for app code imports (for example: `@models/*`, `@services/*`, `@components/*`, `@consts/*`, `@adapters/*`, `@helpers/*`, `@app/*`).
- Avoid deep relative imports for app-internal modules when an alias path is available.

## Functional Requirements

### 1) Tool Modes and UX Rules

1.1 Free Draw has two states:

- View mode (default): shapes locked for editing actions.
- Edit mode: tool menu opens and editing operations are enabled.

  1.2 Enter Edit mode by clicking Free Draw button:

- Menu opens above map section.
- Unlock icon appears.

  1.3 Exit Edit mode by clicking button again:

- Menu closes.
- Mode returns to view-only.
- Lock icon appears.

  1.4 Only one property form may be open at a time; opening a new one replaces the previous.

  1.5 Form location is fixed (over GEO Entities and Plan list area), not draggable.

  1.6 Creating a shape via Text/Line/Circle/Polygon option sets map cursor to cross for map operations.

  1.7 In edit mode, draw type remains the selected shape option until user selects another shape option.

  1.8 Draw state reset to DRAW_NONE, mouse handlers reset, and form is destroyed only when user exits draw mode via the free draw tool button flow.

### 2) Form Structure and Visibility

2.1 Base form fields:

- Name (editable)
- ID (read-only, filled after save)
- Source (read-only)
- Coordinates (shape dependent)
- Radius (circle only)
- Color
- Line type (circle/line/polygon)
- Line width (circle/line/polygon)

  2.2 Shape-specific visibility:

- Radius shown only for circle.
- Text-specific field behavior should update rendered text label.

  2.3 Coordinates behavior:

- Polygon supports multiple coordinates with add/remove capability.
- Coordinates are editable by typing in the form (supported coordinate format per product spec reference).
- Minimum points are always present by shape:
  - text/circle: 1
  - polyline: 2
  - polygon: 3
- Minimum placeholders must exist before map clicks.

  2.4 Save button:

- Enabled only when mandatory fields are valid (including coordinates) and changes exist.
- Disabled when invalid or unchanged.

  2.5 Cancel button (and X):

- Unsaved shape: clear to default empty/minimum state.
- Saved shape: revert to last saved state.

  2.6 Error handling:

- Backend/API errors must be surfaced to the user in the form flow.

### 3) Map Interaction, Entity Lifecycle, and Sync

3.1 Draw service uses CallbackProperty-driven temp entity updates from service state.

3.2 Temp entities are created for active draw type and updated through service positions/radius.

3.3 Text and circle:

- First map interaction creates temp shape.
- Next interactions reposition/adjust same temp shape while active.

  3.4 Polyline and polygon:

- Clicking map creates/extends points.
- Preview and vertex handles should be visible and usable for editing.

  3.5 Vertex editing handles:

- Must exist for polyline/polygon map editing.
- Must not require adding extra template controls for those handles.

  3.6 Shape selection, dragging, stretching:

- Supported in edit flow as defined by mode and selection rules.
- Stretching by dragging shape dots/vertices.
- Dragging existing shape entities is enabled only when the shape is selected.

  3.7 Coordinate synchronization:

- Map click and drag updates must populate corresponding points in form.

  3.8 Style synchronization:

- Color, line type, and line width updates must reflect in form and rendered entity.

  3.9 Shape switching:

- Switching draw type resets incompatible temp geometry state.

  3.10 Save lifecycle:

- Saving persists shape and resets temp workflow correctly for next draw.

  3.11 Drag-to-form sync boundary (user clarification):

- Sync to form applies only for:
  - temp shape, or
  - saved shape currently opened in edit form.
- Dragging saved shape not currently in edit form must auto-save without updating form.
- Declaration of "saved shape edit mode" is ID-based:
  - form shape ID exists,
  - dragged/saved shape ID exists,
  - and form shape ID === saved shape ID.
- If IDs do not match, treat drag as saved-shape-not-in-form flow (auto-save path, no form sync).

  3.12 Context menu (CM):

- Open by right click only.
- Must support open form and delete actions for free draw entities.

  3.13 Drag affordance:

- Text and circle drag hit behavior should be easy enough to use reliably.

### 4) Architecture and Service Boundaries

4.1 DrawToolService relies on EditShapeFacadeService via observables/valueChanges.

4.2 DrawToolService should not be tightly coupled to EditDrawComponent.

4.3 EditShapeFacadeService is source for form state and synchronization helpers.

4.4 ActionToolsHolderComponent existing integration is kept (do not refactor there unless explicitly asked).

### 5) Server Integration Requirements

5.1 Save create/edit:

- Create new shape (POST) when no ID.
- Edit existing shape (PUT) when ID exists.
- Update saved snapshot after successful save.

  5.2 Delete:

- Delete by ID.
- Remove from datasource and update UI state accordingly.

  5.3 Cancel with server-aware behavior:

- Revert to last saved snapshot for saved shapes.
- Reset to defaults/minimum points for unsaved shapes.

  5.4 Saved and temp entities must not overwrite each other incorrectly.

  ## Phase 2 - Requirement Traceability and Check Tasks

  Legend:
  - implemented: behavior appears present in current code path
  - partial: behavior exists but may not fully satisfy instruction details
  - missing: behavior not found or not sufficiently wired

  ### A) Modes, Toolbar, and Form Lifecycle
  1. Requirement IDs: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.8
  - Main locations:
    - src/app/components/map/map.component.ts
    - src/app/components/map/map.component.html
  - Current status: partial
  - Why:
    - edit mode toggle and draw type flow exist.
    - single form instance is enforced through map overlay condition.
    - additional strict checks needed for "only tool-button exit destroys form and resets handlers" semantics.
  - Phase 2 check task:
    - verify transitions for enter edit, start draw, switch draw type, exit edit.
    - verify draw type persistence until explicit option change.
  2. Requirement ID: 1.6
  - Main locations:
    - src/app/components/map/map.component.ts
    - src/app/components/map/map.component.scss
  - Current status: partial
  - Why:
    - drawing mode class binding exists, but crosshair cursor rule must be validated in stylesheet behavior.
  - Phase 2 check task:
    - verify crosshair appears only for map operations in draw mode.

  ### B) Form Fields and Validation Semantics
  3. Requirement IDs: 2.1, 2.2
  - Main locations:
    - src/app/components/edit-draw/edit-draw.component.html
    - src/app/components/edit-draw/edit-draw.component.ts
  - Current status: partial
  - Why:
    - base fields, circle radius, and style controls are present.
    - text-specific color naming and any missing shape-specific field nuance should be validated.
  - Phase 2 check task:
    - verify per-shape conditional field matrix and read-only behavior.
  4. Requirement IDs: 2.3, 2.4, 2.5
  - Main locations:
    - src/app/components/edit-draw-points/edit-draw-points.component.ts
    - src/app/components/edit-draw-points/edit-draw-points.component.html
    - src/app/services/edit-shape-facade.service.ts
    - src/app/components/edit-draw/edit-draw.component.ts
  - Current status: partial
  - Why:
    - polygon add/remove is present.
    - minimum points and unsaved/saved cancel semantics are implemented in multiple places but need strict requirement proof.
    - save enable rule uses unsaved-change logic
  - Phase 2 check task:
    - verify minimum placeholders per shape before click.
    - verify cancel matrix for unsaved vs saved across all shape types.
  5. Requirement ID: 2.6
  - Main locations:
    - src/app/components/edit-draw/edit-draw.component.ts
    - src/app/components/edit-draw/edit-draw.component.html
  - Current status: implemented
  - Why:
    - save/delete error path sets message and template displays error section.
  - Phase 2 check task:
    - verify user-facing text and error lifecycle reset behavior.

  ### C) Draw Engine, Sync, and Interaction
  6. Requirement IDs: 3.1, 3.2, 3.3, 3.4, 3.5
  - Main locations:
    - src/app/services/draw-tool.service.ts
  - Current status: implemented
  - Why:
    - callback-driven temp entities and preview/vertex creation flows are present.
  - Phase 2 check task:
    - verify no entity recreation regressions and preview consistency.
  7. Requirement IDs: 3.6, 3.7, 3.11, 3.13
  - Main locations:
    - src/app/services/draw-tool.service.ts
    - src/app/services/saved-shapes.service.ts
    - src/app/components/map/map.component.ts
  - Current status: partial
  - Why:
    - drag and sync flows exist with explicit branching, but reported bugs show mismatches in real scenarios.
    - non-edit auto-save boundary requires explicit validation against instruction 3.11.
    - easier drag affordance partly addressed via invisible hit entities for saved shapes; temp-shape hit affordance still requires verification.
  - Phase 2 check task:
    - validate three drag modes: temp, saved-in-edit, saved-not-in-edit.
    - verify form sync only in allowed modes.
  8. Requirement IDs: 3.8, 4.1, 4.2, 4.3
  - Main locations:
    - src/app/services/draw-tool.service.ts
    - src/app/services/edit-shape-facade.service.ts
    - src/app/components/style-input/style-input.component.ts
  - Current status: partial
  - Why:
    - observable wiring exists and style input CVA behavior exists.
    - recurring historical bugs indicate possible sync gaps under specific flows.
  - Phase 2 check task:
    - verify style propagation from form control -> facade -> draw service -> rendered entity.
  9. Requirement IDs: 3.9, 3.10, 5.4
  - Main locations:
    - src/app/services/draw-tool.service.ts
    - src/app/components/map/map.component.ts
    - src/app/services/saved-shapes.service.ts
  - Current status: partial
  - Why:
    - reset and save transition logic exists, but historical second-save override issues indicate lifecycle edge cases.
  - Phase 2 check task:
    - verify shape identity separation and switching draw type cleanup.
  10. Requirement ID: 3.12
  - Main locations:
    - src/app/components/map/map.component.ts
    - src/app/components/shape-context-menu/shape-context-menu.component.ts
  - Current status: implemented
  - Why:
    - right-click handler opens context menu; left click selects only.
  - Phase 2 check task:
    - verify no accidental left-click menu open and mode gating correctness.

  ### D) Server Lifecycle
  11. Requirement IDs: 5.1, 5.2, 5.3
  - Main locations:
    - src/app/services/edit-shape-facade.service.ts
    - src/app/components/edit-draw/edit-draw.component.ts
    - src/app/services/shape-api.service.ts
    - src/app/services/saved-shapes.service.ts
  - Current status: partial
  - Why:
    - create/update/delete pipelines exist, plus revert logic.
    - full conformance (including all unsaved/saved transitions and no unintended overwrite) still needs scenario-based proof.
  - Phase 2 check task:
    - validate create/edit/delete/cancel permutations with saved snapshot behavior.

  ## Phase 2 Execution Tasks (Planning-Only)
  1. Build requirement-by-requirement verification checklist from section above.
  2. Link each open bug to concrete symbols and expected behavior deltas.
  3. Define proof artifacts required per bug before any implementation begins.
  4. Keep deferred items in section 6 excluded from active execution scope.

## Phase 3 - Comprehensive Test Plan

### 3.1 Test Levels and Ownership

1. Unit tests (Karma/Jasmine):

- Target: pure service/component logic, state transitions, validators, conversion helpers.
- Primary files:
  - src/app/services/draw-tool.service.spec.ts
  - src/app/services/edit-shape-facade.service.spec.ts
  - src/app/services/saved-shapes.service.spec.ts
  - src/app/components/style-input/style-input.component.spec.ts
  - src/app/components/edit-draw/edit-draw.component.spec.ts
  - src/app/components/map/map.component.spec.ts

2. Integration tests (Karma/Jasmine with TestBed):

- Target: map component + draw service + facade service interaction contracts.
- Focus: mode changes, save/cancel flows, context menu gating, shape lifecycle transitions.

3. E2E tests (Playwright):

- Target: real UI flows and Cesium interaction scenarios.
- Focus: click/drag behavior, form sync, CM behavior, style changes, create/edit/delete lifecycle.

4. Manual exploratory checks:

- Target: visual affordance quality (drag ease), interaction feel, and hard-to-automate map nuances.

### 3.2 Test Data and Preconditions

1. Baseline shape fixtures:

- Text fixture with one point.
- Circle fixture with center and radius.
- Polyline fixture with exactly 2 points.
- Polygon fixture with 3, 4, and 10 points.

2. Edge coordinates:

- Near 0,0 placeholder boundary.
- Negative coordinates.
- High absolute longitude/latitude values within valid range.

3. Style fixtures:

- Each supported lineType.
- Line widths 2, 4, 6.
- All color options.

4. Save-state fixtures:

- Unsaved new shape.
- Saved shape opened for edit.
- Saved shape not currently opened in edit form.

### 3.3 Requirement Coverage Matrix (Scenario Catalog)

Scenario IDs use this naming:

- UT-\* for unit tests
- IT-\* for integration tests
- E2E-\* for Playwright tests
- MAN-\* for manual checks

#### A) Modes, Toolbar, Cursor, and Form Lifecycle (Req 1.1-1.8)

1. UT-MODE-001: entering edit mode toggles state flags and unlock icon source state.
2. IT-MODE-002: exiting edit mode clears draw type and hides form.
3. IT-MODE-003: switching shape option keeps edit mode and replaces form type.
4. IT-MODE-004: only one edit form instance can exist at a time.
5. E2E-MODE-005: toolbar menu visibility toggles with free draw button.
6. E2E-MODE-006: draw type persists until another draw button is clicked.
7. E2E-MODE-007: form destroyed and handlers reset on tool-button exit flow.
8. E2E-CURSOR-008: crosshair cursor appears in drawing context and not in normal view mode.

#### B) Form Fields, Visibility, Validation, and Errors (Req 2.1-2.6)

1. UT-FORM-001: required controls exist for all form types.
2. IT-FORM-002: circle shows radius; non-circle hides radius.
3. IT-FORM-003: ID/source remain read-only through state changes.
4. UT-FORM-004: minimum points initialized by draw type (1/2/3).
5. IT-FORM-005: polygon add/remove point buttons enforce min/max constraints.
6. UT-FORM-006: save enablement gate checks validity + unsaved changes.
7. IT-FORM-007: cancel unsaved resets to defaults/minimum placeholders.
8. IT-FORM-008: cancel saved reverts to last saved snapshot.
9. E2E-FORM-009: manual coordinate typing updates rendered shape for each type.
10. IT-ERR-010: save API error displays error message.
11. IT-ERR-011: delete API error displays error message.

#### C) Draw Engine and Geometry Sync (Req 3.1-3.5, 3.7-3.10)

1. UT-DRAW-001: temp entity properties are callback-driven from service state.
2. UT-DRAW-002: text first click creates point, second click updates same point.
3. UT-DRAW-003: circle mouse-down/move/up updates center/radius and emits radius updates.
4. UT-DRAW-004: polyline preview appears before second anchor.
5. UT-DRAW-005: polygon preview path and closure logic behaves correctly.
6. UT-DRAW-006: vertex entities exist for polyline/polygon edit flows.
7. IT-SYNC-007: map click updates corresponding point controls in form.
8. IT-SYNC-008: dragged vertex updates only the target point index.
9. IT-SYNC-009: style change propagates form -> draw service -> rendered entity.
10. IT-LIFE-010: clearTempEntityAfterSave resets temp state and reinitializes minimum points.
11. IT-LIFE-011: switching shape type clears incompatible temp positions.
12. E2E-SYNC-012: per-shape click-to-form synchronization on real map.
13. E2E-SYNC-013: preview and vertex handles visible and usable.

#### D) Drag, Selection, CM, and Boundary Rule (Req 3.6, 3.11, 3.12, 3.13)

1. IT-DRAG-001: dragging requires selected shape in saved-shape interaction path.
2. IT-DRAG-002: temp-shape drag syncs points to form.
3. IT-DRAG-003: saved shape in edit form drag syncs points to form.
4. IT-DRAG-004: saved shape not in edit form drag does not update form (auto-save path only).
5. E2E-CM-005: right-click opens context menu on saved shape.
6. E2E-CM-006: left-click selects shape and does not open context menu.
7. E2E-CM-007: context menu unavailable in view-only mode.
8. E2E-DRAG-008: text and circle drag hit affordance is practical (no pixel-perfect-only requirement).

#### E) Service Boundaries and API Lifecycle (Req 4.1-4.4, 5.1-5.4)

1. UT-ARCH-001: facade valueChanges streams emit expected normalized payloads.
2. IT-ARCH-002: draw service updates from facade without direct component coupling.
3. IT-SAVE-003: create flow issues POST and stores returned ID/snapshot.
4. IT-SAVE-004: edit flow issues PUT with existing ID.
5. IT-DEL-005: delete flow removes entity and resets UI state.
6. IT-CANCEL-006: cancel behavior matrix validates saved vs unsaved rules.
7. IT-LIFE-007: saved and temp entities remain identity-safe across repeated saves.
8. E2E-SAVE-008: second save does not overwrite wrong shape.

### 3.4 Regression Packs

1. RP-CORE: minimum points, click sync, style sync, save/cancel core flow.
2. RP-DRAG: vertex drag, whole-shape drag, boundary rule 3.11, CM interactions.
3. RP-LIFECYCLE: edit mode enter/exit, switch type, save twice, delete, reopen.
4. RP-ERROR: API failure on save/delete and UI recovery.

### 3.5 Non-Functional and Stability Checks

1. Ensure no unexpected console errors during core E2E flows.
2. Verify no handler leaks after repeated mode enter/exit cycles.
3. Verify shape interaction responsiveness remains acceptable after many edits.

### 3.6 Entry and Exit Criteria for Implementation Phase

Entry:

1. Every open bug linked to at least one IT/E2E scenario.
2. Requirement IDs mapped to scenario IDs in this section.
3. Deferred items excluded from active test pass criteria.

Exit:

1. All high-severity bugs are fixed and have passing proof scenarios.
2. All requirement families have at least one passing scenario.
3. No unresolved regressions in RP-CORE, RP-DRAG, RP-LIFECYCLE.

## Phase 4 - Work Plan (No Implementation Yet)

### 4.1 Execution Waves

Wave 0 - Baseline and Safety

1. Freeze instruction baseline and bug IDs for traceability.
2. Confirm deferred scope remains excluded (D-001, D-002).
3. Confirm test scenario IDs are final references for proof.

Wave 1 - High Severity Defects First

1. B-001 coordinate sync correctness.
2. B-002 drag boundary behavior (including 3.11 split).
3. B-003 style synchronization end-to-end.

Wave 2 - Lifecycle and UX Consistency

1. B-004 preview and vertex behavior.
2. B-006 cancel flow behavior matrix.
3. B-007 saved/temp identity safety.

Wave 3 - Interaction and Gate Conformance

1. B-005 context menu and edit-mode gating.
2. B-008 cursor and draw-type persistence proof.
3. B-009 save-enable mandatory validity conformance.
4. B-010 reset semantics boundary checks.

Wave 4 - Regression and Hardening

1. Run RP-CORE, RP-DRAG, RP-LIFECYCLE, RP-ERROR.
2. Verify no reopened bugs.
3. Produce acceptance report with requirement and bug traceability.

### 4.2 Per-Bug Execution Checklist (Template)

For each bug B-xxx, execute in this exact order:

1. Reproduce with a linked scenario ID.
2. Implement minimal scoped fix.
3. Run linked UT/IT/E2E proof scenarios.
4. Run relevant regression pack.
5. Update bug status to fixed-pending-proof or closed.
6. Record evidence artifact references.

### 4.3 Definition of Done Per Wave

1. All bugs assigned to wave are at least fixed-pending-proof.
2. All mandatory proof scenarios for those bugs pass.
3. No regression failures in affected packs.
4. Requirement IDs linked to changed behavior have explicit pass evidence.

## Phase 4 - Project Development Workflow

This workflow is mandatory for every future development task in this project.

Step 1 - Instruction Check (Before Coding)

1. Identify requirement IDs from this file.
2. Confirm bug IDs (if defect-driven change).
3. Confirm deferred items are not touched.

Step 2 - Implementation Scope Check

1. List exact files and symbols to change.
2. Verify no unrelated refactor is introduced.
3. Ensure architecture boundaries (section 4) are respected.
4. Ensure any exported TypeScript interface/type/enum is placed in a separate file under src/app/models.
5. Ensure app-internal TypeScript imports use configured `@` aliases.

Step 3 - Targeted Test Execution

1. Run linked UT/IT scenarios for changed requirement/bug IDs.
2. Run linked E2E scenarios for interaction-critical behavior.
3. Run relevant regression pack(s).

Step 4 - Thorough Code Review Gate

1. Verify behavioral conformance to requirement IDs.
2. Verify no lifecycle regressions (mode, save/cancel, temp vs saved).
3. Verify style and map interaction side effects.
4. Verify test evidence is complete and reproducible.

Step 5 - Acceptance Report to User

1. What was changed (file/symbol level).
2. Which requirement IDs were satisfied.
3. Which bug IDs were closed.
4. Which scenarios passed as proof.
5. Residual risks (if any).

## Phase 4.2 - Playwright MCP Status

1. Playwright MCP rollout is currently deferred under D-002 by user direction.
2. When user re-enables D-002, execution order will be:

- configure Playwright MCP integration
- map each active requirement ID to MCP-assisted E2E checks
- run full Playwright suite and attach evidence to bug and requirement IDs

### 6) Deferred for Now (per latest user instruction)

6.1 Requirement 3.23 is deferred.

- Interpreted as JSON schema/API-contract expansion work from prior draft.

  6.2 Section 6 from previous consolidation is deferred.

- Interpreted as tooling workflow expansion items (including Playwright MCP rollout tasks) until explicitly resumed.

## Quality and Verification Requirements

1. Use Karma/Jasmine for Angular tests (not Jest).
2. Add coverage for required features and regressions.
3. Prove each fix with reproducible evidence.
4. Do not mark done without validation outputs.

## Implementation Guardrails for Later Phases

1. No hidden behavior changes outside approved requirement scope.
2. Preserve existing design styles unless required by instruction.
3. Keep edits minimal and traceable to specific requirement IDs.
4. Each bug fix must reference violating requirement and proof test.
