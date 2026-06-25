# Option A — DrawingSessionService Implementation Plan

**Date:** 2026-06-22 — **Revised: 2026-06-23**  
**Status:** Plan revised after A2 analysis — awaiting Ariel approval before coding  
**Branch:** `fix/b-017-text-shape-disappears-after-cm-open` (same feature branch)  
**Workflow:** TEAM-WORKFLOW  
**Skill:** engineering-workflow + frontend-expert

---

## 0 — Problem Summary (intake)

Seven root-cause problems exist in the current draw/edit architecture (documented in `plan/refactor-draw-architecture.md`). The immediate triggers are:

| #    | Problem                                                                                                          |
| ---- | ---------------------------------------------------------------------------------------------------------------- |
| P-01 | Double vertex entities — `SavedShapesService` AND `DrawToolService` both create them for polylines/polygons      |
| P-02 | Vertex drag broken — `getPickedVertexIndex` only knows `DrawToolService.vertexEntities`, not DataSource vertices |
| P-03 | Entity duplication (Option D) — saved entity + temp entity both visible during editing                           |
| P-04 | Borrowed entity style mutation fragile (Option E) — `updateStyle()` silently dropped                             |
| P-05 | Cancel path for borrowed entity never clears session state                                                       |
| P-06 | `startDrawing()` has 3 implicit modes with no formal distinction                                                 |
| P-07 | Dual `ScreenSpaceEventHandler` — `DrawToolService.handler` + `contextMenuHandler` both own LEFT_DOWN/MOVE/UP     |

**Baseline test state:** 337 unit tests green (after A1 + A2 partial work), 3/3 E2E green.

### 0.1 — Requirements Clarified During A2 Analysis

Two user requirements were raised after the original plan was written, during the A2 discussion:

| #    | Requirement                                                                                             | Type                         |
| ---- | ------------------------------------------------------------------------------------------------------- | ---------------------------- |
| R-01 | Vertex dot markers visible on saved polyline/polygon at all times — even when NOT open in the edit form | Existing feature to preserve |
| R-02 | Individual vertex drag/stretch on saved polyline/polygon when NOT in the edit form                      | **New feature**              |

**Impact on the original plan:**

The original TASK-A2 ("Remove vertex entities from `SavedShapesService`") was the **wrong fix** for P-01 and P-02. It resolved the double-vertex symptom by eliminating the vertex entities entirely, which:

- Breaks R-01 (vertex dots disappear from saved shapes)
- Prevents R-02 (no vertex entities to interact with)

The **correct fix for P-01 and P-02** is coordination via `DrawingSessionService`:

```
startEditing(savedShape)
  └── savedShapesService.hideShape(id)       ← hides entity + vertexEntities + hitEntities
  └── drawToolService.startDrawing(type)
       └── syncVertexEntities()              ← DrawToolService creates its own vertex entities
                                                (no double — saved ones are hidden)
cancelEditing() / confirmSave()
  └── savedShapesService.showShape(id)       ← restores entity + vertexEntities + hitEntities
  └── drawToolService cleanup
       └── clearVertexEntities()             ← removes DrawToolService's temp vertex entities
```

This means:

- **TASK-A2 is revised** — revert the partial A2 implementation, restore vertex entities in `SavedShapesService`
- **TASK-A6 is added** — implement R-02: individual vertex drag in `SavedShapesMapOperationsService`

---

## 1 — Solution: Option A — DrawingSessionService

### Core idea

Introduce a **`DrawingSessionService`** that owns the complete lifecycle of one active drawing/edit session. All existing services keep their internal logic unchanged. Orchestration logic moves out of `MapComponent` and the implicit flags in `DrawToolService` into this dedicated coordinator.

### Session state machine (signal-based)

```typescript
type DrawingSessionMode = "idle" | "creating" | "editing";

interface DrawingSessionState {
  mode: DrawingSessionMode;
  shapeType: DrawMapOption;
  editingShapeId: string | null;
}
```

