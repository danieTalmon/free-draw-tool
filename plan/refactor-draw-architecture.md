# Drawing Architecture Refactor

**Date:** 2026-06-22  
**Status:** Awaiting Ariel approval before coding  
**Workflow:** TEAM-WORKFLOW (approval gate required)  
**Trigger:** Multiple user-reported bugs after B-017 Option D/E attempts revealed the architecture cannot support entity-sharing or single-entity editing without deep structural changes.

---

## 1 — Current Architecture Overview

### Service map

```
MapComponent
  ├── DrawToolService             (drawing mouse handler + temp entity + vertex entities in viewer.entities)
  ├── SavedShapesService          (saved entity + vertex entities + hit entities in FREE_DRAW_SHAPES DataSource)
  ├── SavedShapesMapOperationsService  (saved-shape drag handler registered on MapComponent.contextMenuHandler)
  ├── EditShapeFacadeService      (reactive form + API save/update)
  └── MapService                  (signal: editDrawShape — shared draw-type state)
```

### Entity collections and owners

| Collection | Owner | Entities |
|---|---|---|
| `viewer.entities` | `DrawToolService` | Temp drawing entity (1) + temp vertex entities (N) |
| `FREE_DRAW_SHAPES` DataSource | `SavedShapesService` | Saved entity (1) + vertex entities (N) + hit entities (N) per shape |

### Mouse handler registrations

| Handler | Owner | Events bound |
|---|---|---|
| `DrawToolService.handler` | `DrawToolService.startDrawing()` | LEFT_DOWN, MOUSE_MOVE, LEFT_UP, LEFT_CLICK |
| `MapComponent.contextMenuHandler` | `MapComponent.setupContextMenuHandler()` | LEFT_DOWN, MOUSE_MOVE, LEFT_UP, LEFT_CLICK, RIGHT_CLICK (via `SavedShapesMapOperationsService`) |

Both handlers bind to `LEFT_DOWN`, `MOUSE_MOVE`, and `LEFT_UP` on the same Cesium canvas. Cesium delivers events to ALL registered `ScreenSpaceEventHandler` instances — not the first match. Both run simultaneously when `isDrawingMode` and `isEditMode` are true.

### Shape lifecycle (create)

```
startDrawing(type)               [MapComponent.startDrawing → DrawToolService.startDrawing]
  └── createTemporaryEntity()    → adds entity to viewer.entities with CallbackProperty
  └── setupMouseHandlers()       → binds DrawToolService.handler

Mouse click → handleClick()      → pushes to positions[]
  └── emitPositionChanges()      → patches form via EditShapeFacadeService
  └── syncVertexEntities()       → adds vertex entities to viewer.entities

Save → EditDrawComponent.save()
  └── EditShapeFacadeService.saveCurrentShape()  → API call → savedShapesService.addShape(dto)
  └── drawToolService.clearTempEntityAfterSave() → removes temp entity, resets positions
```

### Shape lifecycle (edit)

```
CM → openShapeForEditing(savedShape)   [MapComponent]
  └── drawToolService.startDrawing(type, {preserveFormState: true, existingEntity?, existingEntityDto?})
       ├── [Option D] creates NEW temp entity → DUPLICATION with saved entity
       └── [Option E] borrows saved entity → sets shapeEntity = savedEntity, mutates to CallbackProperty
  └── editShapeFacadeService.fromShapeDto(dto)
  └── drawToolService.loadPositionsFromForm()
       └── syncVertexEntities() → adds SECOND set of vertex entities to viewer.entities
              (first set is SavedShapesService's vertex entities in DataSource)

Cancel → EditDrawComponent.cancel()
  └── [if isSaved] shapeFormService.revertToLastSaved() + drawToolService.loadPositionsFromForm()
       → form reverts, positions reload, but borrowed entity state NOT cleared
  └── [if NOT saved] drawToolService.clearTempEntityAfterSave()
       → removes temp entity, isBorrowedEntity cleared (if set)

Switch draw type → MapComponent.startDrawing(newType)
  └── drawToolService.startDrawing(newType)  [NO preserveFormState, NO existingEntity]
       └── [Option E] restores borrowed entity via savedShapesService.updateShape()
       → creates NEW temp entity for newType
```

