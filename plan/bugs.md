# Free Draw Tool - Bug Ledger (Planning Phase)

## Scope

This file tracks requirement violations against the canonical instructions in [plan/free-draw-details.md](plan/free-draw-details.md).

## Status Values

- open: known issue not fixed
- in-analysis: being validated and reproduced
- ready-for-fix: root cause understood and implementation-ready
- fixed-pending-proof: code fix exists but proof is incomplete
- closed: verified with required test evidence
- deferred: explicitly postponed by user decision

## Required Fields Per Bug

- ID
- Title
- Status
- Severity
- Violated Requirement IDs
- Current Behavior
- Expected Behavior
- Proposed Fix Direction
- Proof Required
- Notes

## Active Bugs

### B-016 - Typing coordinates in form does not update map in new-shape create mode

- Status: closed
- Severity: high
- Violated Requirement IDs: 2.3, 3.5
- Current Behavior: When creating a new shape (without clicking the map first), typing coordinates into the latitude/longitude inputs in the form does not update the temporary shape entity on the map. Only saving the shape causes the map to reflect the typed coordinates.
- Expected Behavior: Typing into coordinate inputs (and radius for circle) should immediately update the temporary shape on the map, provided the minimum point requirements are met: at least 1 fully-filled coordinate point for circle and text; 2 for polyline; 3 for polygon.
- Affected Scenarios: New shape creation only (existing shape edit via context menu works because positions are pre-loaded from map). Radius-only typing works when center was already set via map click.
- Proposed Fix Direction: Move `filter(() => !this._updatingFromMap)` before `debounceTime(100)` in `pointsChanges$` pipeline. Remove redundant filter from draw-tool subscriber.
- Candidate Implementation Locations:
  - src/app/services/edit-shape-facade.service.ts (pointsChanges$ pipeline)
  - src/app/services/draw-tool.service.ts (bindFormChanges)
- Proof Required:
  - Unit test: typing coordinates updates entity positions for all shape types
  - E2E test: B-016 typing in coordinate inputs updates the map immediately for circle/polyline/polygon/text (new shape flow)

#### Root Cause

The `updatingFromMap` flag guard was positioned AFTER `debounceTime(100)` in the `pointsChanges$` RxJS pipeline. Since `_updatingFromMap` is set/reset synchronously within the same call stack, by the time the async filter evaluates (100ms later), the flag is always `false`. The guard was effectively dead code.

#### Fix Implementation (2026-05-28)

**Changes:**

1. Added `filter(() => !this._updatingFromMap)` BEFORE `debounceTime(100)` in `pointsChanges$` (edit-shape-facade.service.ts)
2. Removed redundant `filter(() => !this.editShapeFacadeService.updatingFromMap)` from draw-tool.service.ts `bindFormChanges()`
3. Added `filter` import to edit-shape-facade.service.ts

**Proof:**

- Unit tests: 336/336 pass (3 new tests for pointsChanges$ filter behavior)
- E2E tests: 4 new tests for Bug 16 (circle, text, polyline, polygon) all pass
- Full E2E regression suite: 26/26 pass

- Final Decision (closed / reopened): closed
- Notes: ~3 lines changed total. Guard ownership moved from consumer (draw-tool) to producer (facade). Expert panel approved approach.

---

### B-017 — Saved shape disappears from map after CM edit open or shape-type switch

```
╔══════════════════════════════════════════════════════════════╗
║  📥 INTAKE — Work Item                                       ║
╠══════════════════════════════════════════════════════════════╣
║  Title:  Saved shape disappears after CM → Open or type-     ║
║          switch during active edit session                   ║
║  Type:          Bug                                          ║
║  Requestor:     Ariel                                        ║
║  Raw description: "When CM and open saved Text shape, the    ║
║    shape disappears from the map. Also disappears when       ║
║    choosing another shape type while editing."               ║
║  Initial priority: High                                      ║
╠══════════════════════════════════════════════════════════════╣
║  👉 Is this worth breaking down further? yes                 ║
╚══════════════════════════════════════════════════════════════╝
```

**PM intake note:** This is a data-loss-class visual bug. The user opens a shape to edit, decides to cancel (or switches to draw a new shape type), and the shape they started with is gone from the map — with no action the user can take to recover it short of toggling edit mode off and back on. For a text label tool that is used to annotate maps, invisibility of a saved label breaks the core usage loop and destroys user trust immediately. Worth fixing this sprint.

---

#### Phase 1 — Multi-Agent Planning Session

##### Step 1.1 — Problem Statement

**PM — User perspective:**

A user right-clicks (context menu) a saved Text shape, selects "Open for editing", then changes their mind and presses Cancel (or the X button). After cancelling, the text label has vanished from the map entirely. The shape is still saved in the system but it is invisible. The only recovery path is to leave and re-enter edit mode — which is non-obvious and unacceptable UX. The user's mental model is: cancel = nothing changes. The actual behaviour is: cancel = your label disappears.

This is not a text-only problem. Circle and polyline shapes have the same underlying bug — their saved entities are also hidden and never restored on cancel within an active edit session. Text is the most visible manifestation because there is no Cesium "temp entity" to visually substitute for the label while editing, so cancellation leaves nothing at all on screen.

**User need:** After cancelling or saving an edit, the saved shape must be visible on the map exactly as it was (or as it was just saved).

**Acceptance criteria:**

- [ ] Cancelling an edit of any shape type (text, circle, polyline, polygon) within an active edit session restores the saved entity to visible immediately
- [ ] Saving an edit of any shape type restores the updated saved entity to visible immediately after save completes
- [ ] Toggling edit mode is not required to restore visibility
- [ ] All existing shape lifecycle tests continue to pass

**Out of scope:** Changes to the context-menu flow or the save path itself beyond restoring entity visibility.

---

**Architect — System perspective:**

The edit-open lifecycle in `map.component.ts` currently has an asymmetric hide/show contract:

- `openShapeForEditing` → calls `savedShapesService.hideShape(dto.id)` ← **shape is hidden here**
- `toggleEditMode` (exit) → calls `savedShapesService.showAllShapes()` ← **only restore path**

There is no call to `showShape` or `showAllShapes` in the cancel-within-session or save-within-session paths. The gap has three termination branches, each of which needs coverage:

1. **Cancel within session** — user presses X/Cancel on the edit form while still in edit mode
2. **Save within session** — user presses Save while still in edit mode; after save, `clearTempEntityAfterSave` is called in `draw-tool.service.ts`, which destroys the temp entity — but the saved entity is still hidden
3. **Exit edit mode** — `toggleEditMode()` calls `showAllShapes()` which currently covers this path correctly

The shape ID that was hidden is known at the time `openShapeForEditing` is called (`dto.id`). It must be preserved and used when any of branches 1 or 2 executes.

**Components affected:**