```
IDLE ──startCreating(type)──► CREATING ──save/cancel──► IDLE
IDLE ──startEditing(shape)──► EDITING  ──save/cancel──► IDLE
CREATING ──switchType(type)──► CREATING   (keeps editing panel open, new temp entity)
EDITING  ──switchType(type)──► CREATING   (restores saved entity, fresh temp entity for new type)
```

### What stays the same

- `DrawToolService` — internal mouse handlers, entity creation, position sync, vertex entities
- `SavedShapesService` — entity storage, hide/show, addShape/updateShape/removeShape, **vertex entity creation stays**
- `EditShapeFacadeService` — reactive form, API save/update
- `EditDrawComponent` — save/cancel UI actions (routes through `DrawingSessionService`)

### What changes

| Location                           | Change                                                                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NEW `DrawingSessionService`        | ~150 lines; owns session state signal; all lifecycle paths go through here                                                                                        |
| `MapComponent.openShapeForEditing` | delegates to `drawingSessionService.startEditing()`                                                                                                               |
| `MapComponent.startDrawing`        | delegates to `drawingSessionService.startCreating()`                                                                                                              |
| `MapComponent.toggleEditMode`      | calls `drawingSessionService.cancel()` when exiting edit mode                                                                                                     |
| `EditDrawComponent.cancel`         | calls `drawingSessionService.cancel()` instead of direct `DrawToolService` calls                                                                                  |
| `EditDrawComponent.save`           | calls `drawingSessionService.confirmSave()` on success                                                                                                            |
| `SavedShapesService.addShape`      | **KEEP** `createVertexEntitiesFromDto()` — vertex entities serve R-01 (display) and R-02 (drag). P-01/P-02 fixed by DrawingSessionService hide/show coordination. |
| `SavedShapesMapOperationsService`  | **ADD** vertex-level drag — detect vertex entity pick, update only that vertex position (R-02)                                                                    |
| `contextMenuHandler` guard         | suppress drag-ops while `sessionService.mode !== 'idle'` (P-07 partial fix)                                                                                       |
| `DrawToolService`                  | REVERT uncommitted Option E changes (`isBorrowedEntity`, `borrowedEntityDto`, `SavedShapesService` injection, `applyCallbackPropertiesToBorrowedEntity`)          |
| `MapComponent`                     | REVERT uncommitted Option E changes in `openShapeForEditing`                                                                                                      |

---

## 2 — Angular Signal Style Reference

All new code follows these patterns, consistent with the existing codebase.

### Service state

```typescript
@Injectable({ providedIn: "root" })
export class DrawingSessionService {
  // private signal — internal mutable state
  private readonly _state = signal<DrawingSessionState>({
    mode: "idle",
    shapeType: MapOperationsEnum.DRAW_NONE,
    editingShapeId: null,
  });

  // public computed — derived read-only values
  readonly mode = computed(() => this._state().mode);
  readonly isActive = computed(() => this._state().mode !== "idle");
  readonly editingShapeId = computed(() => this._state().editingShapeId);

  // private helpers that write state
  private setState(patch: Partial<DrawingSessionState>): void {
    this._state.update((s) => ({ ...s, ...patch }));
  }
}
```

### Effect for cross-service reactions

```typescript
// In DrawingSessionService constructor — react to mode changes for guard logic
private readonly modeEffect = effect(() => {
  const mode = this._state().mode;
  // can fire side-effects here (e.g., notify contextMenuHandler)
});
```

### get/set accessor pattern (consistent with MapComponent)

```typescript
// Expose writable signal state through accessors in components
get isActive(): boolean { return this.sessionService.isActive(); }
```

---

## 3 — Task Breakdown

All tasks run on branch `fix/b-017-text-shape-disappears-after-cm-open`.  
Tasks must be done in order (each builds on the previous).

