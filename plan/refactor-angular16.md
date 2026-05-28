# Angular 16 Refactor Plan

Date: 2026-05-27
Status: Phase 5 in progress, Phase 6 in progress
Workflow: TEAM-WORKFLOW (approval gate per phase)

## Refactor Goals

- Upgrade framework to Angular 16.
- Keep Angular Material support working on Angular Material 16/CDK 16.
- Move to full standalone architecture (later phases).
- Migrate constructor DI to inject() (later phases).
- Introduce typed forms (later phases).
- Adopt signals aggressively where state semantics fit (later phases).
- Apply OnPush change detection to components (later phases).

## Scope and Boundaries

In scope for Phase 1:

- Framework and tooling upgrade only.
- Material/CDK compatibility upgrade.
- Compile and test compatibility fixes needed to restore green baseline.

Out of scope for Phase 1:

- Standalone component migration.
- inject() migration.
- typed forms migration.
- signal migration.
- OnPush rollout.

## Team Discussion Summary

### Frontend Expert Summary

- Material usage is straightforward and should migrate to v16 with low template churn.
- Standalone migration is feasible but should be phased from leaf components to map-heavy components.
- OnPush risk is highest around Cesium integration and external state mutation.

### Tester Expert Summary

- Primary migration risks are test fragility from framework-level changes and timing assumptions.
- Keep Karma/Jasmine during migration to reduce moving parts.
- Run strict phase validation after each migration step.

### Project Architect Summary

- Use rollback-safe phases with hard validation gates.
- Preserve runtime behavior in Phase 1 and defer architecture refactors to later phases.
- Sequence: platform upgrade first, architecture refactor second.

## Approval Model

- Approval cadence: per phase.
- Current approved phase: Phase 2.
- Next gate after completion: approval to start Phase 3.

## Phase Breakdown

### Phase 1: Angular 16 and Material 16 Platform Upgrade (Completed)

#### Task 1.1: Core Angular Toolchain Upgrade

- Update Angular framework and CLI/build toolchain from 13.x to 16.x.
- Update TypeScript and zone.js to Angular 16 compatible versions.
- Keep module-based app architecture unchanged in this phase.

Acceptance criteria:

- Dependency installation completes.
- App builds successfully.

#### Task 1.2: Material/CDK Upgrade

- Upgrade @angular/material and @angular/cdk to 16.x.
- Keep current module imports and templates behavior-compatible.

Acceptance criteria:

- Material controls compile and render with no API breakage.

#### Task 1.3: Compatibility Fixes

- Apply minimal code/config changes required by the platform upgrade.
- Preserve behavior parity.

Acceptance criteria:

- Build and tests run successfully.
- No refactor features from later phases leak into this phase.

#### Task 1.4: Validation and Report

- Run build and unit tests.
- Record known issues and carry-over risks for Phase 2 planning.

Acceptance criteria:

- Baseline report captured.
- Phase 1 close-out checklist complete.

## Verification Commands for Phase 1

1. npm install
2. npm run build
3. npm test -- --watch=false --browsers=ChromeHeadless

## Risks and Mitigation

- Risk: Cesium and Angular toolchain compatibility warnings.
  - Mitigation: keep runtime behavior unchanged and validate draw/edit critical paths.
- Risk: test timing shifts after framework upgrade.
  - Mitigation: keep existing test framework and apply minimal compatibility fixes.
- Risk: package peer dependency conflicts.
  - Mitigation: resolve with Angular 16-aligned package set and rerun clean install.

## Phase Completion Checklist

- [x] Task 1.1 complete
- [x] Task 1.2 complete
- [x] Task 1.3 complete
- [x] Task 1.4 complete
- [x] Build green (development configuration)
- [x] Unit tests green
- [x] Baseline report added to this file

## Phase 1 Baseline Report

Date: 2026-05-27

### Task 1.1 Results: Core Angular Toolchain Upgrade

- Angular framework packages upgraded to 16.2.x.
- Angular CLI and build toolchain upgraded to 16.2.x.
- Angular migrations executed through required path:
  - 13 -> 14
  - 14 -> 15
  - 15 -> 16