---

## 2 — Identified Problems (Root Cause Analysis)

### P-01 Double vertex entities during editing

**Trigger:** Any saved polyline/polygon opened for editing.

**Cause:** Two independent systems both create vertex entities:
1. `SavedShapesService.createVertexEntitiesFromDto()` — static vertex entities in DataSource
2. `DrawToolService.syncVertexEntities()` — live vertex entities in `viewer.entities`

Both sets are visible simultaneously. There is no coordination between them.

**Result:** Every vertex appears twice on the map.

---

### P-02 Vertex drag broken for saved shapes

**Trigger:** User tries to drag a vertex point on an edited saved polyline/polygon.

**Cause:** `DrawToolService.getPickedVertexIndex()` uses:
```typescript
const vertexIndex = this.vertexEntities.indexOf(pickedEntity);
```
`this.vertexEntities` only contains entities added by `DrawToolService.syncVertexEntities()` (in `viewer.entities`).

The SavedShapesService's vertex entities (in the DataSource) are never in `this.vertexEntities`, so picking them returns -1 and vertex drag is skipped. Whole-shape drag triggers instead.

---

### P-03 Entity duplication during editing (Option D)

**Trigger:** Any saved shape opened for editing with Option D active (no hideShape call).

**Cause:** `createTemporaryEntity()` adds a NEW entity to `viewer.entities`. The saved entity remains in the DataSource. Both are visible.

**Result:** Two overlapping entities for every shape being edited.

---

### P-04 Borrowed entity property mutation is fragile (Option E)

**Trigger:** `updateStyle()` is called while `isBorrowedEntity` is true.

**Cause:** `updateStyle()` calls `createTemporaryEntity()`. Guard `if (this.isBorrowedEntity) return` prevents entity creation but silently drops the style update. Style changes to color/lineWidth don't reach the borrowed entity's static properties (`outlineColor`, `material`, `width`).

The CallbackProperty lambdas in `applyCallbackPropertiesToBorrowedEntity` only cover position, radius, text, and polyline positions. They do not cover visual style properties.

---

### P-05 Cancel path incomplete for borrowed entity

**Trigger:** User edits a saved shape, clicks X/Cancel while form shows `isSaved: true`.

**Cause:** `EditDrawComponent.cancel()` → `shapeFormService.revertToLastSaved()` → `drawToolService.loadPositionsFromForm()`. This path never calls `drawToolService.cancelDrawing()` or `cleanup()`. The borrowed entity's `isBorrowedEntity` flag is never cleared and `savedShapesService.updateShape()` is never called. The entity remains with mutated CallbackProperty properties even after the form reverts.

---

### P-06 `startDrawing` has dual purpose without clear distinction

**Cause:** `startDrawing(type, options?)` is called for:
1. NEW shape creation: no `preserveFormState`, no `existingEntity`
2. EDIT existing shape: `preserveFormState: true`, optional `existingEntity`
3. SWITCH draw type: no `preserveFormState` (called from `MapComponent.startDrawing`)

The `options.existingEntity` field was added to support Option E but the service cannot distinguish "start fresh" from "switch type while editing" from "open saved shape" without examining multiple flag combinations. This creates implicit state that is hard to reason about.

---

### P-07 Dual handler conflicts

**Cause:** Both `DrawToolService.handler` and `MapComponent.contextMenuHandler` (via `SavedShapesMapOperationsService`) bind to `LEFT_DOWN`, `MOUSE_MOVE`, `LEFT_UP`. Cesium fires all registered handlers.

When drawing mode is active, a left-click may trigger BOTH `DrawToolService.handleClick` (adds a draw point) AND `SavedShapesMapOperationsService.startDragCandidate` (begins drag detection on a saved shape). The user experiences unexpected behavior depending on what entity was under the cursor.