> **Gate rule (applies to every task):**  
> After finishing a task, run all unit tests AND E2E tests.  
> Do **not** start the next task until **all tests pass** and **Ariel gives explicit approval**.

---

### TASK-A1 — Revert uncommitted Option E changes

**Scope:** `draw-tool.service.ts`, `map.component.ts`  
**What to do:**

1. In `draw-tool.service.ts`:
   - Remove `isBorrowedEntity` field
   - Remove `borrowedEntityDto` field
   - Remove `SavedShapesService` injection (it was not in the committed version)
   - Remove `applyCallbackPropertiesToBorrowedEntity()` method
   - Remove Option E guard in `createTemporaryEntity()` (`if (this.isBorrowedEntity) return`)
   - Remove the borrow/restore block in `startDrawing()` (the `if (this.isBorrowedEntity && this.borrowedEntityDto)` restore block and the `if (options?.existingEntity && options?.existingEntityDto)` borrow block)
   - Remove `isBorrowedEntity`/`borrowedEntityDto` clears from `cleanup()` and `clearTempEntityAfterSave()`
   - Remove `existingEntity` and `existingEntityDto` from `StartDrawingOptions` interface

2. In `map.component.ts`:
   - Restore `openShapeForEditing` to Option D form (no `existingEntity`/`existingEntityDto` passing):
     ```typescript
     private openShapeForEditing(savedShape: SavedShapeEntity): void {
       const dto = savedShape.shapeDto;
       const drawType = shapeTypeToMapOperation(dto.shapeType);
       this.currentDrawType = drawType;
       this.drawToolService.startDrawing(drawType, { preserveFormState: true });
       this.editShapeFacadeService.fromShapeDto(dto);
       this.editShapeFacadeService.markAsSaved(dto);
       this.editShapeFacadeService.setCurrentShapeType(drawType);
       this.drawToolService.loadPositionsFromForm();
     }
     ```

**Acceptance criteria:**

- `npx tsc --noEmit` — 0 errors
- `npx ng test --watch=false --browsers=ChromeHeadless` — all 336 tests green
- E2E `python3 -m pytest e2e/test_bug_text_shape_disappears_on_cm_open.py` — 3/3 green

> ✋ **STOP — run tests, then wait for Ariel approval before proceeding to A2.**

---

### TASK-A2 — Revert A2 implementation (restore vertex entities in SavedShapesService)

**Scope:** `saved-shapes.service.ts`, `saved-shapes.service.spec.ts`  
**Why:** The partial A2 implementation removed `createVertexEntitiesFromDto()` calls, breaking R-01 (vertex dots on saved shapes) and removing the infrastructure needed for R-02 (vertex drag). P-01 and P-02 are fixed by `DrawingSessionService.startEditing()` calling `hideShape(id)` before `DrawToolService` creates its own vertex entities — not by deleting saved vertex entities.

**What to do:**

1. In `saved-shapes.service.ts`, restore `addShape()` to call `createVertexEntitiesFromDto()` and add vertex entities to the DataSource:

   ```typescript
   const vertexEntities = this.createVertexEntitiesFromDto(shapeDto);
   const hitEntities = this.createHitEntitiesFromDto(shapeDto);

   this.dataSource.entities.add(entity);
   vertexEntities.forEach((vertexEntity) => {
     this.dataSource?.entities.add(vertexEntity);
   });
   hitEntities.forEach((hitEntity) => {
     this.dataSource?.entities.add(hitEntity);
   });
   ```

   Remove the comment about "vertex display is a drawing-time concern".

2. In `saved-shapes.service.spec.ts`, revert all A2 spec changes:
   - `'should add a polyline shape'` — restore `expect(savedShape?.vertexEntities?.length).toBe(2)`
   - `'should add a polygon shape'` — restore `expect(savedShape?.vertexEntities?.length).toBe(3)`
   - Restore `'should return parent shape for known vertex entity'` test (undo the rename to "should NOT find...")
   - Remove the `'should NOT create vertex entities for polylines...'` test added in A2