- Migration updates applied by schematics:
  - angular.json cleanup (removed deprecated defaultProject setting)
  - tsconfig.json target/useDefineForClassFields alignment
  - src/test.ts Karma bootstrap compatibility updates

### Task 1.2 Results: Material/CDK Upgrade

- @angular/material upgraded to 16.2.x.
- @angular/cdk upgraded to 16.2.x.
- Existing module imports and templates remained compatible.

### Task 1.3 Results: Compatibility Fixes

- One strict typing issue surfaced in unit tests after upgrade:
  - Updated host form control typing in style input spec to allow string and number test values.
- File updated:
  - src/app/components/style-input/style-input.component.spec.ts

### Task 1.4 Results: Validation

Commands executed:

1. npm run build
2. npm run build -- --configuration development
3. npm test -- --watch=false --browsers=ChromeHeadless

Outcome summary:

- Production build command compiles but fails on pre-existing component style budget threshold in edit-draw.component.scss.
- Development build succeeds.
- Unit tests pass: 328 SUCCESS.

Known carry-over item for next phase gate:

- Decide whether to keep strict production style budget threshold as-is or adjust budget values before release-oriented builds.

## Phase 2: Standalone Architecture Migration (Completed)

## Phase 2 Progress Log

### Task 2.1: Convert leaf/presentational components to standalone

Status: complete

Implemented:

- Converted these components to standalone:
  - src/app/components/style-input/style-input.component.ts
  - src/app/components/coordinate-selector/coordinate-selector.component.ts
  - src/app/components/shape-context-menu/shape-context-menu.component.ts
- Updated module wiring to import standalone components and remove them from declarations:
  - src/app/app.module.ts
- Updated affected standalone tests setup:
  - src/app/components/style-input/style-input.component.spec.ts
  - src/app/components/shape-context-menu/shape-context-menu.component.spec.ts

Validation:

1. npm run build -- --configuration development: PASS
2. npm test -- --watch=false --browsers=ChromeHeadless: PASS (TOTAL: 328 SUCCESS)

### Task 2.2: Convert form-integrated components to standalone

Status: complete

Implemented:

- Converted these components to standalone:
  - src/app/components/edit-draw-points/edit-draw-points.component.ts
  - src/app/components/edit-draw/edit-draw.component.ts
- Added explicit standalone imports for ReactiveForms and child standalone dependencies.

### Task 2.3: Convert map/root smart components to standalone

Status: complete

Implemented:

- Converted these components to standalone:
  - src/app/components/map/map.component.ts
  - src/app/app.component.ts
- Added explicit standalone imports for template dependencies.

### Task 2.4: Replace AppModule bootstrap with standalone bootstrapApplication

Status: complete

Implemented:

- Switched root bootstrap:
  - src/main.ts now uses bootstrapApplication(AppComponent)
- Added provider-based app bootstrap setup (animations, HTTP client, router).
- Removed obsolete module wiring file:
  - deleted src/app/app.module.ts

### Phase 2 Validation (Final)

1. get_errors: no errors found
2. npm run build -- --configuration development: PASS
3. npm test -- --watch=false --browsers=ChromeHeadless: PASS (TOTAL: 328 SUCCESS)

## Planned Next Phases

- Phase 5: aggressive signals adoption.
- Phase 6: OnPush rollout.
- Phase 7: full regression and release readiness.

## Phase 3: Constructor DI to inject() (Completed)

### Task 3.1 and 3.2

Status: complete

Implemented:

- Migrated runtime services to inject()-based DI:
  - src/app/services/shape-api.service.ts
  - src/app/services/draw-tool.service.ts
  - src/app/services/saved-shapes.service.ts
  - src/app/services/saved-shapes-map-operations.service.ts
  - src/app/services/edit-shape-facade.service.ts
- Migrated runtime components to inject()-based DI:
  - src/app/components/map/map.component.ts
  - src/app/components/edit-draw/edit-draw.component.ts
  - src/app/components/edit-draw-points/edit-draw-points.component.ts
- Removed no-op constructor from coordinate-selector component:
  - src/app/components/coordinate-selector/coordinate-selector.component.ts

### Task 3.3 Validation

