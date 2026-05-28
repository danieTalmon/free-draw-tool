# Free Draw Tool - Feature Ledger

## Scope

This file tracks feature requests and feature gaps separately from bug items in plan/bugs.md.

## Status Values

- open: requested and not started
- in-analysis: requirements and behavior are being validated
- ready-for-implementation: implementation plan approved
- in-progress: implementation has started
- fixed-pending-proof: code exists, proof incomplete
- closed: verified with required evidence and review gate approvals
- deferred: explicitly postponed by user decision

## Required Fields Per Feature

- ID
- Title
- Status
- Priority
- Linked Requirement IDs
- Current Behavior
- Expected Behavior
- Proposed Implementation Direction
- Candidate Implementation Locations
- Proof Required
- Notes

## Active Features

### F-001 - Polygon per-point inline + / - controls with ordered insert/remove and preview coupling

- Status: in-progress
- Priority: high
- Linked Requirement IDs: 2.3, 3.4, 3.7
- Current Behavior:
  - Polygon UI has one global add button and per-row remove control.
  - Add operation appends to the end instead of inserting after the clicked row.
  - Preview behavior is not explicitly tied to row-level insertion flow.
- Expected Behavior:
  - Every polygon point row has two rectangular action buttons on the right: + and -.
  - Button visual style:
    - rectangular shape,
    - gray border/frame,
    - centered gray + / - symbol,
    - neutral/minimal look (no strong fill emphasis).
  - Clicking + on point index i inserts a new point at index i + 1.
    - Example: 4 points, click + on point 2 => new point is point 3, old 3 -> 4, old 4 -> 5.
  - Clicking - removes that exact row point.
  - Inserted point starts with empty coordinates (0/0).
  - - insertion affects polygon preview behavior on mouse move in DrawToolService.
- Proposed Implementation Direction:
  - Replace global polygon add interaction with per-row insert/remove controls.
  - Add indexed insert API in facade/service flow to preserve point order and form synchronization.
  - Ensure draw-tool polygon preview uses updated ordered points after insertion during mouse move.
- Candidate Implementation Locations:
  - src/app/components/edit-draw-points/edit-draw-points.component.html
  - src/app/components/edit-draw-points/edit-draw-points.component.ts
  - src/app/services/edit-shape-facade.service.ts
  - src/app/services/draw-tool.service.ts
- Proof Required:
  - Unit tests for indexed insert/remove behavior and minimum-point guard.
  - Unit tests for polygon preview update after insertion.
  - E2E scenario for row-level + / - interaction and point order persistence.
- Planned Proof Scenarios:
  - UT-POLY-INSERT-001
  - UT-POLY-REMOVE-001
  - UT-POLY-PREVIEW-001
  - E2E-POLY-POINTS-011
- Notes:
  - User confirmed inserted point must start with empty coordinates.
  - User confirmed + / - buttons should use gray frame + centered gray symbol style.
  - Execute under TEAM-WORKFLOW gates.

## F-001 Multi-Skill Discussion Log

### Session Metadata

- Date: 2026-05-26
- Feature: F-001
- Purpose: Cross-skill review before and during implementation
- Skills involved:
  - Frontend Expert (SKILL_6)
  - Tester Expert (SKILL_1)
  - Project Architect (SKILL_4)
  - Code Reviewer (SKILL_10)
  - Tech Writer (SKILL.md)

### Frontend Expert Review

- Goal fit:
  - Per-row controls are the correct UX model for point-local actions.
  - Global add button is removed because it does not preserve insertion intent.
- UI/UX decisions:
  - Rectangular per-row buttons.
  - Gray border/frame and centered gray symbol to match requested neutral style.
  - Button type set to button to avoid accidental form submit side effects.
- Accessibility and interaction notes:
  - Buttons remain explicit interactive controls in each row.
  - Keep labels and row structure stable so point ordering remains understandable.

### Tester Expert Review

- Risk areas identified:
  - Insertion order regression (new point must become index i+1).
  - Remove behavior deleting wrong index under reordering.
  - Preview mismatch between form order and map preview order.
  - Flaky E2E due to missing dev server on expected port.
- Test strategy decisions:
  - Unit coverage for insert ordering and remove correctness.
  - Unit coverage for preview insertion-index behavior in draw tool.
  - Targeted Playwright scenario for row-level + and - interactions.

### Project Architect Review

- Architectural constraints:
  - Keep component responsibilities separated:
    - edit-draw-points handles UI intent (which row was clicked)
    - facade handles FormArray insert/remove operations
    - draw-tool handles preview/geometry behavior
  - No coupling of template logic directly to Cesium internals.