- `src/app/components/map/map.component.ts` — owns the edit lifecycle, the hide call, and the cancel/save event handlers
- `src/app/services/draw-tool.service.ts` — `clearTempEntityAfterSave` is the save-completion hook
- `src/app/services/saved-shapes.service.ts` — owns `showShape(id)` and `showAllShapes()`

---

##### Step 1.2 — Agent Reviews

**Frontend Expert:**

The fix location is unambiguous. `map.component.ts` already holds the reference to the shape being edited (it is passed as `savedShape.shapeDto` into `openShapeForEditing`). The simplest and most Angular-idiomatic solution is to store `this.editingShapeId = dto.id` in that method, then call `this.savedShapesService.showShape(this.editingShapeId)` at the two missing termination points. No new services, no new events, no RxJS. Minimal diff.

One subtlety on the save path: `clearTempEntityAfterSave` lives in `draw-tool.service.ts` and is called from the service layer. The component should hook into the save-completion output from the edit-draw component (or the existing `isSaving` signal drop-to-false) rather than reaching into the service method directly. The `map.component.ts` already subscribes to form-level save events. That is the correct hook point.

**Tester:**

Root cause is proven by the Playwright assertion in the bug report. Test requirements:

- **Unit:** A test that calls `openShapeForEditing` (which calls `hideShape`), then calls the cancel handler, and asserts `showShape` was called with the correct ID.
- **Unit:** A test that calls `openShapeForEditing`, then triggers save-complete, and asserts `showShape` was called.
- **E2E (Playwright):** The existing failing test `test_bug_text_shape_disappears_on_cm_open.py` provides direct proof for the cancel path. Extend it to also verify the save-within-session path.
- **Regression:** Full E2E suite must stay green.

Note: the Playwright proof already exists as a confirmed-failing test — this bug is unusually well-evidenced for day-zero planning.

**Code Reviewer:**

Three concerns before implementation begins:

1. `editingShapeId` must be cleared (set to `null` / `undefined`) after it is used in both the cancel and save paths. If it is not cleared, a second cancel (e.g., start editing shape A, cancel, start editing shape B, cancel) could call `showShape` on stale IDs.
2. The `toggleEditMode` exit path already calls `showAllShapes()`. Introducing a second `showShape` call before that (if the user exits without cancelling or saving) would be a no-op — `showAllShapes` is idempotent — but the `editingShapeId` field should still be cleared to prevent double-show surprises. Consider clearing it inside `openShapeForEditing` before assigning, to handle the edge case of opening a second shape without explicitly cancelling the first.
3. Do not call `showShape` if `editingShapeId` is `undefined`/`null` — guard the call.

---

##### Step 1.3 — Architecture Proposal

**Three candidate fix options:**

**Option A — Show in cancel handler only (map.component.ts)**

- Add `this.savedShapesService.showShape(this.editingShapeId)` in the cancel event handler in `map.component.ts`.
- Does NOT cover the save-within-session path (branch 2). Incomplete.

**Option B — Show in `clearTempEntityAfterSave` (draw-tool.service.ts)**

- Add `showShape` call inside `clearTempEntityAfterSave`.
- The service does not have direct access to the "currently editing shape ID" — it would need to be injected or passed as a parameter. This couples the draw-tool service to the saved-shapes service in a direction that does not exist today, and adds a parameter to an internal method just to propagate a visual side-effect. Does NOT cover the cancel path (branch 1). Incomplete, and architecturally muddier.

**Option C (ORIGINALLY VOTED — SUPERSEDED, see Revision below) — Track `editingShapeId` in `map.component.ts`; restore from both cancel and save-complete paths**

Implementation:

1. Add `private editingShapeId: string | undefined` field to `map.component.ts`.
2. In `openShapeForEditing`: set `this.editingShapeId = dto.id` (before calling `hideShape`).
3. Add a private helper `restoreEditingShape()`:
   ```typescript
   private restoreEditingShape(): void {
     if (this.editingShapeId) {
       this.savedShapesService.showShape(this.editingShapeId);
       this.editingShapeId = undefined;
     }
   }
   ```
4. Call `restoreEditingShape()` from the **cancel handler** and the **save-complete handler**.
5. In `toggleEditMode` (exit path): clear `this.editingShapeId = undefined`.

**Why Option C over A or B:**

- Option A misses the save path.
- Option B misses the cancel path and introduces wrong-layer coupling.
- Option C is the only option that closes all three branches at the time of initial analysis.

⚠️ **NOTE: Option C is superseded by Option D.** An additional trigger was discovered (shape-type switch also causes the disappearance) and a simpler architectural fix was identified. See **Revision — Option D** below.

---

##### ⚠️ Revision — Expanded Root Cause and New Fix Direction (2026-06-22)

**Additional trigger discovered (Ariel):**
The shape also disappears when the user selects a different draw-type button while a saved shape edit session is open. When a new draw type is selected, `startDrawing` is called in `DrawToolService`, which destroys the current temp entity and creates a new one. The saved shape is still hidden from the earlier `hideShape` call in `openShapeForEditing` — it was never restored.

This means the hide/show contract has at least **four escape routes** where `showShape` is never called:

1. Cancel within session
2. Save within session
3. Switch draw type while editing
4. Open a second saved shape without explicit cancel

Option C attempts to chase these escape routes reactively with a tracking field. The user has identified that this approach is fragile — any new code path that ends an edit session without going through `restoreEditingShape()` re-introduces the bug.

**Root cause (revised):**
The `hideShape(dto.id)` call in `openShapeForEditing` is the fundamental problem. The saved entity is hidden proactively to prevent visual duplication with the temp entity. But the hide/show lifecycle is impossible to keep in sync with all the ways an edit session can end.

**Proposed fix — Option D (new recommendation): Remove `hideShape` from `openShapeForEditing`**

Instead of hiding the saved entity and trying to restore it, **never hide it**. The temp entity created by `DrawToolService` overlaps the saved entity during editing. This is visually acceptable (the temp entity renders on top). On any termination path — cancel, save, type-switch, mode-exit — the saved entity was never hidden and therefore remains visible without any additional code.

Implementation (single change):

- In `src/app/components/map/map.component.ts`, `openShapeForEditing`: **remove** the `hideShape` call and its guard:
  ```typescript
  // REMOVE these lines:
  if (dto.id) {
    this.savedShapesService.hideShape(dto.id);
  }
  ```

The `showAllShapes()` call in `toggleEditMode` can also be removed (or kept for safety — it becomes a no-op if nothing is hidden).

**Why Option D over Option C:**