**Acceptance criteria:**

- `npx tsc --noEmit` — 0 source errors
- All tests green (should be back to 336 baseline after removing the A2-added test)
- Vertex dots visible on saved polylines in the running app

> ✋ **STOP — run tests, then wait for Ariel approval before proceeding to A3.**

---

### TASK-A3 — Create DrawingSessionService with signal state

**Scope:** NEW `src/app/services/drawing-session.service.ts`  
**This is the core new service.**

#### Interface and state

```typescript
export type DrawingSessionMode = "idle" | "creating" | "editing";

interface DrawingSessionState {
  mode: DrawingSessionMode;
  shapeType: DrawMapOption;
  editingShapeId: string | null;
}
```

#### Public API

```typescript
@Injectable({ providedIn: 'root' })
export class DrawingSessionService {
  // ── injections ────────────────────────────────────────────────
  private readonly drawToolService = inject(DrawToolService);
  private readonly savedShapesService = inject(SavedShapesService);
  private readonly editShapeFacadeService = inject(EditShapeFacadeService);
  private readonly mapService = inject(MapService);

  // ── state ─────────────────────────────────────────────────────
  private readonly _state = signal<DrawingSessionState>({
    mode: 'idle',
    shapeType: MapOperationsEnum.DRAW_NONE,
    editingShapeId: null,
  });

  // ── computed selectors ────────────────────────────────────────
  readonly mode = computed(() => this._state().mode);
  readonly isActive = computed(() => this._state().mode !== 'idle');
  readonly editingShapeId = computed(() => this._state().editingShapeId);
  readonly shapeType = computed(() => this._state().shapeType);

  // ── public actions ────────────────────────────────────────────

  /** Start a new shape creation session */
  readonly startCreating = (type: DrawMapOption): void => { ... };

  /** Open a saved shape for editing */
  readonly startEditing = (savedShape: SavedShapeEntity): void => { ... };

  /** Switch draw type while a session is active */
  readonly switchType = (type: DrawMapOption): void => { ... };

  /** Cancel current session — restore any hidden entity */
  readonly cancel = (): void => { ... };

  /** Called by EditDrawComponent after a successful save */
  readonly confirmSave = (): void => { ... };
}
```

#### startCreating logic

```typescript
readonly startCreating = (type: DrawMapOption): void => {
  // Restore any previously hidden shape before starting new session
  const prevId = this._state().editingShapeId;
  if (prevId) {
    this.savedShapesService.showShape(prevId);
  }

  this._state.set({ mode: 'creating', shapeType: type, editingShapeId: null });
  this.mapService.setEditDrawShape(type);
  this.drawToolService.startDrawing(type);
};
```

#### startEditing logic

```typescript
readonly startEditing = (savedShape: SavedShapeEntity): void => {
  const dto = savedShape.shapeDto;
  const shapeId = dto.id!;
  const drawType = shapeTypeToMapOperation(dto.shapeType);

  // Hide the saved entity while the temp entity is active (Option D pattern)
  this.savedShapesService.hideShape(shapeId);

  this._state.set({ mode: 'editing', shapeType: drawType, editingShapeId: shapeId });

  this.mapService.setEditDrawShape(drawType);
  this.drawToolService.startDrawing(drawType, { preserveFormState: true });
  this.editShapeFacadeService.fromShapeDto(dto);
  this.editShapeFacadeService.markAsSaved(dto);
  this.editShapeFacadeService.setCurrentShapeType(drawType);
  this.drawToolService.loadPositionsFromForm();
};
```

#### switchType logic

```typescript
readonly switchType = (type: DrawMapOption): void => {
  if (this._state().mode === 'idle') return;

  // Restore any previously hidden saved entity — switching type = new create session
  const prevId = this._state().editingShapeId;
  if (prevId) {
    this.savedShapesService.showShape(prevId);
  }

  this._state.set({ mode: 'creating', shapeType: type, editingShapeId: null });
  this.mapService.setEditDrawShape(type);
  this.drawToolService.startDrawing(type);
};
```