- Data-flow decisions:
  - Source of truth remains ordered form points.
  - Draw tool receives insertion-anchor intent through a dedicated setter.
  - Insertion anchor is cleared after placement/removal/reset flows.

### Code Reviewer Input

- Quality findings addressed:
  - Use explicit button type in form context.
  - Avoid broad side effects by using focused setter API for preview insertion anchor.
  - Keep changes localized to feature-relevant files.

### Tech Writer Actions

- Documentation updates completed:
  - Feature requirements recorded and clarified (including visual style).
  - Multi-skill discussion and issue tracking added to this file.

## F-001 Issue Log

| ID          | Area             | Severity | Issue                                                                    | Resolution                                                                     | Owner                | Status             |
| ----------- | ---------------- | -------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | -------------------- | ------------------ |
| F001-ISS-01 | UX               | Major    | Global add button did not support row-based insertion intent             | Replaced with per-row + button                                                 | Frontend             | Resolved           |
| F001-ISS-02 | UX               | Major    | Remove control style and symbol did not match requested + / - pair style | Unified to per-row rectangular gray + / - buttons                              | Frontend             | Resolved           |
| F001-ISS-03 | Correctness      | Critical | Insert action required strict index shift semantics                      | Added indexed insert flow in facade and row-based insert method                | Frontend + Architect | Resolved           |
| F001-ISS-04 | Geometry/Preview | Critical | Preview needed to reflect insertion anchor on mouse move                 | Added insertion-anchor state and preview-position insertion logic in draw tool | Architect + Frontend | Resolved           |
| F001-ISS-05 | Reliability      | Minor    | E2E runs can fail if local server is not running on configured port      | Keep explicit server start prerequisite in test execution notes                | Tester               | Open (operational) |

## F-001 Decisions Summary

1. Accepted: Inserted polygon point starts empty (0/0).
2. Accepted: + inserts directly after clicked row.
3. Accepted: - removes only the clicked row (with minimum-point guard).
4. Accepted: + / - visual style uses neutral gray frame and centered gray symbols.
5. Accepted: Preview insertion behavior is tied to + row context through draw-tool insertion anchor.

## F-001 Formal Code Review (Code Reviewer + UI Expert)

### Review Metadata

- Date: 2026-05-26
- Review scope: F-001 implementation and follow-up UI refinements
- Reviewers:
  - Code Reviewer (SKILL_10)
  - Frontend/UI Expert (SKILL_6)

### Findings (Ordered by Severity)

| ID     | Reviewer                  | Severity | Finding                                                                                                             | Reference                                                                                                                                      | Recommendation                                                                              | Status   |
| ------ | ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------- |
| CR-001 | Code Reviewer + UI Expert | Major    | Symbol-only action buttons rely on title and do not expose explicit accessible names for assistive tech.            | src/app/components/edit-draw-points/edit-draw-points.component.html:57, src/app/components/edit-draw-points/edit-draw-points.component.html:66 | Added explicit aria-label names for insert/remove actions while preserving visible symbols. | Resolved |
| UI-001 | UI Expert                 | Minor    | The feature stylesheet still contains px-based sizing values, while project rule requires rem for size-related CSS. | src/app/components/edit-draw-points/edit-draw-points.component.scss:2                                                                          | Converted remaining size-related px values in this component stylesheet to rem.             | Resolved |
| CR-002 | Code Reviewer             | Minor    | Duplicate state reset line in draw cleanup introduces unnecessary duplication and maintainability noise.            | src/app/services/draw-tool.service.ts:889                                                                                                      | Removed duplicated assignment in cleanup path.                                              | Resolved |

### Reviewer Discussion Notes

- Code Reviewer:
  - Feature logic for ordered insertion and preview anchor behavior is coherent and test-backed.
  - Accessibility naming, cleanup deduplication, and feature-level maintainability fixes are now applied.
- UI Expert:
  - Requested visibility and sizing changes were implemented and visually aligned with user note.
  - Unit consistency requirement (rem over px) has now been applied in the feature stylesheet.

### Joint Verdict

- Verdict: Approved.
- Required before closure:
  - None.
- Recommended before closure:
  - Keep accessibility and rem-unit checks in future UI review checklist for regression prevention.

### F-002 - Saved shapes can be dragged without pre-selection