| Criterion                   | Option C                            | Option D                                |
| --------------------------- | ----------------------------------- | --------------------------------------- |
| Lines of new code           | ~10 (field + helper + 3 call sites) | **-3 (deletion only)**                  |
| Escape-route risk           | Chases all exit paths (fragile)     | **None — saved entity never hidden**    |
| Shape-type switch fixed     | ❌ Requires yet another call site   | ✅ Fixed for free                       |
| Save-within-session fixed   | ✅                                  | ✅                                      |
| Cancel-within-session fixed | ✅                                  | ✅                                      |
| Duplicate-open edge case    | Requires stale-ID guard             | **No state to manage**                  |
| Visual during editing       | No duplication (entity hidden)      | Temp entity overlaps saved (acceptable) |

**Components affected:**

- `src/app/components/map/map.component.ts` — remove `hideShape` call
- `src/app/services/saved-shapes.service.ts` — no changes (keep `hideShape`/`showShape` API for future use)
- `src/app/services/draw-tool.service.ts` — no changes

**New components:** None

**API/DB/Infrastructure changes:** None

**Security considerations:** None.

---

##### Step 1.4 — Vote (Initial)

**Fix options at initial analysis:**

| Option | Description                                                 | Completeness                               |
| ------ | ----------------------------------------------------------- | ------------------------------------------ |
| A      | showShape in cancel handler only                            | Partial (misses save path)                 |
| B      | showShape in clearTempEntityAfterSave only                  | Partial (misses cancel path) + wrong layer |
| C      | Track editingShapeId, restoreEditingShape() from both paths | Complete at time of vote                   |

**Votes for Option C (initial):**

| Agent         | Votes | Rationale                                                                          |
| ------------- | ----- | ---------------------------------------------------------------------------------- |
| Architect     | 3     | Only complete option; minimal diff; correct ownership in map.component.ts          |
| PM            | 1     | Covers both user-visible failure scenarios (cancel and save)                       |
| Frontend      | 1     | No new dependencies; idiomatic component-level field; trivial to test              |
| Tester        | 1     | Both paths are testable at unit and E2E level with zero test infrastructure change |
| Code Reviewer | 1     | DRY helper method; clear ownership; stale-ID risk addressed by field clear         |

**Option C total: 7 effective votes → threshold (5) met → initially APPROVED**

> ⚠️ **Superseded by Option D** after additional trigger discovered (2026-06-22). See Revision section above.

##### Step 1.5 — Re-vote (Option D)

**All original voters re-assessed with expanded scope:**

| Agent         | Vote  | Rationale                                                                                                                                                                                                                  |
| ------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architect     | D (3) | Option D eliminates the fragile hide/show contract entirely. A deletion is safer and more robust than tracking escape routes. Aligns with Req 3.6 — the saved entity must remain accessible at all times during edit mode. |
| PM            | D (1) | Fixes the cancel path, the save path, the type-switch path, and any future path for free. No new state to reason about.                                                                                                    |
| Frontend      | D (1) | Removing 3 lines of code with no replacement is the best possible diff. Temporary visual overlap during editing is acceptable and consistent with how other shape types behave.                                            |
| Tester        | D (1) | The existing Playwright proof test will confirm the fix. No additional escape-route-specific tests needed beyond regression.                                                                                               |
| Code Reviewer | D (1) | Deletion eliminates the stale-ID risk, the double-open edge case, and all future drift. Strongly preferred over reactive tracking.                                                                                         |

**Option D total: 7 effective votes → threshold (5) met → APPROVED**

---

#### Bug Record

- ID: B-017
- Title: Saved shape disappears from map after CM edit open or shape-type switch
- Status: ready-for-fix
- Severity: High
- Violated Requirement IDs: 3.6, 3.10
- Current Behavior: When a user opens any saved shape for editing via the context menu, `openShapeForEditing()` calls `savedShapesService.hideShape(dto.id)`. The shape then becomes permanently invisible within the current edit session under three conditions: (1) the user cancels the edit (presses X/Cancel while still in edit mode); (2) the user completes a save while remaining in edit mode (temp entity cleared but saved entity stays hidden); (3) the user selects a different shape-type button while the saved shape's edit form is open (`startDrawing` replaces the temp entity without restoring the saved shape). The only recovery path in all three cases is a full edit-mode toggle, which is non-obvious to users. Text shapes are most visibly broken because the temp entity that overlaps during editing provides no visual substitute after it is destroyed.
- Expected Behavior: Saved shape entities must never be hidden during an edit session. The temp entity created by `DrawToolService` visually overlaps the saved entity during editing, which is acceptable. On any termination (cancel, save, type-switch, mode-exit), the saved entity remains visible without any restoration logic.
- Affected Shape Types: All (text, circle, polyline, polygon). Text is most obvious.
- Proposed Fix Direction: **Option D** — remove the `hideShape(dto.id)` call and its guard from `openShapeForEditing()` in `map.component.ts`. The saved entity is never hidden; therefore it never needs to be restored. The `DrawToolService` is **not** responsible for hiding saved shapes. No tracking field, no helper method, no new call sites.
- Candidate Implementation Locations:
  - `src/app/components/map/map.component.ts` — remove `hideShape` call from `openShapeForEditing` (~3 lines deleted)
  - `src/app/services/saved-shapes.service.ts` — no changes
  - `src/app/services/draw-tool.service.ts` — no changes
- Proof Required:
  - E2E (Playwright): `test_bug_text_shape_disappears_on_cm_open.py` must go from CONFIRMED FAILING to PASS (cancel path)
  - E2E (Playwright): add test for shape-type-switch path — open saved shape, select a different draw type button, assert saved entity is still visible
  - E2E (Playwright): add test for save-within-session path — open saved shape, save, assert saved entity is visible without toggling edit mode
  - Full TS unit suite and full E2E regression suite must remain green
- Playwright Proof: `e2e/test_bug_text_shape_disappears_on_cm_open.py` — **CONFIRMED FAILING** (cancel path)

#### Branch

`fix/b-017-text-shape-disappears-after-cm-open`

---

## Phase 4 Prioritization

Priority P0 (execute first):

1. B-001
2. B-002
3. B-003

Priority P1:

1. B-004
2. B-006
3. B-007

Priority P2:

1. B-005
2. B-008
3. B-009
4. B-010

## Phase 4 Status Tracking Fields

Add these fields when execution starts:

- Repro Scenario ID
- Fix Commit/Change Ref
- Proof Scenario Results
- Regression Pack Results
- Reviewer Notes
- Final Decision (closed / reopened)

### B-001 - Map click does not populate form coordinates consistently

- Status: closed
- Severity: high
- Violated Requirement IDs: 3.7, 2.3
- Current Behavior: clicking on map does not always write coordinates to the corresponding form point fields.
- Expected Behavior: every accepted click/drag update writes to the correct points controls in edit form scope.
- Proposed Fix Direction: validate click/drag event pipeline and point index mapping to facade updates.
- Candidate Implementation Locations:
  - src/app/services/draw-tool.service.ts (handleClick, emitPositionChanges, emitDraggedVertexChange)
  - src/app/services/edit-shape-facade.service.ts (patchPointsFromMapLocations, updatePoint, updatingFromMap)
  - src/app/components/edit-draw-points/edit-draw-points.component.html (shape point bindings)