#### cancel logic

```typescript
readonly cancel = (): void => {
  const { mode, editingShapeId } = this._state();

  this.drawToolService.cancelDrawing();

  if (mode === 'editing' && editingShapeId) {
    // Restore the hidden saved entity
    this.savedShapesService.showShape(editingShapeId);
  }

  this._state.set({ mode: 'idle', shapeType: MapOperationsEnum.DRAW_NONE, editingShapeId: null });
  this.mapService.setEditDrawShape(MapOperationsEnum.DRAW_NONE);
};
```

#### confirmSave logic

```typescript
readonly confirmSave = (): void => {
  // The saved entity was replaced by savedShapesService.updateShape/addShape — just clear session
  this._state.set({ mode: 'idle', shapeType: MapOperationsEnum.DRAW_NONE, editingShapeId: null });
  this.mapService.setEditDrawShape(MapOperationsEnum.DRAW_NONE);
};
```

**Unit tests to write in `drawing-session.service.spec.ts`:**

| Test                              | Asserts                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `startCreating(CIRCLE)`           | mode=creating, shapeType=CIRCLE, editingShapeId=null; `drawToolService.startDrawing` called        |
| `startEditing(polyline)`          | mode=editing, editingShapeId set; `hideShape` called; `startDrawing` called with preserveFormState |
| `switchType(CIRCLE) from EDITING` | `showShape(prevId)` called; mode=creating, editingShapeId=null                                     |
| `cancel from EDITING`             | `cancelDrawing` called; `showShape(editingShapeId)` called; mode=idle                              |
| `cancel from CREATING`            | `cancelDrawing` called; `showShape` NOT called; mode=idle                                          |
| `confirmSave`                     | mode=idle; `showShape` NOT called (entity was updated by savedShapesService)                       |
| `startEditing` twice in a row     | first `showShape` called before second hide                                                        |

> ✋ **STOP — run tests, then wait for Ariel approval before proceeding to A4 + A5.**

---

### TASK-A4 — Wire DrawingSessionService into MapComponent

**Scope:** `map.component.ts`  
**What to do:**

1. Inject `DrawingSessionService`
2. Replace `openShapeForEditing` body:
   ```typescript
   private openShapeForEditing(savedShape: SavedShapeEntity): void {
     this.drawingSessionService.startEditing(savedShape);
   }
   ```
3. Replace `startDrawing` body:

   ```typescript
   startDrawing(type: DrawMapOption): void {
     if (!this.isEditMode) return;
     if (this.currentDrawType === type) {
       this.drawingSessionService.cancel();
       return;
     }
     this.drawingSessionService.startCreating(type);
   }
   ```

   > Note: `currentDrawType` is now driven by `mapService.editDrawShapeSignal` which `DrawingSessionService` already calls `setEditDrawShape()` on — no setter needed here.

4. In `toggleEditMode` exit path, replace the manual orchestration:

   ```typescript
   // before:
   this.drawToolService.cancelDrawing();
   this.currentDrawType = MapOperationsEnum.DRAW_NONE;
   this.savedShapesService.showAllShapes();

   // after:
   this.drawingSessionService.cancel();
   this.savedShapesService.showAllShapes();
   ```

5. In `canInteractWithSavedShapes`:

   ```typescript
   private canInteractWithSavedShapes(): boolean {
     return this.isEditMode && !this.drawingSessionService.isActive();
   }
   ```

   This is the P-07 partial fix — drag-ops on saved shapes are suppressed during active drawing/editing.

6. Remove the now-redundant `currentDrawType` setter calls that were routing through `mapService.setEditDrawShape()` directly in `MapComponent` — `DrawingSessionService` owns that now.

**Acceptance criteria:**

