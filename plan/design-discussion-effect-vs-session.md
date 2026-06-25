# Design Discussion — `effect()` in DrawToolService vs DrawingSessionService

**Date:** 2026-06-24  
**Status:** Design decision — awaiting Ariel approval  
**Participants:** Architect (3 votes), Frontend Expert (1 vote)  
**Question:** Should we replace `DrawingSessionService`'s imperative calls with an Angular `effect()` inside `DrawToolService` that reacts to a shared signal holding the session state?

---

## The Three Options on the Table

### Option 1 — DrawingSessionService only (current implementation)

`DrawingSessionService` holds `signal<DrawingSessionState>` and calls all downstream services **imperatively** in sequence:

```typescript
readonly startEditing = (savedShape: SavedShapeEntity): void => {
  // Step 1 — hide saved entity
  this.savedShapesService.hideShape(shapeId);
  // Step 2 — update session state signal
  this._state.set({ mode: 'editing', ... });
  // Step 3 — start drawing tool
  this.drawToolService.startDrawing(drawType, { preserveFormState: true });
  // Step 4 — load form (requires Step 3's preserveFormState to be applied first)
  this.editShapeFacadeService.fromShapeDto(dto);
  this.editShapeFacadeService.markAsSaved(dto);
  this.drawToolService.loadPositionsFromForm();  // requires Step 4 to be done first
};
```

The signal is used as **read-only derived state** by components and guards:

```typescript
// In MapComponent — reactive consumption, not orchestration:
private canInteractWithSavedShapes(): boolean {
  return this.isEditMode && !this.drawingSessionService.isActive();
}
```

---

### Option 2 — `effect()` inside DrawToolService constructor

`DrawToolService` injects `DrawingSessionService` and reacts to its state signal:

```typescript
// In DrawToolService constructor
constructor() {
  const session = inject(DrawingSessionService);

  effect(() => {
    const { mode, shapeType } = session.state();
    if (mode !== 'idle') {
      const opts = mode === 'editing' ? { preserveFormState: true } : undefined;
      this.startDrawingInternal(shapeType, opts);
    } else {
      this.stopDrawingInternal();
    }
  });
}
```

`DrawingSessionService` no longer calls `drawToolService.startDrawing()` — it only updates state, and DrawToolService reacts.

---

### Option 3 — Combination

`DrawingSessionService` keeps imperative orchestration for multi-step sequences. `DrawToolService` has a lightweight `effect()` only as a **safety net**, not as the primary control path:

```typescript
// In DrawToolService constructor — safety net only
effect(() => {
  const isSessionActive = this.drawingSession.isActive();
  if (!isSessionActive && this.state.isDrawing) {
    // Session ended externally — ensure we're cleaned up
    this.cleanup();
  }
});
```

---

## 🏛️ Architect Analysis

### The core problem with Option 2: Transaction ordering

`startEditing` is a **transaction** — 6 steps that must execute in order, where each step's output is the next step's precondition:

```
Step 1: hideShape(id)
Step 2: startDrawing(type, {preserveFormState: true})
Step 3: fromShapeDto(dto)       ← must happen BEFORE loadPositionsFromForm
Step 4: markAsSaved(dto)
Step 5: setCurrentShapeType()
Step 6: loadPositionsFromForm() ← reads form state set in Step 3
```

`effect()` breaks this guarantee because:

1. Angular schedules effects **asynchronously** — they run after the current computation, not synchronously
2. If `DrawToolService.effect()` fires in response to a state change, `editShapeFacadeService.fromShapeDto(dto)` may not have run yet when `loadPositionsFromForm()` is called
3. Multiple effects across services run in an undefined order — you cannot rely on DrawToolService's effect running before or after `EditShapeFacadeService` reacts to the same state change

**Verdict:** `effect()` is the wrong primitive for ordered side-effect sequences. It is the right primitive for **rendering** (sync state → visual output).

### The right mental model for signals/effects

| Use Case                                                               | Right Tool                                 |
| ---------------------------------------------------------------------- | ------------------------------------------ |
| Derive a value from state (e.g., `isActive = mode !== 'idle'`)         | `computed()`                               |
| React to state change, order doesn't matter (e.g., update a DOM class) | `effect()`                                 |
| Execute a sequence of ordered operations with preconditions            | **Imperative method**                      |
| Sync signal state to a Cesium entity (one entity = one renderer)       | `effect()` in a dedicated renderer service |

### Dependency direction