- Proof Required: unit tests for per-shape point population and e2e interaction proof.
- Planned Proof Scenarios:
  - IT-SYNC-007
  - IT-SYNC-008
  - E2E-SYNC-012
- Repro Scenario ID: Draw Tool Bugs :: Bug 1: Polyline drag and drop should update point coordinates
- Fix Commit/Change Ref: local working tree change in src/app/services/draw-tool.service.ts (whole-shape drag sync branch)
- Proof Scenario Results:
  - npm test -- --watch=false --browsers=ChromeHeadless --include src/app/services/draw-tool.service.spec.ts => PASS
  - npx playwright test e2e/draw-bugs.spec.ts -g "Bug 1" --reporter=line => PASS (3/3)
  - npm test -- --watch=false --browsers=ChromeHeadless --include src/app/services/draw-tool.service.spec.ts => PASS (57/57)
  - npx playwright test e2e/draw-bugs.spec.ts -g "Bug 1:|Bug 3: Clicking should populate coordinates in the form" --reporter=line => PASS (3/3)
- Regression Pack Results:
  - RP-CORE partial (targeted): PASS for impacted drag/sync coverage
- Reviewer Notes:
  - whole-shape drag now syncs form points during active draw/edit mode even when sync flag was not explicitly set in the drag path.
- Final Decision (closed / reopened): closed
- Notes: repeatedly reported in history.

### B-002 - Polyline/polygon drag not syncing as required

- Status: closed
- Severity: high
- Violated Requirement IDs: 3.6, 3.7, 3.11
- Current Behavior: whole-shape drag behavior is inconsistent; form sync and non-edit autosave boundaries are unclear in current behavior.
- Expected Behavior: obey 3.11 boundary exactly using ID-based declaration.
- Saved shape edit mode declaration:
  - form shape ID exists,
  - saved shape ID exists,
  - and form shape ID === saved shape ID.
- Proposed Fix Direction: separate drag flows by ID match.
  - temp shape: sync to form.
  - saved shape in edit form (ID match): sync to form.
  - saved shape not in edit form (ID mismatch): auto-save path without form update.
- Candidate Implementation Locations:
  - src/app/services/draw-tool.service.ts (isDraggingWholeShape, syncWholeShapeDragToForm, emitPendingGeometryOverride)
  - src/app/components/map/map.component.ts (selection/edit opening path for saved entities)
  - src/app/services/edit-shape-facade.service.ts (pending geometry override and save conversion)
- Proof Required: scenario tests for temp, saved-in-edit, and saved-not-in-edit cases.
- Planned Proof Scenarios:
  - IT-DRAG-002
  - IT-DRAG-003
  - IT-DRAG-004
  - E2E-DRAG-008
- Repro Scenario ID: Draw Tool Bugs :: Bug 1 (polyline/polygon drag), Regression saved polyline drag in edit mode
- Fix Commit/Change Ref: local working tree change in src/app/services/draw-tool.service.spec.ts (explicit ID-match vs ID-mismatch drag branch tests)
- Proof Scenario Results:
  - npm test -- --watch=false --browsers=ChromeHeadless --include src/app/services/draw-tool.service.spec.ts => PASS (53/53)
  - npx playwright test e2e/draw-bugs.spec.ts -g "Saved polyline should be draggable in edit mode|Polygon drag and drop should update point coordinates|Polyline drag and drop should update point coordinates" --reporter=line => PASS (3 targeted scenarios; tool execution ran broader suite and all 15 passed)
- Regression Pack Results:
  - RP-CORE targeted drag/sync pack: PASS
- Reviewer Notes:
  - Added explicit unit proof for requirement 3.11 boundary:
    - saved-shape ID equals form ID => drag syncs to form
    - saved-shape ID mismatch => no form sync, pending geometry override used for save conversion
- Final Decision (closed / reopened): closed
- Notes: user explicitly clarified rule in 3.11.

### B-003 - Style controls not reliably affecting form and rendered entities

- Status: closed
- Severity: high
- Violated Requirement IDs: 3.8, 2.1
- Current Behavior: color/line type/line width changes may fail to apply to select state and visible entity.
- Expected Behavior: style controls remain synchronized between form state and Cesium render state.
- Proposed Fix Direction: validate ControlValueAccessor flow and style subscription propagation path.
- Candidate Implementation Locations:
  - src/app/components/style-input/style-input.component.ts (CVA writeValue/onOptionSelected)
  - src/app/components/edit-draw/edit-draw.component.html (formControl bindings)
  - src/app/services/draw-tool.service.ts (bindFormChanges/updateStyle/getPolylineMaterial)
- Proof Required: unit tests for control update propagation + e2e visual state checks.
- Planned Proof Scenarios:
  - IT-SYNC-009
  - UT-ARCH-001
  - E2E-SYNC-012
- Repro Scenario ID: Draw Tool Bugs :: Bug 5: Color option should affect the shape entity
- Fix Commit/Change Ref: local working tree changes in src/app/services/draw-tool.service.spec.ts and e2e/draw-bugs.spec.ts
- Proof Scenario Results:
  - npm test -- --watch=false --browsers=ChromeHeadless --include src/app/services/draw-tool.service.spec.ts --include src/app/components/style-input/style-input.component.spec.ts => PASS (58/58)
  - npx playwright test e2e/draw-bugs.spec.ts -g "Bug 5: Color option should affect the shape entity" --reporter=line => PASS (1/1)
- Regression Pack Results:
  - RP-STYLE targeted pack: PASS
- Reviewer Notes:
  - Added explicit unit assertions that style updates re-render polyline entity and apply changed circle outline width.
  - Strengthened Bug 5 E2E to assert form value, draw-service style state, and rendered entity color are synchronized.
- Final Decision (closed / reopened): closed
- Notes: repeated historical reports.

### B-004 - Missing preview/vertex behavior for line and polygon flows

- Status: closed
- Severity: medium
- Violated Requirement IDs: 3.4, 3.5
- Current Behavior: preview point/segment behavior and editable vertex aids are intermittently missing.
- Expected Behavior: preview and vertex edit handles are visible and usable in drawing/editing flow.
- Proposed Fix Direction: verify preview state transitions and vertex entity lifecycle.
- Candidate Implementation Locations:
  - src/app/services/draw-tool.service.ts (previewPosition, getDisplayPolylinePositions, getDisplayPolygonPositions, syncVertexEntities)
  - src/app/services/saved-shapes.service.ts (saved vertex rendering separation)
- Proof Required: deterministic interaction tests and map-state assertions.
- Planned Proof Scenarios:
  - UT-DRAW-004
  - UT-DRAW-005
  - UT-DRAW-006
  - E2E-SYNC-013