---

## 3 — Code Style Reference

Extracted from the existing codebase for all new code to follow.

### Angular

```typescript
// Services: inject() at field level, no constructor DI
@Injectable({ providedIn: 'root' })
export class MyService {
  private readonly dep = inject(DependencyService);
  private readonly ngZone = inject(NgZone);
  private readonly destroy$ = new Subject<void>();
}

// Components: standalone, OnPush, inject()
@Component({
  selector: 'app-my',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyComponent implements OnDestroy {
  private readonly service = inject(MyService);
}
```

### State fields

```typescript
// Mutable state: private, no readonly
private isDrawing = false;
private positions: Cartesian3[] = [];

// Immutable injectable refs: private readonly
private readonly ngZone = inject(NgZone);
private readonly destroy$ = new Subject<void>();

// Signals for observable-in-template state
private readonly myState = signal(false);
get myValue(): boolean { return this.myState(); }
set myValue(v: boolean) { this.myState.set(v); }

// RxJS streams for multi-subscriber observable state
readonly myChanges$: Observable<T>;
```

### Methods

```typescript
// Arrow functions for methods used as Cesium callbacks or passed to other functions
private readonly handleClick = (movement: { position: Cartesian2 }): void => { ... };

// Regular methods for business logic called from within the class
private syncVertexEntities(): void { ... }

// Public API: readonly arrow functions
readonly startDrawing = (type: DrawMapOption, options?: Opts): void => { ... };

// Private readonly constants for configuration
private readonly someConst = 42;
```

### Cesium patterns

```typescript
// Entity creation: use Entity.ConstructorOptions
const entity = this.viewer.entities.add({
  name: 'My Entity',
  show: true,
  position: new CallbackProperty(() => this.positions[0], false) as unknown as Cartesian3,
  polyline: {
    positions: new CallbackProperty(() => this.positions, false) as unknown as Cartesian3[],
    width: lineWidth,
    material: this.getMaterial(),
    clampToGround: true,
  },
});

// Type casting for CallbackProperty where Cesium types expect a primitive
entity.ellipse!.semiMajorAxis = new CallbackProperty(() => this.radius, false) as any;

// DataSource for persistence layer
const ds = new CustomDataSource('MY_LAYER');
viewer.dataSources.add(ds);
ds.entities.add(new Entity({ id: dto.id, ... }));
```

### File and folder structure

```
src/app/
  components/         ← Angular UI components (standalone)
    map/
    edit-draw/
    style-input/
  services/           ← Injectable services
    draw-tool.service.ts
    saved-shapes.service.ts
    edit-shape-facade.service.ts
  models/             ← Interfaces and enums
  adapters/           ← Transformation functions (no side effects)
  helpers/            ← Pure utility functions
  consts/             ← Constant values
```

---

## 4 — Architectural Options

### Option A — Drawing Session Manager (Minimal Refactor)

**Core idea:** Introduce a `DrawingSessionService` that owns the full lifecycle of a single active drawing/edit session. All existing services are kept, but orchestration moves out of `MapComponent` and `DrawToolService` into this coordinator.

**Session states:**

```
IDLE → CREATING(type) → IDLE           (new shape: create + save/cancel)
IDLE → EDITING(shapeId, type) → IDLE   (saved shape: edit + save/cancel)
```

**How create works:**
1. `DrawingSessionService.startCreating(type)`:
   - Calls `drawToolService.startDrawing(type)` — creates temp entity in `viewer.entities`
   - State → `CREATING`
2. Mouse events: `DrawToolService.handler` as-is
3. On save: `editShapeFacadeService.saveCurrentShape()` → `savedShapesService.addShape()` → `drawToolService.clearTempEntityAfterSave()`
4. State → `IDLE`

**How edit works:**
1. `DrawingSessionService.startEditing(savedShape)`:
   - `savedShapesService.hideShape(id)` — hides saved entity
   - `drawToolService.startDrawing(type, {preserveFormState: true})` — creates NEW temp entity (clean, no mutation)
   - Stores `editingShapeId = id`
   - State → `EDITING`