- `npx tsc --noEmit` — 0 errors
- All 336 unit tests green
- `map.component.spec.ts` — existing `'should NOT hide the saved shape entity'` spec still passes

**Unit tests to update in `map.component.spec.ts`:**

- `'openShapeForEditing should delegate to drawingSessionService.startEditing'`
- `'startDrawing should delegate to drawingSessionService.startCreating'`
- `'toggleEditMode should call drawingSessionService.cancel when exiting'`
- `'canInteractWithSavedShapes returns false when session is active'`

> ✋ **STOP — run tests, then wait for Ariel approval before proceeding to A5.**

---

### TASK-A5 — Wire DrawingSessionService into EditDrawComponent

**Scope:** `edit-draw.component.ts`  
**What to do:**

1. Inject `DrawingSessionService`

2. Replace `cancel()` body:

   ```typescript
   readonly cancel = (): void => {
     this.saveError = null;

     if (this.shapeFormService.isSaved) {
       // Editing a saved shape: revert form + reload positions
       // The session stays active (user can keep editing with the reverted values)
       this.shapeFormService.revertToLastSaved();
       this.drawToolService.loadPositionsFromForm();
       return;
     }

     // Creating a new shape: close the session entirely
     this.drawingSessionService.cancel();
   };
   ```

   > The "revert" path for a saved shape is different from "close the session". Revert keeps the session alive but restores the form. Only a full cancel closes the session.

3. Replace the success path in `save()`:
   ```typescript
   next: (savedShape) => {
     this.isSaving = false;
     this.drawToolService.clearTempEntityAfterSave();
     this.drawingSessionService.confirmSave();
   },
   ```

**Acceptance criteria:**

- All 336 unit tests green
- E2E: `python3 -m pytest e2e/test_bug_text_shape_disappears_on_cm_open.py` — 3/3 green

**Unit tests to update in `edit-draw.component.spec.ts`:**

- `'cancel should call drawingSessionService.cancel when shape is not saved'`
- `'cancel should revert form and NOT close session when shape is saved'`
- `'save success should call drawingSessionService.confirmSave'`

> ✋ **STOP — run tests, then wait for Ariel approval before proceeding to A6.**

---

### TASK-A6 — Add individual vertex drag to SavedShapesMapOperationsService (R-02)

**Scope:** `saved-shapes-map-operations.service.ts`, `saved-shapes-map-operations.service.spec.ts`  
**Feature:** When the user clicks and drags a vertex dot on a saved polyline/polygon that is NOT open in the edit form, only that vertex moves. Whole-shape drag (clicking the polyline body) remains unchanged.

#### Session type extension

Add a discriminant to `SavedShapeDragSession`:

```typescript
interface SavedShapeDragSession {
  type: "whole-shape" | "vertex"; // new
  shapeId: string;
  vertexIndex: number | null; // only set when type === 'vertex'
  originalDto: ShapeDto;
  latestDto: ShapeDto;
  lastDragCartesian: Cartesian3;
  startScreenPosition: Cartesian2;
  hasDragged: boolean;
}
```

#### Vertex detection in `startDragCandidate`

Vertex entities have `properties.vertexIndex` set by `SavedShapesService.createVertexEntitiesFromDto`. Read it to distinguish a vertex pick from a whole-shape pick:

```typescript
const pickedObject = this.pickSavedShapeTarget(viewer, position);
const pickedEntity = pickedObject?.id as Entity | undefined;
const rawVertexIndex = pickedEntity?.properties?.vertexIndex?.getValue(new JulianDate());
const vertexIndex = typeof rawVertexIndex === "number" ? rawVertexIndex : null;

this.dragSession = {
  type: vertexIndex !== null ? "vertex" : "whole-shape",
  vertexIndex,
  shapeId,
  originalDto: this.cloneShapeDto(savedShape.shapeDto),
  latestDto: this.cloneShapeDto(savedShape.shapeDto),
  lastDragCartesian: dragAnchor,
  startScreenPosition: new Cartesian2(position.x, position.y),
  hasDragged: false,
};
```