- Repro Scenario ID: Draw Tool Bugs :: Bug 1 & 2: Polyline preview points should display on map after clicking
- Fix Commit/Change Ref: local working tree change in src/app/services/draw-tool.service.spec.ts (added explicit preview and vertex lifecycle tests)
- Proof Scenario Results:
  - npm test -- --watch=false --browsers=ChromeHeadless --include src/app/services/draw-tool.service.spec.ts => PASS (60/60)
  - npx playwright test e2e/draw-bugs.spec.ts -g "Bug 1 & 2: Polyline preview points should display on map after clicking" --reporter=line => PASS (1/1)
- Regression Pack Results:
  - RP-CORE targeted preview/drag pack: PASS
- Reviewer Notes:
  - Added explicit unit assertions for preview position rendering in unfinished polyline display output.
  - Added explicit unit assertions for vertex entity lifecycle (creation and cleanup) for editable line/polygon flows.
  - Added explicit unit assertions that unfinished polygon display path returns closed ring positions while including preview point.
- Final Decision (closed / reopened): closed
- Notes: reported as not fixed in repeated bug reports.

### B-005 - Context menu and edit-mode gating inconsistencies

- Status: closed
- Severity: medium
- Violated Requirement IDs: 1.1, 1.2, 1.3, 3.12
- Current Behavior: context menu and selection behavior do not consistently follow mode and mouse-button rules.
- Expected Behavior: right-click only CM with expected availability in edit mode as clarified.
- Proposed Fix Direction: centralize mode gate checks and right-click event conditions.
- Candidate Implementation Locations:
  - src/app/components/map/map.component.ts (canInteractWithSavedShapes, left/right click handlers)
  - src/app/components/shape-context-menu/shape-context-menu.component.ts (close/edit/delete emit flow)
- Proof Required: e2e tests for view mode vs edit mode, left vs right click behavior.
- Planned Proof Scenarios:
  - E2E-CM-005
  - E2E-CM-006
  - E2E-CM-007
- Repro Scenario ID: Draw Tool Bugs :: Right click should open CM for thin saved polyline/polygon via invisible hit area
- Fix Commit/Change Ref: no runtime code change; behavior verified with existing gating/fallback implementation and refreshed proof
- Proof Scenario Results:
  - npm test -- --watch=false --browsers=ChromeHeadless --include src/app/components/map/map.component.spec.ts => PASS (48/48)
  - npx playwright test e2e/draw-bugs.spec.ts -g "Right click should open CM for thin saved polyline|Right click should open CM for thin saved polygon" --reporter=line => PASS (2/2)
- Regression Pack Results:
  - RP-CM targeted context-menu pack: PASS
- Reviewer Notes:
  - Unit coverage confirms left-click selection path does not open context menu and right-click path opens it.
  - E2E coverage confirms right-click opening works for thin saved polyline and polygon via hit-area/fallback path.
- Final Decision (closed / reopened): closed
- Notes: includes historical corrections from user.

### B-006 - Cancel behavior mismatch in create flow

- Status: closed
- Severity: medium
- Violated Requirement IDs: 2.5, 5.3
- Current Behavior: cancel in create mode does not always reset form and remove temp shape as required.
- Expected Behavior: unsaved create flow cancel returns to default/minimum and clears temp map artifact.
- Proposed Fix Direction: split cancel paths by saved-state presence and active temp entity state.
- Candidate Implementation Locations:
  - src/app/components/edit-draw/edit-draw.component.ts (cancel)
  - src/app/services/draw-tool.service.ts (clearTempEntityAfterSave, cleanup/cancelDrawing)
  - src/app/services/edit-shape-facade.service.ts (revertToLastSaved, resetForm, clearSavedState)
- Proof Required: unit tests + e2e for create mode cancel scenarios.
- Planned Proof Scenarios:
  - IT-FORM-007
  - IT-FORM-008
  - IT-CANCEL-006
- Repro Scenario ID: Draw Tool Bugs :: Regression: Cancel in create mode should reset form and clear temp circle
- Fix Commit/Change Ref: no runtime code change; behavior verified with refreshed unit/e2e proof
- Proof Scenario Results:
  - npm test -- --watch=false --browsers=ChromeHeadless --include src/app/components/edit-draw/edit-draw.component.spec.ts => PASS (45/45)
  - npx playwright test e2e/draw-bugs.spec.ts -g "Cancel in create mode should reset form and clear temp circle" --reporter=line => PASS (1/1)
- Regression Pack Results:
  - RP-FORM targeted cancel/create pack: PASS
- Reviewer Notes:
  - Unit coverage validates cancel path split by saved-state and confirms temp-shape cleanup path is invoked for create flow.
  - E2E coverage validates unsaved create cancel returns coordinate form fields to default state.
- Final Decision (closed / reopened): closed
- Notes: explicitly reported near latest history.

### B-007 - Saved shape and temp shape lifecycle collisions

- Status: closed
- Severity: medium
- Violated Requirement IDs: 3.10, 5.4
- Current Behavior: second save/edit flow may overwrite wrong shape or leak temporary state into saved entities.
- Expected Behavior: strict separation between saved datasource entities and temp editing artifacts.
- Proposed Fix Direction: enforce identity mapping and safe save target checks.
- Candidate Implementation Locations:
  - src/app/services/edit-shape-facade.service.ts (markAsSaved, toShapeDto, hasUnsavedChanges)
  - src/app/components/map/map.component.ts (openShapeForEditing hide/show behavior)
  - src/app/services/saved-shapes.service.ts (addShape/updateShape/removeShape)
- Proof Required: multi-save regression tests and identity assertions.
- Planned Proof Scenarios:
  - IT-LIFE-007
  - E2E-SAVE-008
  - IT-LIFE-010
  - IT-LIFE-011
- Repro Scenario ID: Draw Tool Bugs :: Saved text shape should reopen with saved coordinates; Reopened text drag should update form coordinates
- Fix Commit/Change Ref: no runtime code change; lifecycle/identity behavior verified with refreshed unit/e2e proof
- Proof Scenario Results:
  - npm test -- --watch=false --browsers=ChromeHeadless --include src/app/services/edit-shape-facade.service.spec.ts --include src/app/services/saved-shapes.service.spec.ts --include src/app/components/map/map.component.spec.ts => PASS (114/114)
  - npx playwright test e2e/draw-bugs.spec.ts -g "Saved text shape should reopen with saved coordinates|Reopened text drag should update form coordinates" --reporter=line => PASS (2/2)
- Regression Pack Results:
  - RP-LIFECYCLE targeted save/edit identity pack: PASS
- Reviewer Notes:
  - Unit coverage validates saved-shape marking, DTO conversion, and saved-shape open/edit lifecycle behavior without temp-shape collisions.
  - E2E coverage validates reopen path preserves saved coordinates and subsequent drag updates the reopened form state.
- Final Decision (closed / reopened): closed
- Notes: repeated in history.