- Status: fixed-pending-proof
- Priority: high
- Linked Requirement IDs: 3.6, 3.7, 3.11, 3.12
- Current Behavior:
  - Saved shapes are draggable in edit mode, but flow commonly depends on prior selection/open-edit state.
  - Drag and selection/context-menu flows are sensitive to event ordering in map interactions.
- Expected Behavior:
  - In edit mode, user can drag a saved shape directly on pointer down + move, without selecting first and without being in open-edit state.
  - Simple click without movement remains selection behavior (no accidental drag).
  - Right-click context menu behavior remains unchanged.
  - ID-boundary rule remains intact: form sync only when dragged saved shape ID equals opened form shape ID.
- Proposed Implementation Direction:
  - Introduce explicit saved-shape drag gesture split (click vs drag threshold) in map interaction orchestration.
  - Add saved-shape drag session state with rollback-safe lifecycle.
  - Persist once on drag end and keep non-opened-shape path isolated from edit form mutation.
  - Preserve context-menu and hit-area behavior for thin geometries.
- Candidate Implementation Locations:
  - src/app/components/map/map.component.ts
  - src/app/services/draw-tool.service.ts
  - src/app/services/saved-shapes.service.ts
  - src/app/services/edit-shape-facade.service.ts
  - src/app/components/map/map.component.spec.ts
  - src/app/services/draw-tool.service.spec.ts
  - e2e/draw-bugs.spec.ts
- Proof Required:
  - Unit tests for click-vs-drag threshold and saved-shape no-preselection drag start.
  - Unit/integration tests for ID-match vs ID-mismatch sync boundary.
  - Playwright e2e for no-preselection drag (polyline and polygon minimum).
  - Regression checks for context menu and thin-hit-area interactions.
- Planned Proof Scenarios:
  - UT-DRAG-NOSELECT-001
  - UT-DRAG-THRESHOLD-002
  - IT-DRAG-ID-BOUNDARY-003
  - E2E-DRAG-NOSELECT-004
  - E2E-CM-REGRESSION-005
- Notes:
  - Feature requested on 2026-05-27.
  - Must follow TEAM-WORKFLOW phase gates and per-task approval before implementation.

## F-002 Multi-Skill Discussion Log

### Session Metadata

- Date: 2026-05-27
- Feature: F-002
- Purpose: Multi-agent planning session before implementation
- Skills involved:
  - Frontend Expert
  - Tester Expert
  - Project Architect

### Frontend Expert Review

- Recommended interaction model:
  - In edit mode, drag starts directly from saved shape pointer down + move without prior selection.
  - Click-vs-drag movement threshold is mandatory to preserve click selection behavior.
  - Drag should not open context menu; right-click flow remains separate.
- Main frontend impact:
  - map interaction orchestration and event conflict handling.
  - draw service whole-shape drag path for saved entities.
  - saved-shapes geometry mutation/persistence boundary.
  - edit-form sync guard for ID-match only.
- UX and accessibility:
  - Add clear edit-mode hint text for discoverability.
  - Keep pointer interactions deterministic for thin geometries via hit area.
  - If save fails after drag, rollback and show user-visible error.

### Tester Expert Review

- P0 behavior checks:
  - saved polyline and polygon drag without pre-selection.
  - click-only path must not move geometry.
  - ID-match vs ID-mismatch form sync boundary.
- Flake risks identified:
  - fixed timeout usage in e2e drag tests.
  - Cesium picking variance and pixel sensitivity.
  - early assertions before render/state settle.
- Stabilization guidance:
  - replace sleeps with state polling and tolerant position assertions.
  - keep deterministic reset between drag scenarios.
  - keep at least one pure user-path e2e per shape type.

### Project Architect Review

- Architectural constraints:
  - one owner for pointer-intent arbitration (select/drag/context menu).
  - preserve service boundaries; avoid pushing persistence logic into UI component.
  - enforce rollback-safe drag lifecycle and canonical picked-shape normalization.
- Recommended state flow:
  - Idle -> PointerDownCandidate -> DraggingSavedShape -> CommitPending -> (Success or RollbackOnError)
- Coupling risks to avoid:
  - dual event handlers racing between component and service.
  - form corruption when dragging non-opened saved shape.
  - multiple persistence calls during a single drag.

## F-002 Consolidated Decisions

1. Accepted: no-preselection drag is enabled only in edit mode.
2. Accepted: click-vs-drag threshold is required to prevent accidental movement.
3. Accepted: right-click context menu flow remains unchanged.
4. Accepted: ID-boundary sync rule remains mandatory (3.11).
5. Accepted: commit once on drag end, with rollback on failure.