#### Vertex position update in `updateDrag`

Replace the existing single `translateShapeDtoByDelta` call with a mode-aware branch:

```typescript
const sourceDto = draggedShape?.shapeDto ?? this.dragSession.latestDto;
const updated = this.dragSession.type === "vertex" && this.dragSession.vertexIndex !== null ? this.setVertexPosition(sourceDto, this.dragSession.vertexIndex, currentAnchor) : this.translateShapeDtoByDelta(sourceDto, delta);

this.savedShapesService.updateShape(updated);
this.syncFormForDraggedShapeIfMatched(updated);
this.dragSession.latestDto = updated;
this.dragSession.lastDragCartesian = currentAnchor;
```

> Note: for vertex drag, `delta` is not used — the vertex moves directly to the cursor map position.

#### New private helper `setVertexPosition`

```typescript
private setVertexPosition(
  dto: ShapeDto,
  index: number,
  cartesian: Cartesian3,
): ShapeDto {
  const geographic = Cartographic.fromCartesian(cartesian);
  const newPoints = dto.points.map((point, i) =>
    i !== index
      ? point
      : {
          coordinates: {
            latitude: CesiumMath.toDegrees(geographic.latitude),
            longitude: CesiumMath.toDegrees(geographic.longitude),
          },
          altitude: { feet: geographic.height * FEET_PER_METER },
        },
  );
  return { ...dto, points: newPoints };
}
```

#### `finishDrag` — unchanged

API save logic (`shapeApiService.update`) works for both session types — `session.latestDto` already has the final state.

**Acceptance criteria:**

- `npx tsc --noEmit` — 0 source errors
- All unit tests green
- Manually: drag a vertex dot on a saved polyline → only that vertex moves, rest of polyline stays
- Whole-shape drag still works (click+drag the polyline body, not a vertex dot)

**Unit tests to add in `saved-shapes-map-operations.service.spec.ts`:**

| Test                                                                | Asserts                                                                     |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `startDragCandidate picks vertex entity`                            | session.type=vertex, session.vertexIndex=correct index                      |
| `startDragCandidate picks non-vertex entity`                        | session.type=whole-shape, session.vertexIndex=null                          |
| `updateDrag with vertex session`                                    | calls `setVertexPosition`; only target vertex moves; other points unchanged |
| `updateDrag with whole-shape session`                               | calls `translateShapeDtoByDelta`; all vertices move                         |
| `finishDrag calls API for vertex session`                           | API called with updated dto                                                 |
| `setVertexPosition returns new dto with only target vertex updated` | other points unchanged                                                      |

> ✋ **STOP — run tests, then wait for Ariel approval before proceeding to A7.**

---

### TASK-A7 — Update bugs.md + write E2E regression tests

---

## 4 — Task Order and Dependencies

```
TASK-A1 ✅ DONE (revert Option E)
    │
    ✅ unit tests + E2E green → ✋ Ariel approval
    ▼
TASK-A2 (revert A2 partial work — restore vertex entities in SavedShapesService)
    │
    ✅ unit tests green → ✋ Ariel approval
    ▼
TASK-A3 (create DrawingSessionService)   ← P-01, P-02, P-03, P-04, P-05, P-06 fixed here
    │
    ✅ unit tests green → ✋ Ariel approval
    │
    ├──► TASK-A4 (wire into MapComponent)
    │         │
    │         ✅ unit tests green → ✋ Ariel approval
    │
    └──► TASK-A5 (wire into EditDrawComponent)
              │
              ✅ unit tests + E2E green → ✋ Ariel approval
              ▼
         TASK-A6 (vertex drag for saved shapes — R-02 new feature)
              │
              ✅ unit tests green → ✋ Ariel approval
              ▼
         TASK-A7 (bugs.md + E2E tests)
              │
              ✅ all tests + E2E green → ✋ Ariel final approval
```