### B-008 - Draw mode cursor and draw-type persistence not fully verified

- Status: in-analysis
- Severity: medium
- Violated Requirement IDs: 1.6, 1.7
- Current Behavior: draw mode class exists, but explicit crosshair cursor and strict draw-type persistence behavior are not yet proven.
- Expected Behavior: crosshair appears for map drawing operations; selected draw type persists until user changes draw option.
- Proposed Fix Direction: validate CSS cursor contract and startDrawing/toggle flow state transitions.
- Candidate Implementation Locations:
  - src/app/components/map/map.component.ts
  - src/app/components/map/map.component.html
  - src/app/components/map/map.component.scss
- Proof Required: e2e checks for cursor behavior and draw-type persistence transitions.
- Planned Proof Scenarios:
  - E2E-CURSOR-008
  - E2E-MODE-006
  - IT-MODE-003
- Notes: added from phase-2 traceability audit.

### B-009 - Save enable criteria may under-constrain mandatory fields

- Status: in-analysis
- Severity: medium
- Violated Requirement IDs: 2.4
- Current Behavior: save enablement is based primarily on unsaved-changes flag; explicit mandatory-field validity constraints require verification.
- Expected Behavior: save is disabled unless mandatory fields are valid, including required coordinate/altitude conditions.
- Proposed Fix Direction: evaluate canSave rule and validators against per-shape mandatory field policy.
- Candidate Implementation Locations:
  - src/app/components/edit-draw/edit-draw.component.ts (canSave)
  - src/app/services/edit-shape-facade.service.ts (form validators and DTO conversion)
  - src/app/components/edit-draw/edit-draw.component.html (save button disabled expression)
- Proof Required: unit tests for per-shape validity gates.
- Planned Proof Scenarios:
  - UT-FORM-006
  - IT-FORM-005
  - E2E-FORM-009
- Notes: added from requirement alignment audit.

### B-010 - Tool-button-only reset semantics need explicit conformance check

- Status: in-analysis
- Severity: medium
- Violated Requirement IDs: 1.8
- Current Behavior: multiple code paths reset draw state; strict requirement says full reset/destruction should follow tool-button exit flow.
- Expected Behavior: reset/destruction semantics are consistent with instruction boundary.
- Proposed Fix Direction: map all reset entry points and enforce allowed path behavior.
- Candidate Implementation Locations:
  - src/app/components/map/map.component.ts (toggleEditMode/startDrawing)
  - src/app/services/draw-tool.service.ts (cancelDrawing/cleanup)
- Proof Required: state-transition tests for exit/edit toggles.
- Planned Proof Scenarios:
  - IT-MODE-002
  - E2E-MODE-007
  - IT-MODE-003
- Notes: added from requirement alignment audit.

### B-011 - Polygon insertion index regression when loading points from form

- Status: closed
- Severity: medium
- Violated Requirement IDs: 2.3, 3.4, 3.7
- Current Behavior: after loading polygon points from form, click insertion at selected row index may not insert at the intended position and insertion anchor may not clear as expected.
- Expected Behavior: selected insertion anchor (index i) inserts clicked point at i+1, form reflects inserted coordinate at that index, and insertion anchor resets to null after insertion.
- Proposed Fix Direction: keep load-from-form path behavior consistent with reactive form-change path by reusing placeholder-aware position replacement logic.
- Candidate Implementation Locations:
  - src/app/services/draw-tool.service.ts (loadPositionsFromForm, replacePositionsFromForm)
  - src/app/services/draw-tool.service.spec.ts (insertion-index regression coverage)
- Proof Required: targeted unit regression test pass and no failure in related component/service suite.
- Planned Proof Scenarios:
  - UT-POLY-INSERT-001
  - UT-POLY-PREVIEW-001
- Repro Scenario ID: DrawToolService Regression :: should insert polygon click location at selected insertion index
- Fix Commit/Change Ref: local working tree change in src/app/services/draw-tool.service.ts (loadPositionsFromForm now routes through replacePositionsFromForm)
- Proof Scenario Results:
  - npm test -- --watch=false --browsers=ChromeHeadless --include src/app/components/edit-draw-points/edit-draw-points.component.spec.ts --include src/app/services/draw-tool.service.spec.ts => PASS (78/78)
  - npm test -- --watch=false --browsers=ChromeHeadless --include src/app/components/edit-draw-points/edit-draw-points.component.spec.ts --include src/app/services/draw-tool.service.spec.ts => PASS (81/81)
- Regression Pack Results:
  - RP-CORE targeted unit pack: PASS
- Reviewer Notes:
  - Root cause was behavior drift between two form-to-positions paths:
    - loadPositionsFromForm copied raw points directly,
    - pointsChanges subscription used placeholder-aware replacement.
  - Unifying these paths removed the insertion-index inconsistency.
- Final Decision (closed / reopened): closed
- Notes: discovered during post-review follow-up verification for F-001.

### B-012 - Save button enabled when opening unchanged saved shape from context menu

- Status: closed
- Severity: medium
- Violated Requirement IDs: 2.4, 2.5, 5.3
- Current Behavior: when opening a saved shape via context menu (CM), Save is enabled even though no user change occurred.
- Expected Behavior: opening a saved shape with no edits keeps Save disabled, and after clicking Cancel, Save should be disabled.
- Proposed Fix Direction: align unsaved-change baseline/snapshot state during open-from-CM flow and after cancel-revert flow so save enablement is strictly gated by real changes.
- Candidate Implementation Locations:
  - src/app/components/map/map.component.ts (openShapeForEditing flow)
  - src/app/services/edit-shape-facade.service.ts (markAsSaved, hasUnsavedChanges, revertToLastSaved)
  - src/app/components/edit-draw/edit-draw.component.ts (canSave, cancel)
  - src/app/components/edit-draw/edit-draw.component.html (save disabled binding)
- Proof Required: unit + integration + e2e evidence for open-saved-without-change and post-cancel save-disable behavior.
- Planned Proof Scenarios:
  - UT-FORM-006
  - IT-FORM-008
  - E2E-FORM-010
- Fix Commit/Change Ref: local working tree update in e2e/draw-bugs.spec.ts (stabilized open-saved-shape helper and B-012 selector/assertion path for deterministic proof).
- Proof Scenario Results:
  - npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/components/edit-draw/edit-draw.component.spec.ts => PASS (46/46)
  - npx playwright test e2e/draw-bugs.spec.ts -g "Save should stay disabled when opening unchanged saved shape and after cancel" --reporter=line => PASS (1/1)
- Regression Pack Results:
  - RP-B012 targeted regression pack: PASS
- Reviewer Notes:
  - The save-disable expectation for open-without-change and post-cancel is now covered by both unit and e2e checks.
  - E2E helper was hardened to avoid false negatives from non-deterministic edit-mode activation/change-detection timing.