## F-002 Small Task Queue (User Confirmation Required Per Task)

### TASK-F002-01 - Interaction contract and acceptance matrix

- Type: Frontend/Architecture
- Assigned agent: Project Architect + Frontend Expert
- Estimated effort: S (< 4h)
- Priority: High
- Dependencies: None
- Acceptance criteria:
  - [ ] Explicit click-vs-drag threshold contract documented.
  - [ ] Saved-shape drag eligibility documented (edit mode only, no preselection).
  - [ ] Context-menu coexistence rules documented.
- Required tests:
  - [ ] Unit tests: N/A (planning task)
  - [ ] Integration tests: N/A (planning task)
  - [ ] E2E (Playwright): N/A (planning task)
- Confirmation status:
  - [x] Approved by user (2026-05-27)

### TASK-F002-02 - Map interaction orchestration for no-preselection drag

- Type: Frontend
- Assigned agent: Frontend Expert
- Estimated effort: M (< 1d)
- Priority: High
- Dependencies: TASK-F002-01
- Acceptance criteria:
  - [x] In edit mode, pointer down + move on saved shape starts drag without prior selection.
  - [x] Click-only on saved shape keeps selection behavior and does not move geometry.
  - [x] Right-click path remains context-menu only.
- Required tests:
  - [ ] Unit tests: map interaction decision logic
  - [ ] Integration tests: map -> draw service drag-start routing
  - [ ] E2E (Playwright): covered in TASK-F002-06
- Confirmation status:
  - [x] Approved by user (2026-05-27)

### TASK-F002-03 - Saved-shape drag session + geometry translation path

- Type: Frontend
- Assigned agent: Frontend Expert
- Estimated effort: M (< 1d)
- Priority: High
- Dependencies: TASK-F002-02
- Acceptance criteria:
  - [x] Drag session tracks shape ID, baseline geometry, drag state, and cleanup.
  - [x] Polyline and polygon translation is consistent and visible during drag.
  - [x] Thin-shape hit area remains usable.
- Required tests:
  - [ ] Unit tests: translation and threshold branch behavior
  - [ ] Integration tests: drag session lifecycle transitions
  - [ ] E2E (Playwright): covered in TASK-F002-06
- Confirmation status:
  - [x] Approved by user (2026-05-27)

### TASK-F002-04 - Persist-on-drag-end with rollback-safe error handling

- Type: Frontend
- Assigned agent: Frontend Expert
- Estimated effort: M (< 1d)
- Priority: High
- Dependencies: TASK-F002-03
- Acceptance criteria:
  - [x] Exactly one persistence call per completed drag.
  - [x] On persistence failure, geometry rolls back to pre-drag state.
  - [x] User receives error feedback without broken drag state.
- Required tests:
  - [ ] Unit tests: commit vs rollback branches
  - [ ] Integration tests: API failure rollback path
  - [ ] E2E (Playwright): failure-path scenario (if stable in CI)
- Confirmation status:
  - [x] Approved by user (2026-05-27)

### TASK-F002-05 - ID-boundary form-sync guard enforcement

- Type: Frontend
- Assigned agent: Frontend Expert + Project Architect
- Estimated effort: S (< 4h)
- Priority: High
- Dependencies: TASK-F002-04
- Acceptance criteria:
  - [x] Dragged shape syncs edit form only when savedShapeId === formShapeId.
  - [x] Non-opened dragged saved shape does not mutate active form values.
  - [x] Existing edit/save flows remain compatible.
- Required tests:
  - [ ] Unit tests: ID-match and ID-mismatch assertions
  - [ ] Integration tests: facade sync boundary
  - [ ] E2E (Playwright): covered in TASK-F002-06
- Confirmation status:
  - [x] Approved by user (2026-05-27)

### TASK-F002-06 - Regression and feature verification pack

- Type: Testing
- Assigned agent: Tester Expert
- Estimated effort: M (< 1d)
- Priority: High
- Dependencies: TASK-F002-02, TASK-F002-03, TASK-F002-04, TASK-F002-05
- Acceptance criteria:
  - [x] Unit and integration coverage added for no-preselection drag and boundary rules.
  - [x] Playwright includes saved polyline and polygon no-preselection drag.
  - [x] Existing context-menu and drag regressions pass.
- Required tests:
  - [x] Unit tests: drag-start and threshold logic
  - [x] Integration tests: ID-boundary and rollback path
  - [x] E2E (Playwright): no-preselection drag + context-menu regression checks
- Confirmation status:
  - [x] Approved by user (2026-05-27)
