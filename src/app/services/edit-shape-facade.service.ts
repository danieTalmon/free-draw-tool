import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { OutlineType } from '@models/draw-event.model';
import { Subject, Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  shareReplay,
} from 'rxjs/operators';
import { MapLocation } from '@models/location';
import { ShapeDto, ShapeType } from '@models/shape.model';
import { MapOperationsEnum } from '@models/map-operations-enum';
import { ShapeApiService } from '@services/shape-api.service';
import { SavedShapesService } from '@services/saved-shapes.service';
import {
  mapLocationsToShapePoints,
  mapOperationToShapeType,
  shapePointsToMapLocations,
} from '@adapters/shape.adapter';

interface PendingGeometryOverride {
  points: MapLocation[];
  radius?: number;
}

type CoordinateForm = FormGroup<{
  latitude: FormControl<number | null>;
  longitude: FormControl<number | null>;
}>;

type AltitudeForm = FormGroup<{
  feet: FormControl<number | null>;
}>;

type PointForm = FormGroup<{
  coordinates: CoordinateForm;
  altitude: AltitudeForm;
}>;

type ShapeForm = FormGroup<{
  name: FormControl<string | null>;
  id: FormControl<string | null>;
  shapeType: FormControl<ShapeType | '' | null>;
  points: FormArray<PointForm>;
  lineType: FormControl<OutlineType | null>;
  lineWidth: FormControl<number | null>;
  lineColor: FormControl<string | null>;
  radius: FormControl<number | null>;
}>;

type StyleControlValueMap = {
  lineType: OutlineType;
  lineWidth: number;
  lineColor: string;
  radius: number;
};

type StyleInputName = keyof StyleControlValueMap;