A4 and A5 can be done in parallel after A3.

---

## 5 — Files Touched

| File                                                           | Task      | Change type                                                 |
| -------------------------------------------------------------- | --------- | ----------------------------------------------------------- |
| `src/app/services/draw-tool.service.ts`                        | A1 ✅     | Revert (Option E removed)                                   |
| `src/app/components/map/map.component.ts`                      | A1 ✅, A4 | Revert done; A4 delegates to session service                |
| `src/app/services/saved-shapes.service.ts`                     | A2        | Revert A2 partial — restore vertex entity creation          |
| `src/app/services/saved-shapes.service.spec.ts`                | A2        | Revert A2 spec changes — restore original vertex assertions |
| `src/app/services/drawing-session.service.ts`                  | A3        | **NEW**                                                     |
| `src/app/services/drawing-session.service.spec.ts`             | A3        | **NEW**                                                     |
| `src/app/components/map/map.component.spec.ts`                 | A4        | Test delegation to session service                          |
| `src/app/components/edit-draw/edit-draw.component.ts`          | A5        | Delegate cancel/save to session service                     |
| `src/app/components/edit-draw/edit-draw.component.spec.ts`     | A5        | Test cancel/save paths                                      |
| `src/app/services/saved-shapes-map-operations.service.ts`      | A6        | Add vertex-level drag                                       |
| `src/app/services/saved-shapes-map-operations.service.spec.ts` | A6        | Tests for vertex vs whole-shape drag                        |
| `plan/bugs.md`                                                 | A7        | Status update                                               |
| `e2e/test_drawing_session_option_a.py`                         | A7        | **NEW**                                                     |

---

## 6 — Definition of Done

| Criterion                                     | Check                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit` clean                      | 0 source errors                                                                                                  |
| Unit tests baseline                           | ≥ 336 tests green                                                                                                |
| E2E baseline (B-017)                          | 3/3 green                                                                                                        |
| E2E new tests                                 | 5/5 green                                                                                                        |
| P-01 (double vertices)                        | ✅ fixed — DrawingSessionService.startEditing hides saved vertex entities before DrawToolService creates its own |
| P-02 (vertex drag broken)                     | ✅ fixed — saved vertex entities are hidden during form editing; only DrawToolService’s are pickable             |
| P-03 (entity duplication)                     | ✅ fixed — session hides saved entity on startEditing                                                            |
| P-04 (style mutation fragile)                 | ✅ fixed — no more borrowed entity mutation                                                                      |
| P-05 (cancel incomplete)                      | ✅ fixed — DrawingSessionService.cancel always calls showShape + cancelDrawing                                   |
| P-06 (startDrawing dual purpose)              | ✅ fixed — session service calls startDrawing with clear intent                                                  |
| P-07 (handler conflict)                       | ✅ partial — `canInteractWithSavedShapes` returns false while session active                                     |
| R-01 (vertex dots on saved shapes)            | ✅ preserved — SavedShapesService keeps createVertexEntitiesFromDto                                              |
| R-02 (individual vertex drag on saved shapes) | ✅ new feature — SavedShapesMapOperationsService vertex drag session                                             |
| No new TypeScript `any` casts                 | Verified                                                                                                         |
| No `console.error` left in new code           | Verified                                                                                                         |

---

## 7 — What is NOT in scope

- Full P-07 fix (merging the two `ScreenSpaceEventHandler` instances into one) — that requires Option C's `InputHandlerService` and is a separate sprint
- Shape drag-while-editing on saved shapes (while form is open and DrawToolService is active) — separate feature
- Vertex drag on circle or text shapes — circles have no vertices; text has a single anchor that whole-shape drag handles
- Any UI changes to `EditDrawComponent` template
- Any new API endpoints

> **No code is written until Ariel gives explicit approval.**