- Final Decision (closed / reopened): closed
- Notes: user-reported scenario: open saved shape with CM -> Save should be disabled; Cancel should disable Save as well.

### B-013 - Circle not draggable in edit mode with required form sync boundary

- Status: closed
- Severity: high
- Violated Requirement IDs: 3.6, 3.7, 3.11, 3.13
- Current Behavior: circle shape is not draggable in edit mode.
- Expected Behavior: circle is draggable in edit mode; drag-to-form synchronization follows requirement 3.11 boundary (sync for temp shape or saved shape currently opened in edit form, no form sync for saved shape not in edit form).
- Proposed Fix Direction: restore/verify circle drag pick and drag lifecycle path, then enforce 3.11 ID-based sync branching for circle drag updates.
- Candidate Implementation Locations:
  - src/app/services/draw-tool.service.ts (handleMouseDown/handleMouseMove/handleMouseUp, canDragWholeShape, syncWholeShapeDragToForm)
  - src/app/components/map/map.component.ts (selection/edit-open path for saved circles)
  - src/app/services/edit-shape-facade.service.ts (form update path for dragged circle center)
- Proof Required: deterministic unit/integration tests for circle drag state and ID-based sync boundary, plus e2e drag proof.
- Planned Proof Scenarios:
  - IT-DRAG-002
  - IT-DRAG-003
  - IT-DRAG-004
  - E2E-DRAG-009
- Fix Commit/Change Ref: local working tree updates in src/app/services/draw-tool.service.ts and tests in src/app/services/draw-tool.service.spec.ts + e2e/draw-bugs.spec.ts.
- Proof Scenario Results:
  - npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/services/draw-tool.service.spec.ts => PASS (61/61)
  - npx playwright test e2e/draw-bugs.spec.ts -g "Reopened saved circle should drag even when mouse-down map pick misses" --reporter=line => PASS (1/1)
- Regression Pack Results:
  - RP-B013 targeted drag regression: PASS
- Reviewer Notes:
  - Root cause was drag-start gating requiring a non-null map pick position on mouse-down even when the temp circle entity was already picked.
  - Fix uses the existing circle center as drag anchor when entity pick succeeds but map-position pick is unavailable, preserving 3.11 sync behavior in mouse-move.
- Final Decision (closed / reopened): closed
- Notes: user reported circle drag is fully blocked in edit mode and explicitly requested conformance to requirement 3.11.

### B-014 - Dragging saved circle creates unintended temp circle

- Status: closed
- Severity: high
- Violated Requirement IDs: 3.10, 3.11, 5.4
- Current Behavior: after drawing and saving a circle, dragging the saved circle also starts a new temp circle draw path.
- Expected Behavior: dragging the saved circle should only move the saved circle; no new temp circle should be created.
- Proposed Fix Direction: add a draw-service mouse-down guard so non-temp picked entities do not start temp circle creation, while keeping saved-shape drag as the sole owner for saved entities.
- Candidate Implementation Locations:
  - src/app/services/draw-tool.service.ts (handleMouseDown, setupMouseHandlers)
  - src/app/services/saved-shapes-map-operations.service.ts (startDragCandidate, updateDrag, finishDrag)
  - src/app/components/map/map.component.ts (bindDragInputActions wiring validation)
- Proof Required: targeted unit/integration drag-boundary checks plus E2E scenario proving no temp circle side effect.
- Planned Proof Scenarios:
  - UT-DRAG-014
  - UT-DRAG-015
  - IT-DRAG-007
  - IT-DRAG-008
  - E2E-DRAG-010
  - E2E-DRAG-011
- Fix Commit/Change Ref: local working tree updates in src/app/services/draw-tool.service.ts, src/app/services/draw-tool.service.spec.ts, src/app/services/saved-shapes-map-operations.service.spec.ts, and e2e/draw-bugs.spec.ts.
- Proof Scenario Results:
  - npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/services/draw-tool.service.spec.ts --include=src/app/services/saved-shapes-map-operations.service.spec.ts --include=src/app/components/map/map.component.spec.ts => PASS (119/119)
  - PLAYWRIGHT_BASE_URL=http://localhost:40141 npx playwright test e2e/draw-bugs.spec.ts -g "Saved circle drag should not start a new temp circle" --reporter=line => PASS (1/1)
  - PLAYWRIGHT_BASE_URL=http://localhost:40141 npx playwright test e2e/draw-bugs.spec.ts -g "Saved circle drag should not start a new temp circle|Reopened saved circle should drag even when mouse-down map pick misses" --reporter=line => PASS (2/2)
- Regression Pack Results:
  - RP-DRAG targeted circle pack: PASS
- Reviewer Notes:
  - Root cause was draw-service circle mouse-down path starting temp-circle creation for non-temp picked entities while saved-shape drag flow handled the same gesture.
  - Added guard in draw-service mouse-down so non-temp entity picks are ignored by temp-circle start path; saved-shape operations remain the drag owner for saved entities.
  - Added explicit unit and e2e coverage for the user-reported scenario and circle drag non-regression path.
- Final Decision (closed / reopened): closed
- Notes: user-reported regression scenario: choose circle draw tool -> draw and save circle -> drag saved circle -> temp circle appears unexpectedly.

### B-015 - Save button disabled after drawing circle on map

- Status: closed
- Severity: high
- Violated Requirement IDs: 2.4, 3.7
- Current Behavior: After choosing circle draw tool, clicking to set center, and dragging to set radius, save button remains disabled.
- Expected Behavior: Save button should be enabled after drawing a valid circle with non-zero center coordinates and radius.
- Proposed Fix Direction: Use signal-based approach (Angular 16+): Add `unsavedChangesSignal` to EditShapeFacadeService, update signal after form mutations, convert `canSave` to computed signal in component. This aligns with existing signal usage (isSaving, saveError) and OnPush rollout.
- Candidate Implementation Locations:
  - src/app/services/edit-shape-facade.service.ts (add unsavedChangesSignal, refreshUnsavedChanges method)
  - src/app/components/edit-draw/edit-draw.component.ts (convert canSave to computed signal)
  - src/app/components/edit-draw/edit-draw.component.html (update save button binding)
- Proof Required: unit test for signal update after map-driven mutations, E2E test for save button enablement after drawing all shape types.
- Planned Proof Scenarios:
  - UT-SAVE-015
  - IT-SAVE-008
  - E2E-SAVE-009

#### Expert Discussion (2026-05-28)

**Frontend Expert Assessment:**

- Root cause validated: OnPush + `emitEvent: false` + getter-based `canSave` = no template update
- All shapes affected (Circle, Polyline, Polygon, Text) - same `patchPointsFromMapLocations` flow
- Recommended: Signal-based approach with `unsavedChangesSignal` and `refreshUnsavedChangesSignal()` calls
- Implementation: Add signal to facade service, use signal in component's `canSave` getter