1. get_errors: no errors found
2. npm run build -- --configuration development: PASS
3. npm test -- --watch=false --browsers=ChromeHeadless: PASS (TOTAL: 328 SUCCESS)

## Phase 4: Typed Forms Migration (Completed)

### Task 4.1 and 4.2

Status: complete

Implemented:

- Added explicit typed form models for shape editing form structure in:
  - src/app/services/edit-shape-facade.service.ts
- Typed points array and nested controls (coordinates, altitude) to reduce unsafe casting.
- Typed style control update path by key/value mapping to remove cast-based writes.

### Task 4.3 and 4.4

Status: complete

Implemented:

- Updated typed-form dependent tests to use getRawValue() where strict typed form values are Partial in:
  - src/app/services/edit-shape-facade.service.spec.ts
  - src/app/services/draw-tool.service.spec.ts
  - src/app/components/edit-draw-points/edit-draw-points.component.spec.ts
- Kept behavior parity for draw/edit/save flows while tightening compile-time checks.

### Phase 4 Validation

1. get_errors: no errors found
2. npm run build -- --configuration development: PASS
3. npm test: PASS (TOTAL: 328 SUCCESS)

## Phase 5: Signals Adoption (In Progress)

### Task 5.1: Introduce signal-backed state for map draw mode

Status: complete

Implemented:

- Added signal source of truth for draw mode state in:
  - src/app/services/map.service.ts
- Exposed read-only signal API:
  - editDrawShapeSignal
- Preserved compatibility APIs for existing consumers:
  - editDrawShape$
  - setEditDrawShape(...)
  - getEditDrawShape()
- Implemented observable compatibility without introducing duplicate state storage.
- Stabilized related async subscription tests:
  - src/app/components/map/map.component.spec.ts
  - src/app/components/edit-draw/edit-draw.component.spec.ts

### Task 5.2: Replace local imperative state where signal semantics fit

Status: partial

Implemented so far:

- Replaced draw mode observable subscription in edit panel with effect-driven synchronization in:
  - src/app/components/edit-draw/edit-draw.component.ts

Remaining targets:

- Derivable UI state in map/edit components (for example, draw-mode dependent visibility/title state).
- Avoid migrating Cesium mutable engine state directly to signals in this phase.

### Task 5.3: Validation and risk checks

Status: partial

Validation gate:

1. get_errors clean: PASS
2. npm run build -- --configuration development: PASS
3. npm test -- --watch=false --browsers=ChromeHeadless: PASS (TOTAL: 328 SUCCESS)

Known risks and constraints:

- Cesium runtime state is mutation-heavy and should stay service-owned; only app-level reactive state should move to signals.
- Keep rollout incremental and preserve observable compatibility until Phase 6 OnPush work is complete.

## Phase 6: OnPush Rollout (In Progress)

### Task 6.1: Enable OnPush on low-risk components first

Status: complete

Implemented:

- Enabled ChangeDetectionStrategy.OnPush in:
  - src/app/app.component.ts
  - src/app/components/style-input/style-input.component.ts
  - src/app/components/coordinate-selector/coordinate-selector.component.ts
  - src/app/components/edit-draw-points/edit-draw-points.component.ts
- Attempted OnPush in context menu component, then rolled back due test interaction failures:
  - src/app/components/shape-context-menu/shape-context-menu.component.ts

### Task 6.2: Validate and gate for smart components

Status: complete

Implemented:

- Enabled ChangeDetectionStrategy.OnPush in smart components:
  - src/app/components/map/map.component.ts
  - src/app/components/edit-draw/edit-draw.component.ts
- Added explicit change detection hooks for async boundaries:
  - markForCheck() after map draw-mode subscription and relevant async callbacks.
  - NgZone.run(...) wrappers for Cesium input handlers that mutate component state.
  - markForCheck() in edit panel effect/subscription handlers.

Validation executed:

1. npm run build -- --configuration development: PASS
2. npm test -- --watch=false --browsers=ChromeHeadless: PASS (TOTAL: 328 SUCCESS)

Residual exception:

- src/app/components/shape-context-menu/shape-context-menu.component.ts intentionally remains default change detection due current test interaction assumptions.