Option 2 **inverts** the dependency graph:

```
Option 1 (current):
  DrawingSessionService → DrawToolService
  DrawingSessionService → SavedShapesService
  DrawingSessionService → EditShapeFacadeService

Option 2 (effect-driven):
  DrawToolService → DrawingSessionService
  DrawingSessionService → SavedShapesService    (still imperative)
  DrawingSessionService → EditShapeFacadeService (still imperative)
```

This inversion is incomplete — `DrawingSessionService` would still need to call `EditShapeFacadeService` and `SavedShapesService` imperatively (they can't be effects for the same ordering reason). You end up with a **mixed model**: imperative calls for some services, reactive effects for DrawToolService. That is harder to reason about, not easier.

### What effects are for in this codebase

The correct use of `effect()` for Cesium is what Option C in `refactor-draw-architecture.md` describes — a dedicated `CesiumRenderer` service that owns a single Cesium entity and has one effect that syncs `DrawingState` → entity properties. That pattern works because:

1. The renderer only READS state and writes to Cesium — no sequencing needed
2. It doesn't depend on any other service's state being "ready"
3. It can re-run idempotently

That future refactor (Option C) is the right home for `effect()`. Not DrawToolService in its current form.

---

## 🖥️ Frontend Expert Analysis

### Why `effect()` in a service constructor has practical drawbacks

**Testing complexity:**

- Option 1 (imperative): `service.startEditing(shape)` → `expect(drawTool.startDrawing).toHaveBeenCalled()` — synchronous, trivial to assert
- Option 2 (effect): `service._state.set(...)` → `TestBed.flushEffects()` → assert — requires test infrastructure for async flushing; the 24 tests we wrote would all need rework

**Angular 16 effect() in service constructors:**

- Requires the service to be constructed inside an injection context (guaranteed by `providedIn: 'root'`)
- BUT: effects do not run during `TestBed.configureTestingModule` setup — they require explicit flushing
- In production, effects run after change detection — in a Cesium app that bypasses Angular zone for rendering, this timing is unpredictable

**The signal pattern already in the codebase:**
Looking at `MapComponent` and `EditDrawComponent`, signals are used exactly right:

```typescript
// READ-ONLY consumption — correct use of signals
readonly isActive = computed(() => this._state().mode !== 'idle');

// In MapComponent template or guard — reactive read
get isDrawingMode(): boolean { return this.currentDrawType !== MapOperationsEnum.DRAW_NONE; }
```

Signals drive **template reactivity and computed derivations**. Services call other services **imperatively**. This is the consistent pattern throughout the codebase.

### The practical value of Option 3's safety net

A lightweight `effect()` in `DrawToolService` as a cleanup safety net is reasonable:

- It doesn't replace the orchestration — it supplements it
- It handles the edge case where a session ends through an unexpected path (e.g., component destruction)
- It's a one-line guard, not a control flow mechanism

However, it adds complexity that may not be needed. `DrawingSessionService.cancel()` is always called through well-tested paths, so the safety net may be premature optimisation.

---

## 🗳️ Discussion Vote

| Agent                        | Vote                                                   | Reason                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Architect** (3 votes)      | **Option 1 — keep as-is**                              | Transaction ordering is non-negotiable for correctness. Effect() is wrong for orchestration. The right home for effect() is a future CesiumRenderer (Option C).          |
| **Frontend Expert** (1 vote) | **Option 1 with Option 3 safety net considered later** | Consistent with existing codebase signal patterns. Testing is clean and synchronous. Option 3 safety net is a valid future addition once we have evidence of edge cases. |

**Total: Option 1 — 4/4 votes.**

---

## Decision

**Keep `DrawingSessionService` as the imperative coordinator. Keep `DrawToolService` as a passive service called imperatively.**

Signals on `DrawingSessionService` are used for:

- `isActive()` — guards and template reactivity (e.g., `canInteractWithSavedShapes`)
- `mode()`, `editingShapeId()`, `shapeType()` — observable state for future UI bindings

`effect()` will be the right tool when:

- Implementing Option C's `CesiumRenderer` — one service owns one entity, effect syncs state → entity
- Implementing `InputHandlerService` — one handler, mode-aware delegation via computed

**The rule:**

> `effect()` for rendering and observation. Imperative methods for sequenced orchestration.

---

## Impact on Current Plan

No change to TASK-A3 (already implemented per Option 1). No additional tasks.  
Option 3 safety net can be added in a follow-up if edge cases are discovered during testing.