2. Mouse events: `DrawToolService.handler` as-is
3. On cancel: `drawToolService.cancelDrawing()` + `savedShapesService.showShape(editingShapeId)` + `editingShapeId = null`
4. On type-switch: `savedShapesService.showShape(editingShapeId)` + start fresh `CREATING` session with new type
5. On save: `savedShapesService.updateShape(newDto)` + `drawToolService.clearTempEntityAfterSave()` + `editingShapeId = null`
6. State → `IDLE`

**Vertex entities:**
- `SavedShapesService` stops creating vertex entities for polylines/polygons — those are purely a drawing-time concern, not a saved-shape display concern.
- Only `DrawToolService.syncVertexEntities()` creates vertex entities.
- Vertex picking continues to work via `this.vertexEntities.indexOf()`.

**Mouse handlers:**
- Keep dual-handler design but add explicit mutual exclusion: `DrawToolService.handler` is only active in `CREATING` or `EDITING` state; `contextMenuHandler` suppresses drag logic while drawing session is active.

**Pros:**
- Least new code (~150 lines for `DrawingSessionService`)
- Existing services largely unchanged
- Vertex conflict resolved by removing SavedShapesService vertex entities
- Cancel/save paths go through one coordinator → no forgotten restore calls

**Cons:**
- Still creates a temp entity (duplication hidden behind hide/show)
- Session state is a new global singleton
- `DrawToolService` still has the dual-purpose `startDrawing` (create vs edit)

---

### Option B — Unified Drawing DataSource (Medium Refactor)

**Core idea:** There is only ONE entity per shape at all times. A dedicated `DRAWING` DataSource holds the entity being actively drawn/edited. The `FREE_DRAW_SHAPES` DataSource holds all other saved entities. Moving between DataSources replaces hide/show.

**DataSource ownership:**

```
DRAWING DataSource          ← entity being drawn/edited (exactly 0 or 1)
FREE_DRAW_SHAPES DataSource ← all other saved entities
```

**How create works:**
1. `DrawToolService.startDrawing(type)`:
   - Creates entity in `DRAWING` DataSource (with CallbackProperty, same as current `viewer.entities` approach but in a named DataSource)
   - Mouse events update positions via `DrawToolService.handler` as-is
2. On save:
   - Move entity from `DRAWING` to `FREE_DRAW_SHAPES`: `drawingDs.entities.remove(entity)` + recreate as static entity in `savedDs.entities.add(newStaticEntity)`
   - OR: update entity in-place (from CallbackProperty to static values)

**How edit works:**
1. `openShapeForEditing(savedShape)`:
   - `savedShapesService.moveToDrawingDataSource(id)`:
     - Removes entity from `FREE_DRAW_SHAPES`
     - Adds to `DRAWING` DataSource with CallbackProperty properties
   - `DrawToolService` sets `shapeEntity = drawingEntity`
   - One entity, one DataSource, no duplication
2. On cancel: move entity from `DRAWING` back to `FREE_DRAW_SHAPES` (recreate as static from original DTO)
3. On save: entity already has updated positions in `DRAWING` DataSource; apply new static values; move to `FREE_DRAW_SHAPES`

**Vertex entities:**
- Only in `DRAWING` DataSource when editing/creating — removed when session ends
- No vertex entities in `FREE_DRAW_SHAPES` (display only, no interaction vertex markers in saved state)

**Mouse handlers:**
- Cesium picking on `DRAWING` DataSource entity works correctly
- `SavedShapesMapOperationsService` drag only operates on `FREE_DRAW_SHAPES` entities (not in DRAWING state)
- No ambiguity

**Pros:**
- Single entity at all times — no duplication
- DataSource separation gives clear visual layer control
- Mouse handler conflicts resolved (DrawToolService owns DRAWING, SavedShapesMapOperationsService owns FREE_DRAW_SHAPES)
- Cancel is simply: recreate static entity in FREE_DRAW_SHAPES, remove from DRAWING