@Injectable({
  providedIn: 'root',
})
export class EditShapeFacadeService implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly shapeApiService = inject(ShapeApiService);
  private readonly savedShapesService = inject(SavedShapesService);

  _shapeForm: ShapeForm;
  private readonly _destroy$ = new Subject<void>();
  private _updatingFromMap = false;
  private _lastSavedState: ShapeDto | null = null;
  private _pendingGeometryOverride: PendingGeometryOverride | null = null;
  private _currentShapeType: MapOperationsEnum = MapOperationsEnum.DRAW_NONE;

  /**
   * Signal-based unsaved changes indicator for OnPush components.
   * Updated explicitly after form mutations that use emitEvent: false.
   */
  readonly unsavedChangesSignal = signal(false);

  readonly nameChanges$: Observable<string>;
  readonly lineTypeChanges$: Observable<OutlineType>;
  readonly lineWidthChanges$: Observable<number>;
  readonly lineColorChanges$: Observable<string>;
  readonly pointsChanges$: Observable<MapLocation[]>;
  readonly radiusChanges$: Observable<number>;
  readonly shapeIdChanges$: Observable<string | null>;
  private readonly styleInputSetters: {
    [K in StyleInputName]: (value: StyleControlValueMap[K]) => void;
  };

  readonly getPointsFormArray = (): FormArray<PointForm> =>
    this.shapeForm.controls.points;

  readonly getStyleInputsFormArray = (): FormArray =>
    this.shapeForm.get('styleInputs') as unknown as FormArray;

  constructor() {
    this._shapeForm = this.fb.group({
      name: [''],
      id: [''],
      shapeType: ['' as ShapeType | ''],
      points: this.fb.array<PointForm>([]),
      lineType: [OutlineType.solid],
      lineWidth: [2],
      lineColor: ['#00ffff'],
      radius: [0],
    });

    this.nameChanges$ = this.shapeForm.controls.name.valueChanges.pipe(
      debounceTime(100),
      distinctUntilChanged(),
      map((value) => value ?? ''),
      shareReplay(1),
    );

    this.lineTypeChanges$ = this.shapeForm.controls.lineType.valueChanges.pipe(
      distinctUntilChanged(),
      map((value) => value ?? OutlineType.solid),
      shareReplay(1),
    );

    this.lineWidthChanges$ =
      this.shapeForm.controls.lineWidth.valueChanges.pipe(
        distinctUntilChanged(),
        map((value) => value ?? 2),
        shareReplay(1),
      );

    this.lineColorChanges$ =
      this.shapeForm.controls.lineColor.valueChanges.pipe(
        distinctUntilChanged(),
        map((value) => value ?? '#00ffff'),
        shareReplay(1),
      );

    this.pointsChanges$ = this.pointsArray.valueChanges.pipe(
      filter(() => !this._updatingFromMap),
      debounceTime(100),
      map((points) =>
        points.map((point) => ({
          latitude: { degrees: point.coordinates?.latitude ?? 0 },
          longitude: { degrees: point.coordinates?.longitude ?? 0 },
          altitude: { feet: point.altitude?.feet ?? 0 },
        })),
      ),
      shareReplay(1),
    );

    this.radiusChanges$ = this.shapeForm.controls.radius.valueChanges.pipe(
      distinctUntilChanged(),
      map((value) => value ?? 0),
      shareReplay(1),
    );

    this.shapeIdChanges$ = this.shapeForm.controls.id.valueChanges.pipe(
      distinctUntilChanged(),
      map((value) => {
        const id = String(value ?? '').trim();
        return id.length > 0 ? id : null;
      }),
      shareReplay(1),
    );

    this.styleInputSetters = {
      lineType: (value) => this._shapeForm.controls.lineType.setValue(value),
      lineWidth: (value) => this._shapeForm.controls.lineWidth.setValue(value),
      lineColor: (value) => this._shapeForm.controls.lineColor.setValue(value),
      radius: (value) => this._shapeForm.controls.radius.setValue(value),
    };

    // Subscribe to form value changes to keep unsavedChangesSignal in sync.
    // This covers both map-driven updates (with explicit refreshUnsavedChangesSignal calls)
    // and user-driven form edits (which emit valueChanges events).
    this._shapeForm.valueChanges.subscribe(() => {
      this.refreshUnsavedChangesSignal();
    });
  }

  get shapeForm(): ShapeForm {
    return this._shapeForm;
  }

  get pointsArray(): FormArray<PointForm> {
    return this._shapeForm.controls.points;
  }

  readonly addPoint = (location: MapLocation): void => {
    const pointGroup = this.createPointGroup(location);
    this.pointsArray.push(pointGroup);
  };

  readonly insertPointAt = (index: number, location: MapLocation): void => {
    const safeIndex = Math.max(0, Math.min(index, this.pointsArray.length));
    this.pointsArray.insert(safeIndex, this.createPointGroup(location));
  };

  readonly updatePoint = (location: MapLocation, index: number): void => {
    const pointGroup = this.pointsArray.at(index);
    pointGroup.patchValue(
      {
        coordinates: {
          latitude: location.latitude.degrees,
          longitude: location.longitude.degrees,
        },
        altitude: {
          feet: location.altitude.feet ?? 0,
        },
      },
      { emitEvent: true },
    );
    this.refreshUnsavedChangesSignal();
  };

  // Update radius in-place (called during circle drag — emitEvent:false prevents echo back to map)
  readonly updateRadius = (meters: number): void => {
    this._shapeForm.controls.radius.setValue(meters, { emitEvent: false });
    this.refreshUnsavedChangesSignal();
  };

  readonly setPendingGeometryOverride = (
    points: MapLocation[],
    radius?: number,
  ): void => {
    this._pendingGeometryOverride = {
      points: points.map((point) => ({
        latitude: { degrees: point.latitude.degrees },
        longitude: { degrees: point.longitude.degrees },
        altitude: { feet: point.altitude?.feet ?? 0 },
      })),
      radius,
    };
  };

  readonly clearPendingGeometryOverride = (): void => {
    this._pendingGeometryOverride = null;
  };

  readonly removePoint = (index: number): void => {
    this.pointsArray.removeAt(index);
  };

  readonly updateStyleInput = <K extends StyleInputName>(
    inputName: K,
    value: StyleControlValueMap[K],
  ): void => {
    this.styleInputSetters[inputName](value);
  };

  readonly resetForm = (): void => {
    this.clearPendingGeometryOverride();
    this._shapeForm.patchValue(
      {
        name: '',
        id: '',
        shapeType: '',
        lineType: OutlineType.solid,
        lineWidth: 2,
        lineColor: '#00ffff',
        radius: 0,
      },
      { emitEvent: false },
    );
    this.refreshUnsavedChangesSignal();
  };

  // Set all points from MapLocation array (called when drawing updates positions)
  readonly setPointsFromMapLocations = (locations: MapLocation[]): void => {
    this._updatingFromMap = true;

    while (this.pointsArray.length > 0) {
      this.pointsArray.removeAt(0, { emitEvent: false });
    }

    locations.forEach((location) => {
      this.pointsArray.push(this.createPointGroup(location), {
        emitEvent: false,
      });
    });

    this._updatingFromMap = false;
    this.refreshUnsavedChangesSignal();
  };

  // Patch points in-place from map updates when possible to preserve existing controls.
  readonly patchPointsFromMapLocations = (locations: MapLocation[]): void => {
    this._updatingFromMap = true;

    while (this.pointsArray.length < locations.length) {
      this.pointsArray.push(
        this.createPointGroup(locations[this.pointsArray.length]),
        { emitEvent: false },
      );
    }

    while (this.pointsArray.length > locations.length) {
      this.pointsArray.removeAt(this.pointsArray.length - 1, {
        emitEvent: false,
      });
    }

    locations.forEach((location, index) => {
      this.updatePoint(location, index);
    });

    this._updatingFromMap = false;
    this.refreshUnsavedChangesSignal();
  };

  // Check if currently updating from map (used to prevent echo)
  get updatingFromMap(): boolean {
    return this._updatingFromMap;
  }

  // Get point at index as MapLocation
  readonly getPointAsMapLocation = (index: number): MapLocation | null => {
    const pointGroup = this.pointsArray.at(index);
    if (!pointGroup) return null;

    const coords = pointGroup.controls.coordinates.getRawValue();
    const altitude = pointGroup.controls.altitude.getRawValue();

    return {
      latitude: { degrees: coords.latitude ?? 0 },
      longitude: { degrees: coords.longitude ?? 0 },
      altitude: { feet: altitude.feet ?? 0 },
    };
  };

  private createPointGroup(location: MapLocation): PointForm {
    return this.fb.group({
      coordinates: this.fb.group({
        latitude: [location.latitude.degrees, Validators.required],
        longitude: [location.longitude.degrees, Validators.required],
      }),
      altitude: this.fb.group({
        feet: [location.altitude?.feet ?? 0],
      }),
    });
  }

  // === Shape Type Tracking ===

  setCurrentShapeType(type: MapOperationsEnum): void {
    this._currentShapeType = type;
  }

  get currentShapeType(): MapOperationsEnum {
    return this._currentShapeType;
  }

  // === DTO Conversion ===

  /**
   * Convert current form state to ShapeDto for API
   */
  toShapeDto(): ShapeDto {
    const formValue = this._shapeForm.getRawValue();
    const resolvedShapeType =
      mapOperationToShapeType(this._currentShapeType) ??
      (formValue.shapeType as ShapeType | '');
    const points = (this._pendingGeometryOverride?.points ?? []).length
      ? mapLocationsToShapePoints(this._pendingGeometryOverride!.points)
      : this.pointsArray.getRawValue().map((point) => ({
          coordinates: {
            latitude: point.coordinates.latitude ?? 0,
            longitude: point.coordinates.longitude ?? 0,
          },
          altitude: {
            feet: point.altitude.feet ?? 0,
          },
        }));

    return {
      id: formValue.id || undefined,
      name: formValue.name || '',
      shapeType: (resolvedShapeType || 'DRAW_TEXT') as ShapeType,
      points,
      radius:
        (this._pendingGeometryOverride?.radius ?? formValue.radius) ||
        undefined,
      lineType: formValue.lineType || OutlineType.solid,
      lineWidth: formValue.lineWidth || 2,
      lineColor: formValue.lineColor || '#00ffff',
    };
  }

  /**
   * Save current form shape through API and persist it in local saved-shapes store.
   */
  saveCurrentShape(): Observable<ShapeDto> {
    const shapeDto = this.toShapeDto();
    return this.shapeApiService.save(shapeDto).pipe(
      tap((savedShape) => {
        this.savedShapesService.addShape(savedShape);
        this.clearPendingGeometryOverride();
        this.clearSavedState();
      }),
    );
  }

  /**
   * Load form state from ShapeDto
   */
  fromShapeDto(dto: ShapeDto): void {
    this.clearPendingGeometryOverride();
    this._shapeForm.patchValue({
      id: dto.id || '',
      name: dto.name || '',
      shapeType: dto.shapeType,
      lineType: dto.lineType || OutlineType.solid,
      lineWidth: dto.lineWidth || 2,
      lineColor: dto.lineColor || '#00ffff',
      radius: dto.radius || 0,
    });

    const locations = shapePointsToMapLocations(dto.points);
    this.patchPointsFromMapLocations(locations);
  }

  // === Save State Management ===

  /**
   * Mark current form state as saved
   */
  markAsSaved(savedDto: ShapeDto): void {
    this.clearPendingGeometryOverride();
    // Update form with server response (e.g., generated ID)
    if (savedDto.id) {
      this._shapeForm.patchValue({ id: savedDto.id });
    }

    // Snapshot the canonical current form state to avoid false positives
    // caused by transport/value-shape differences in the incoming DTO.
    this._lastSavedState = this.toShapeDto();
    this.refreshUnsavedChangesSignal();
  }

  /**
   * Check if form has unsaved changes
   */
  get hasUnsavedChanges(): boolean {
    const current = this.toShapeDto();
    const isNewShapeSession = !current.id;

    if (isNewShapeSession || !this._lastSavedState) {
      // New shape - has changes if any point has non-zero coordinates.
      // This intentionally ignores stale last-saved snapshots from previous sessions.
      return current.points.some(
        (point) =>
          point.coordinates.latitude !== 0 || point.coordinates.longitude !== 0,
      );
    }

    return JSON.stringify(current) !== JSON.stringify(this._lastSavedState);
  }

  /**
   * Check if shape was previously saved
   */
  get isSaved(): boolean {
    return this._lastSavedState !== null && !!this._lastSavedState.id;
  }

  /**
   * Get the current shape ID (if saved)
   */
  get shapeId(): string | null {
    return this._shapeForm.controls.id.value || null;
  }

  /**
   * Revert to last saved state, or reset if never saved
   */
  revertToLastSaved(): void {
    if (this._lastSavedState) {
      this.fromShapeDto(this._lastSavedState);
    } else {
      // Never saved - reset to defaults with minimum empty points
      this.resetForm();
    }
    this.refreshUnsavedChangesSignal();
  }

  /**
   * Clear the last saved state (called when starting a new shape)
   */
  clearSavedState(): void {
    this._lastSavedState = null;
    this.clearPendingGeometryOverride();
    this.refreshUnsavedChangesSignal();
  }

  /**
   * Get last saved state
   */
  get lastSavedState(): ShapeDto | null {
    return this._lastSavedState;
  }

  /**
   * Refresh the unsavedChangesSignal based on current form state.
   * Call this after any form mutation that uses emitEvent: false.
   */
  private readonly refreshUnsavedChangesSignal = (): void => {
    this.unsavedChangesSignal.set(this.hasUnsavedChanges);
  };

  ngOnDestroy(): void {
    this._destroy$.next();
    this._destroy$.complete();
  }
}
