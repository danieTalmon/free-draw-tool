# Plan: move mouse handler ownership to DrawToolService

## Goal

Migrate the Cesium mouse listener ownership so that DrawToolService becomes the single place that registers map input listeners, while SavedShapesMapOperationsService keeps the saved-shape interaction logic and state management.

## Relevant skills

- Engineering Workflow: break the refactor into small, verifiable steps and keep the work scoped.
- Frontend Expert: preserve Cesium/Angular interaction behavior while changing ownership boundaries.
- Tester Expert: add or update regression tests around drag, click, and context-menu flows.

## Current situation

- MapComponent currently creates and wires a dedicated ScreenSpaceEventHandler for saved-shape interactions.
- DrawToolService already owns drawing-related mouse handlers.
- SavedShapesMapOperationsService owns drag behavior, hit-testing, suppression state, and saved-shape updates.

## Target architecture

- DrawToolService becomes the only service that calls setInputAction on the Cesium handler.
- DrawToolService owns the handler lifecycle (create, register, destroy).
- SavedShapesMapOperationsService exposes interaction-focused methods for:
  - finding a saved shape at a screen position,
  - starting/continuing/finishing drag,
  - handling suppressed left-click behavior,
  - updating saved-shape state and form synchronization.
- MapComponent should only coordinate UI state and delegate interaction setup/teardown to DrawToolService.
- The refactor must preserve the existing distinction between:
  - dragging a single editable vertex, which should remain part of the drawing/editing flow, and
  - dragging the whole saved shape, which should remain a saved-shape interaction handled by SavedShapesMapOperationsService.

## Small implementation tasks

### Task 1 — Inventory current event ownership

- Review the current mouse handler setup in MapComponent, DrawToolService, and SavedShapesMapOperationsService.
- Document which events are handled by each service today.
- Confirm the current behavior for left click, right click, drag start, drag move, and drag end.

#### Current inventory findings

- DrawToolService currently owns the drawing/editing handler lifecycle and registers the drawing-related Cesium input actions for LEFT_DOWN, MOUSE_MOVE, LEFT_UP, and LEFT_CLICK.
- MapComponent currently creates a separate ScreenSpaceEventHandler for saved-shape interactions and wires LEFT_DOWN, MOUSE_MOVE, LEFT_UP, LEFT_CLICK, and RIGHT_CLICK for saved-shape selection, drag, and context-menu behavior.
- SavedShapesMapOperationsService does not register Cesium listeners itself; it provides the drag/state logic used by the handler in MapComponent, including hit-testing, drag start/update/finish, click suppression, and form synchronization.
- For this refactor, RIGHT_CLICK will remain owned by MapComponent so context-menu behavior stays localized to the UI layer.
- The current behavior already distinguishes two drag paths:
  - dragging a single editable vertex remains part of the drawing/editing flow inside DrawToolService, and
  - dragging a whole saved shape is handled through SavedShapesMapOperationsService logic, but the listener ownership is still split across services.

### Task 2 — Define the service boundary contract

- Decide which responsibilities belong to DrawToolService and which belong to SavedShapesMapOperationsService.
- Define a small interface for DrawToolService to delegate saved-shape interactions to SavedShapesMapOperationsService.
- Keep the contract narrow: event dispatching stays in DrawToolService, interaction logic stays in SavedShapesMapOperationsService.

#### Proposed boundary for Task 2

- DrawToolService will own:
  - the Cesium handler lifecycle,
  - registration of LEFT_DOWN, MOUSE_MOVE, LEFT_UP, and LEFT_CLICK,
  - drawing/editing state transitions,
  - the distinction between vertex drag and whole-shape drag initiation.
- SavedShapesMapOperationsService will own:
  - saved-shape hit detection and selection logic,
  - drag candidate start/update/finish behavior,
  - suppression of the next left click after a drag,
  - saved-shape state updates and form synchronization.
- MapComponent will keep:
  - RIGHT_CLICK handling for the context menu,
  - UI-level actions such as opening, closing, editing, and deleting shapes.
- The handoff between services should be a small callback-based contract, for example:
  - DrawToolService asks whether a left interaction should be treated as a saved-shape drag,
  - SavedShapesMapOperationsService returns a decision/result that DrawToolService uses to continue the current interaction flow.

### Task 3 — Introduce centralized interaction setup in DrawToolService

- Add a new method in DrawToolService to initialize shared map interaction listeners.
- Move the registration of LEFT_DOWN, MOUSE_MOVE, LEFT_UP, and LEFT_CLICK into DrawToolService.
- Keep RIGHT_CLICK in MapComponent so context-menu behavior remains in the UI layer.
- Ensure the same handler is destroyed cleanly when drawing sessions end or the component is destroyed.

### Task 4 — Split saved-shape behavior from UI orchestration

- Move the saved-shape-specific decision logic out of MapComponent and into SavedShapesMapOperationsService.
- Keep MapComponent responsible for UI concerns such as context-menu visibility and shape editing/deletion actions.
- Make SavedShapesMapOperationsService return the result of an interaction decision rather than directly manipulating the menu state.

### Task 5 — Refactor drag workflow to use the new ownership model

- Ensure DrawToolService triggers the saved-shape drag flow through SavedShapesMapOperationsService.
- Preserve the rule that a drag on a single vertex stays in the drawing/editing flow, while a drag on a saved shape starts the whole-shape drag workflow.
- Preserve existing drag threshold, suppression of the next click, and form-sync behavior.
- Keep drag state reset behavior consistent during component teardown and drawing session changes.

### Task 6 — Simplify MapComponent

- Remove the separate context-menu handler setup from MapComponent for the non-right-click interactions.
- Replace it with a single delegation call into DrawToolService for the shared left-click/drag interactions.
- Keep the RIGHT_CLICK handling in MapComponent for opening/closing the context menu and executing actions from the menu.

### Task 7 — Update tests and add regression coverage

- Update unit tests for DrawToolService and SavedShapesMapOperationsService to reflect the new ownership.
- Add tests for:
  - drag start and drag end,
  - left-click suppression after drag,
  - right-click opening the context menu,
  - proper handler cleanup on destroy/reset.
- Keep the behavior aligned with the existing map component expectations.

### Task 8 — Verify behavior end to end

- Run the relevant unit and end-to-end checks.
- Confirm that drawing interactions still work and that saved-shape interactions remain intact.
- Record any follow-up issues discovered during verification.

## Acceptance criteria

- DrawToolService is the only service that registers Cesium input listeners for map interactions.
- SavedShapesMapOperationsService no longer owns listener registration and only contains interaction logic/state.
- MapComponent no longer creates its own saved-shape event handler.
- Existing drag, click, and context-menu behavior remains intact.
- Tests cover the new ownership split and the preserved interaction behavior.

## Implementation notes

- Keep the refactor incremental and avoid changing the user-facing behavior during the migration.
- Prefer small commits per task so regressions are easy to isolate.
- Use a dedicated branch for this change.