**Cons:**
- Need `moveToDrawingDataSource` implementation (entity property conversion)
- Entity structure must still be converted (static → CallbackProperty on edit open)
- More changes to `SavedShapesService` API

---

### Option C — DrawingState Signal-Driven ViewModel (Major Refactor)

**Core idea:** All drawing state is represented as a plain Angular signal-based object. A `CesiumRenderer` service reads state and creates/updates exactly one Cesium entity. Mouse events write to state. The form reads from state. No bidirectional coupling.

**State model:**

```typescript
interface DrawingState {
  mode: 'idle' | 'creating' | 'editing';
  shapeType: DrawMapOption;
  positions: MapLocation[];    // single source of truth
  radius: number | undefined;
  style: { lineType: OutlineType; lineWidth: number; lineColor: string; };
  editingShapeId: string | undefined;  // set when mode === 'editing'
  isComplete: boolean;         // polyline/polygon fully drawn
}
```

**Data flow (one-way):**

```
                ┌─────────────┐
Mouse events → │ InputService │ → writes to DrawingState signal
                └─────────────┘
                                        ↓
                              DrawingState signal
                              ↙                  ↘
              CesiumRenderer                 EditShapeFacadeService
              (reads state,                 (reads state,
              owns one entity)              drives form)
```

**How create works:**
1. `DrawingStateService.startCreating(type)`: sets `mode = 'creating'`, `shapeType = type`, clears positions
2. `CesiumRenderer` effect: detects state change, creates entity in `viewer.entities` with CallbackProperty reading from `drawingState.positions`
3. Mouse left-click → `InputService` pushes new position to `drawingState.positions`
4. Form changes → `EditShapeFacadeService` writes back to `drawingState.style`, `drawingState.positions`
5. On save: `drawingState.mode = 'idle'`; `CesiumRenderer` removes drawing entity; `SavedShapesService.addShape(dto)` adds static entity

**How edit works:**
1. `DrawingStateService.startEditing(savedShape)`: sets `mode = 'editing'`, loads positions from DTO, `editingShapeId = id`
2. `CesiumRenderer`: detects `mode === 'editing'` for `editingShapeId` — hides saved entity, creates/updates the one rendering entity with current state
3. Mouse drag → updates positions in DrawingState
4. Form change → updates DrawingState
5. On cancel: `DrawingStateService.cancelEditing()` → restores state from original DTO → `CesiumRenderer` restores entity

**Vertex handling:**
- `CesiumRenderer` creates vertex entities based on `drawingState.positions` for vertex-editing shapes
- One system, one owner

**Mouse handlers:**
- `InputService` owns a SINGLE `ScreenSpaceEventHandler`
- No dual-handler conflicts
- Delegates to `DrawingStateService` based on current mode

**Pros:**
- Cleanest architecture — single source of truth
- One entity, one handler, one renderer
- Fully testable (state is a plain signal)
- Eliminates all current P-01 through P-07

**Cons:**
- Largest amount of new code (~3 new services, partial rewrite of DrawToolService)
- Existing form→service binding must be inverted (form reads state, not the other way)
- Higher risk during transition

---

### Option D — Split DrawToolService into Create / Edit Modes (Focused Refactor)

**Core idea:** Keep the service-per-concern approach but split `DrawToolService`'s dual responsibility. Two separate drawing services with a shared Cesium interaction layer.

**New services:**

```
DrawCreateService   ← new shape creation only (no saved entity involvement)
DrawEditService     ← saved shape editing only (no new entity creation)
CesiumInteractionService ← single mouse handler, delegates to active service
```

**How create works:**
1. `DrawCreateService.start(type)`:
   - Creates temp entity in `viewer.entities`
   - Registers CREATE handlers on `CesiumInteractionService`
2. Mouse click → `CesiumInteractionService` → `DrawCreateService.addPoint()`
3. Vertex drag → `CesiumInteractionService` → `DrawCreateService.moveVertex()`
4. On save: `drawCreateService.finalize()` → API → `savedShapesService.addShape()`