**Tester Expert Assessment:**

- Current tests mock `hasUnsavedChanges` - missing integration-style reactive tests
- Recommend: Unit tests for `hasUnsavedChanges` after `patchPointsFromMapLocations` and `updateRadius`
- Recommend: E2E tests for save button enablement after drawing each shape type
- Regression risk: Low if existing `hasUnsavedChanges` getter preserved for backward compat

**Project Architect Assessment:**

- Approved: Signal-based approach (Option A)
- Rationale: Aligns with existing signals, OnPush rollout, Angular 16+ direction
- Rejected: Observable+async (more boilerplate), markForCheck() (imperative, fragile)
- Scope: ~15-20 lines in facade service + ~5 lines in component

**Verdict:** Proceed with signal-based implementation.

#### Fix Implementation (2026-05-28)

**Changes:**

1. Added `unsavedChangesSignal = signal(false)` to EditShapeFacadeService
2. Added `refreshUnsavedChangesSignal()` method that updates signal from getter
3. Call `refreshUnsavedChangesSignal()` after all form mutations:
   - `updatePoint()`, `updateRadius()`, `patchPointsFromMapLocations()`
   - `setPointsFromMapLocations()`, `resetForm()`, `markAsSaved()`
   - `revertToLastSaved()`, `clearSavedState()`
4. Added form `valueChanges` subscription to keep signal in sync with user edits
5. Updated component's `canSave` getter to read `unsavedChangesSignal()`
6. Updated unit tests to use signal directly

**Proof Scenario Results:**

- npm test -- --watch=false --browsers=ChromeHeadless => PASS (333/333)
- E2E "Bug 15: Save button should be enabled after drawing circle on map" => PASS

- Final Decision (closed / reopened): closed
- Notes: Affects all shapes (Circle, Polyline, Polygon, Text) - single fix resolves all.

## Phase 5 Review Gate - B-002

## Tester Review - TASK-S1-02

**Reviewer:** Tester Agent  
**Date:** 2026-05-26

### Tests Verified

- [x] Unit tests: PASS (53/53)
- [ ] Integration tests: N/A (no backend/API contract change in this task)
- [x] E2E Playwright: PASS (15/15 in executed run; includes targeted drag scenarios)
- [ ] Performance: N/A

### Coverage

- Before: not captured in current run output
- After: not captured in current run output
- New paths covered:
  - saved-shape drag with form ID match syncs form updates
  - saved-shape drag with ID mismatch does not sync form and uses pending geometry override for save conversion

### Concerns

- E2E is environment-dependent and fails with ERR_CONNECTION_REFUSED when app server is not running on port 39147; this is an environment precondition, not a product defect.

### Verdict

✅ Approved
The quality gate for B-002 is satisfied with both targeted unit evidence and Playwright evidence for drag behavior under the ID-based boundary rule.

## Code Review - TASK-S1-02

**Reviewer:** Code Reviewer Agent  
**Date:** 2026-05-26

### Findings

- Minor: no production-code delta was required in this iteration because the ID-based branch was already implemented; this pass strengthened proof by adding explicit branch tests.
- Suggestion: keep the B-002 unit tests grouped near existing drag tests (currently aligned) and preserve naming that references requirement 3.11 boundary semantics.

### Tests Verified

- [x] Tests exist for all new code paths
- [x] Tests are meaningful (exercise both ID-match and ID-mismatch branches)

### Concerns

- None blocking.

### Verdict

✅ Approved
The change set is scoped, readable, and directly improves confidence in requirement 3.11 behavior without introducing architectural or behavioral risk.

## Architect Review - TASK-S1-02

**Reviewer:** Architect Agent  
**Date:** 2026-05-26

### Architectural Assessment

- [x] Follows established patterns
- [x] No unplanned coupling introduced
- [x] API contracts are backward-compatible (no API changes)
- [x] No architectural anti-patterns
- [x] Security threat surface reviewed (no new surface introduced)

### Tests Verified

- [x] Test strategy is appropriate for the change
- [x] Critical paths have adequate coverage for this bug scope

### Concerns

- Residual risk is operational only: Playwright requires the app server to be running on configured port.

### Verdict

✅ Approved
B-002 aligns with the ID-based saved-shape edit boundary, preserves service boundaries, and is validated by targeted unit and E2E evidence.

## Phase 5 Review Gate - B-003

## Tester Review - TASK-S1-03

**Reviewer:** Tester Agent  
**Date:** 2026-05-26

### Tests Verified

- [x] Unit tests: PASS (58/58)
- [ ] Integration tests: N/A (no backend/API contract change in this task)
- [x] E2E Playwright: PASS (1/1 targeted Bug 5 scenario)
- [ ] Performance: N/A

### Coverage

- Before: not captured in current run output
- After: not captured in current run output
- New paths covered:
  - style control changes trigger rendered-entity updates in draw flow
  - color selection keeps form value, draw-service style state, and rendered entity color aligned

### Concerns

- E2E requires app server running on port 39147.

### Verdict

✅ Approved
The style synchronization quality gate is satisfied for B-003 with focused unit and E2E evidence.

## Code Review - TASK-S1-03

**Reviewer:** Code Reviewer Agent  
**Date:** 2026-05-26

### Findings

- Minor: this iteration is evidence-hardening focused (tests strengthened), with no production-path behavior rewrite required.
- Suggestion: keep style-sync assertions close to existing form-binding tests for maintainability (done).

### Tests Verified

- [x] Tests exist for all new code paths
- [x] Tests are meaningful (validate service + rendered entity sync, not only selector UI)

### Concerns

- None blocking.

### Verdict

✅ Approved
The changes are scoped and improve confidence in style propagation from form controls to rendering behavior.

## Architect Review - TASK-S1-03

**Reviewer:** Architect Agent  
**Date:** 2026-05-26

### Architectural Assessment

- [x] Follows established patterns
- [x] No unplanned coupling introduced
- [x] API contracts are backward-compatible (no API changes)
- [x] No architectural anti-patterns
- [x] Security threat surface reviewed (no new surface introduced)

### Tests Verified

- [x] Test strategy is appropriate for the change
- [x] Critical paths have adequate coverage for this bug scope

### Concerns

- No architectural blockers.

### Verdict

✅ Approved
B-003 is validated through stronger style-synchronization evidence and remains aligned with existing service/component boundaries.

## Deferred Items (User Directed)

### D-001 - Requirement 3.23

- Status: deferred
- Linked Instruction: 6.1 in [plan/free-draw-details.md](plan/free-draw-details.md)
- Reason: user instruction to leave this requirement for now.

### D-002 - Previous Section 6 Workstream

- Status: deferred
- Linked Instruction: 6.2 in [plan/free-draw-details.md](plan/free-draw-details.md)
- Reason: user instruction to leave this section for now.
- Note: includes postponed tooling rollout items such as Playwright MCP planning.