**How edit works:**
1. `DrawEditService.start(savedShape)`:
   - `savedShapesService.hideShape(id)` — hides saved entity
   - Creates temp entity in `viewer.entities` (clean, no mutation)
   - Registers EDIT handlers on `CesiumInteractionService`
   - Tracks `editingShapeId`
2. Mouse drag → `CesiumInteractionService` → `DrawEditService.moveVertex()` or `DrawEditService.moveShape()`
3. On cancel: `savedShapesService.showShape(editingShapeId)` + `drawEditService.cleanup()`
4. On save: `savedShapesService.updateShape(newDto)` + `drawEditService.cleanup()`

**Vertex entities:**
- `DrawCreateService` and `DrawEditService` each manage their own vertex entities (no SavedShapesService vertex entities needed for editing)

**Mouse handlers:**
- Single `CesiumInteractionService.handler`
- Mode-aware: delegates to active service only
- Eliminates dual-handler conflict

**Pros:**
- Clear separation: create vs. edit have no shared code paths
- Single handler — no event conflict
- Not a full rewrite — can be done incrementally

**Cons:**
- More files/services than Option A
- Need shared Cesium utilities (entity creation, position math) between the two services
- Still requires hiding saved entity on edit start (fragile-ish, but single coordinator owns it)

---

## 5 — Option Comparison

| Criterion | A (Session Manager) | B (Unified DataSource) | C (Signal ViewModel) | D (Split Services) |
|---|---|---|---|---|
| Entity duplication fixed | ✅ (via hide) | ✅ (single entity) | ✅ (single entity) | ✅ (via hide) |
| Double vertex entities fixed | ✅ | ✅ | ✅ | ✅ |
| Vertex drag fixed | ✅ | ✅ | ✅ | ✅ |
| Handler conflict fixed | Partial | ✅ | ✅ | ✅ |
| Cancel robustness | ✅ (coordinator) | ✅ (recreate from DTO) | ✅ (state revert) | ✅ (coordinator) |
| Complexity (LoC estimate) | Low (~150) | Medium (~400) | High (~600) | Medium (~350) |
| Risk | Low | Medium | High | Medium |
| Testability | Good | Good | Excellent | Good |
| Future-proof | Medium | High | Highest | High |

---

## 6 — Agent Recommendation

**Recommended: Option A for immediate fix + Option C as the target architecture.**

Option A can be delivered in this sprint with minimal risk. It eliminates all 7 identified problems (P-01 through P-07) with ~150 new lines. The key insight: removing vertex entities from `SavedShapesService` solves P-01/P-02, and the `DrawingSessionService` coordinator solves P-03/P-04/P-05/P-06.

Option C is the correct long-term architecture (signal-driven, single source of truth, one handler) but should be a dedicated future sprint, not done under time pressure.

Option B is a good middle ground if Option A proves insufficient. Option D is attractive architecturally but doesn't provide enough benefit over A to justify the extra complexity at this stage.

---

## 7 — Next Steps (awaiting Ariel approval)

1. Select architectural option
2. Define which Option A/B/C/D changes go into this sprint
3. Full task breakdown per TEAM-WORKFLOW Phase 3
4. Implement with full unit + E2E test coverage
5. Code review before merge

---

## 8 — Scope of Current Changes to Revert

Before implementing any option, the following changes from B-017 should be evaluated:

- `draw-tool.service.ts`: Option E fields (`isBorrowedEntity`, `borrowedEntityDto`), `SavedShapesService` injection, `applyCallbackPropertiesToBorrowedEntity()`, `createTemporaryEntity()` guard, `cleanup()` borrow restore, `clearTempEntityAfterSave()` borrow clear
- `map.component.ts`: `openShapeForEditing()` passing `existingEntity`/`existingEntityDto`

These changes can be removed as part of implementing the chosen option. None of them were committed — they exist only in the working tree.

> **No code is written until Ariel gives explicit approval.**
