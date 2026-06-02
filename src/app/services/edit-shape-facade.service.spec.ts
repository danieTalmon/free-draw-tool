import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';

import { EditShapeFacadeService } from '@services/edit-shape-facade.service';
import { OutlineType } from '@models/draw-event.model';
import { MapOperationsEnum } from '@models/map-operations-enum';
import { MapLocation } from '@models/location';
import { ShapeDto } from '@models/shape.model';
import { ShapeApiService } from '@services/shape-api.service';
import { SavedShapesService } from '@services/saved-shapes.service';

describe('EditShapeFacadeService', () => {
  let service: EditShapeFacadeService;
  let shapeApiService: jasmine.SpyObj<ShapeApiService>;
  let savedShapesService: jasmine.SpyObj<SavedShapesService>;

  beforeEach(() => {
    const shapeApiSpy = jasmine.createSpyObj('ShapeApiService', ['save']);
    shapeApiSpy.save.and.returnValue(of({} as ShapeDto));
    const savedShapesSpy = jasmine.createSpyObj('SavedShapesService', [
      'addShape',
    ]);

    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      providers: [
        EditShapeFacadeService,
        { provide: ShapeApiService, useValue: shapeApiSpy },
        { provide: SavedShapesService, useValue: savedShapesSpy },
      ],
    });

    service = TestBed.inject(EditShapeFacadeService);
    shapeApiService = TestBed.inject(
      ShapeApiService,
    ) as jasmine.SpyObj<ShapeApiService>;
    savedShapesService = TestBed.inject(
      SavedShapesService,
    ) as jasmine.SpyObj<SavedShapesService>;
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Form Initialization', () => {
    it('should initialize form with default values', () => {
      const form = service.shapeForm;
      expect(form.get('name')?.value).toBe('');
      expect(form.get('id')?.value).toBe('');
      expect(form.get('lineType')?.value).toBe(OutlineType.solid);
      expect(form.get('lineWidth')?.value).toBe(2);
      expect(form.get('lineColor')?.value).toBe('#00ffff');
      expect(form.get('radius')?.value).toBe(0);
    });

    it('should have empty points array initially', () => {
      expect(service.pointsArray.length).toBe(0);
    });
  });

  describe('Point Management', () => {
    const testLocation: MapLocation = {
      latitude: { degrees: 32.0 },
      longitude: { degrees: 34.8 },
      altitude: { feet: 1000 },
    };

    it('should add a point to the form array', () => {
      service.addPoint(testLocation);
      expect(service.pointsArray.length).toBe(1);
    });

    it('should add point with correct coordinates', () => {
      service.addPoint(testLocation);
      const point = service.pointsArray.at(0).getRawValue();
      expect(point.coordinates.latitude).toBe(32.0);
      expect(point.coordinates.longitude).toBe(34.8);
      expect(point.altitude.feet).toBe(1000);
    });

    it('should update point at specific index', () => {
      service.addPoint(testLocation);
      const newLocation: MapLocation = {
        latitude: { degrees: 33.0 },
        longitude: { degrees: 35.0 },
        altitude: { feet: 2000 },
      };
      service.updatePoint(newLocation, 0);
      const point = service.pointsArray.at(0).getRawValue();
      expect(point.coordinates.latitude).toBe(33.0);
      expect(point.coordinates.longitude).toBe(35.0);
    });

    it('should remove point at specific index', () => {
      service.addPoint(testLocation);
      service.addPoint({ ...testLocation, latitude: { degrees: 33.0 } });
      expect(service.pointsArray.length).toBe(2);
      service.removePoint(0);
      expect(service.pointsArray.length).toBe(1);
    });

    it('should get point as MapLocation', () => {
      service.addPoint(testLocation);
      const result = service.getPointAsMapLocation(0);
      expect(result).toBeTruthy();
      expect(result?.latitude.degrees).toBe(32.0);
      expect(result?.longitude.degrees).toBe(34.8);
    });

    it('should return null for invalid point index', () => {
      const result = service.getPointAsMapLocation(999);
      expect(result).toBeNull();
    });

    it('should set points from MapLocation array', () => {
      const locations: MapLocation[] = [
        {
          latitude: { degrees: 32.0 },
          longitude: { degrees: 34.0 },
          altitude: { feet: 0 },
        },
        {
          latitude: { degrees: 33.0 },
          longitude: { degrees: 35.0 },
          altitude: { feet: 0 },
        },
        {
          latitude: { degrees: 34.0 },
          longitude: { degrees: 36.0 },
          altitude: { feet: 0 },
        },
      ];
      service.setPointsFromMapLocations(locations);
      expect(service.pointsArray.length).toBe(3);
    });

    it('should replace all existing points when setting from MapLocations', () => {
      service.addPoint(testLocation);
      service.addPoint(testLocation);
      expect(service.pointsArray.length).toBe(2);

      const newLocations: MapLocation[] = [
        {
          latitude: { degrees: 40.0 },
          longitude: { degrees: 40.0 },
          altitude: { feet: 0 },
        },
      ];
      service.setPointsFromMapLocations(newLocations);
      expect(service.pointsArray.length).toBe(1);
      expect(service.pointsArray.at(0).getRawValue().coordinates.latitude).toBe(
        40.0,
      );
    });
  });

  describe('Form Reset', () => {
    it('should reset form to default values', () => {
      service.shapeForm.patchValue({
        name: 'Test Shape',
        lineWidth: 6,
        lineColor: '#ff0000',
      });
      service.addPoint({
        latitude: { degrees: 32.0 },
        longitude: { degrees: 34.0 },
        altitude: { feet: 0 },
      });

      service.resetForm();

      expect(service.shapeForm.get('name')?.value).toBe('');
      expect(service.shapeForm.get('lineWidth')?.value).toBe(2);
      expect(service.pointsArray.length).toBe(1);
    });
  });

  describe('Style Updates', () => {
    it('should update radius', () => {
      service.updateRadius(500);
      expect(service.shapeForm.get('radius')?.value).toBe(500);
    });

    it('should update style input', () => {
      service.updateStyleInput('lineWidth', 6);
      expect(service.shapeForm.get('lineWidth')?.value).toBe(6);
    });
  });

  describe('Shape Type Tracking', () => {
    it('should set current shape type', () => {
      service.setCurrentShapeType(MapOperationsEnum.DRAW_CIRCLE);
      expect(service.currentShapeType).toBe(MapOperationsEnum.DRAW_CIRCLE);
    });

    it('should default to DRAW_NONE', () => {
      expect(service.currentShapeType).toBe(MapOperationsEnum.DRAW_NONE);
    });
  });

  describe('DTO Conversion', () => {
    it('should convert form to ShapeDto', () => {
      service.setCurrentShapeType(MapOperationsEnum.DRAW_POLYLINE);
      service.shapeForm.patchValue({
        name: 'Test Line',
        lineType: OutlineType.dashed,
        lineWidth: 4,
        lineColor: '#ff0000',
      });
      service.addPoint({
        latitude: { degrees: 32.0 },
        longitude: { degrees: 34.0 },
        altitude: { feet: 0 },
      });
      service.addPoint({
        latitude: { degrees: 33.0 },
        longitude: { degrees: 35.0 },
        altitude: { feet: 0 },
      });

      const dto = service.toShapeDto();

      expect(dto.name).toBe('Test Line');
      expect(dto.shapeType).toBe('DRAW_POLYLINE');
      expect(dto.lineType).toBe(OutlineType.dashed);
      expect(dto.lineWidth).toBe(4);
      expect(dto.points.length).toBe(2);
    });

    it('should prefer pending geometry override when converting to ShapeDto', () => {
      service.setCurrentShapeType(MapOperationsEnum.DRAW_TEXT);
      service.addPoint({
        latitude: { degrees: 32.0 },
        longitude: { degrees: 34.0 },
        altitude: { feet: 0 },
      });
      service.setPendingGeometryOverride([
        {
          latitude: { degrees: 33.2 },
          longitude: { degrees: 35.1 },
          altitude: { feet: 0 },
        },
      ]);

      const dto = service.toShapeDto();

      expect(dto.points[0].coordinates.longitude).toBe(35.1);
      expect(dto.points[0].coordinates.latitude).toBe(33.2);
    });

    it('should load form from ShapeDto', () => {
      const dto: ShapeDto = {
        id: 'test-id',
        name: 'Loaded Shape',
        shapeType: 'DRAW_CIRCLE',
        points: [
          {
            coordinates: { latitude: 32.0, longitude: 34.0 },
            altitude: { feet: 100 },
          },
        ],
        radius: 500,
        lineType: OutlineType.dotted,
        lineWidth: 6,
        lineColor: '#00ff00',
      };

      service.fromShapeDto(dto);

      expect(service.shapeForm.get('id')?.value).toBe('test-id');
      expect(service.shapeForm.get('name')?.value).toBe('Loaded Shape');
      expect(service.shapeForm.get('radius')?.value).toBe(500);
      expect(service.shapeForm.get('lineType')?.value).toBe(OutlineType.dotted);
      expect(service.pointsArray.length).toBe(1);
    });

    it('should patch existing placeholder point controls when loading ShapeDto', () => {
      service.setPointsFromMapLocations([
        {
          latitude: { degrees: 0 },
          longitude: { degrees: 0 },
          altitude: { feet: 0 },
        },
      ]);
      const originalPointControl = service.pointsArray.at(0);

      const dto: ShapeDto = {
        id: 'text-id',
        name: 'Loaded Text',
        shapeType: 'DRAW_TEXT',
        points: [
          {
            coordinates: { latitude: 32.1, longitude: 34.2 },
            altitude: { feet: 0 },
          },
        ],
        lineType: OutlineType.solid,
        lineWidth: 2,
        lineColor: '#00ffff',
      };

      service.fromShapeDto(dto);

      expect(service.pointsArray.at(0)).toBe(originalPointControl);
      expect(service.pointsArray.at(0).getRawValue().coordinates.latitude).toBe(
        32.1,
      );
      expect(
        service.pointsArray.at(0).getRawValue().coordinates.longitude,
      ).toBe(34.2);
    });
  });

  describe('Save State Management', () => {
    const createTestDto = (): ShapeDto => ({
      id: 'saved-id',
      name: 'Saved Shape',
      shapeType: 'DRAW_CIRCLE',
      points: [
        {
          coordinates: { latitude: 32.0, longitude: 34.0 },
          altitude: { feet: 0 },
        },
      ],
      lineType: OutlineType.solid,
      lineWidth: 2,
      lineColor: '#00ffff',
    });

    it('should mark shape as saved', () => {
      const dto = createTestDto();
      service.markAsSaved(dto);
      expect(service.isSaved).toBeTrue();
      expect(service.shapeId).toBe('saved-id');
    });

    it('should detect unsaved changes for new shape', () => {
      service.setCurrentShapeType(MapOperationsEnum.DRAW_CIRCLE);
      service.addPoint({
        latitude: { degrees: 32.0 },
        longitude: { degrees: 34.0 },
        altitude: { feet: 0 },
      });
      expect(service.hasUnsavedChanges).toBeTrue();
    });

    it('should not have unsaved changes when points are zero', () => {
      service.setCurrentShapeType(MapOperationsEnum.DRAW_CIRCLE);
      service.addPoint({
        latitude: { degrees: 0 },
        longitude: { degrees: 0 },
        altitude: { feet: 0 },
      });
      expect(service.hasUnsavedChanges).toBeFalse();
    });

    it('should revert to last saved state', () => {
      const dto = createTestDto();
      service.fromShapeDto(dto);
      service.markAsSaved(dto);

      // Make changes
      service.shapeForm.patchValue({ name: 'Modified Name' });
      expect(service.shapeForm.get('name')?.value).toBe('Modified Name');

      // Revert
      service.revertToLastSaved();
      expect(service.shapeForm.get('name')?.value).toBe('Saved Shape');
    });

    it('should treat pending dragged geometry as unsaved changes', () => {
      const dto = createTestDto();
      service.setCurrentShapeType(MapOperationsEnum.DRAW_CIRCLE);
      service.fromShapeDto(dto);
      service.markAsSaved(dto);

      service.setPendingGeometryOverride([
        {
          latitude: { degrees: 33.0 },
          longitude: { degrees: 35.0 },
          altitude: { feet: 0 },
        },
      ]);

      expect(service.hasUnsavedChanges).toBeTrue();
    });

    it('should reset form when reverting with no saved state', () => {
      service.shapeForm.patchValue({ name: 'Test' });
      service.revertToLastSaved();
      expect(service.shapeForm.get('name')?.value).toBe('');
    });

    it('should clear saved state', () => {
      const dto = createTestDto();
      service.markAsSaved(dto);
      expect(service.isSaved).toBeTrue();

      service.clearSavedState();
      expect(service.isSaved).toBeFalse();
    });

    it('should not report unsaved changes right after opening a saved shape', () => {
      const dto = createTestDto();

      service.fromShapeDto(dto);
      service.markAsSaved(dto);

      expect(service.hasUnsavedChanges).toBeFalse();
    });

    it('should update unsavedChangesSignal after patchPointsFromMapLocations with non-zero coordinates (B-015)', () => {
      service.setCurrentShapeType(MapOperationsEnum.DRAW_CIRCLE);
      service.clearSavedState();

      expect(service.unsavedChangesSignal()).toBeFalse();

      service.patchPointsFromMapLocations([
        {
          latitude: { degrees: 32.0 },
          longitude: { degrees: 34.0 },
          altitude: { feet: 0 },
        },
      ]);

      expect(service.unsavedChangesSignal()).toBeTrue();
    });

    it('should update unsavedChangesSignal after updateRadius for new shape (B-015)', () => {
      service.setCurrentShapeType(MapOperationsEnum.DRAW_CIRCLE);
      service.clearSavedState();
      service.patchPointsFromMapLocations([
        {
          latitude: { degrees: 32.0 },
          longitude: { degrees: 34.0 },
          altitude: { feet: 0 },
        },
      ]);

      service.updateRadius(500);

      expect(service.unsavedChangesSignal()).toBeTrue();
    });

    it('should reset unsavedChangesSignal to false after markAsSaved (B-015)', () => {
      service.setCurrentShapeType(MapOperationsEnum.DRAW_CIRCLE);
      service.patchPointsFromMapLocations([
        {
          latitude: { degrees: 32.0 },
          longitude: { degrees: 34.0 },
          altitude: { feet: 0 },
        },
      ]);

      expect(service.unsavedChangesSignal()).toBeTrue();

      const dto = service.toShapeDto();
      dto.id = 'saved-id';
      service.markAsSaved(dto);

      expect(service.unsavedChangesSignal()).toBeFalse();
    });
  });

  describe('Observable Changes', () => {
    it('should emit line type changes', fakeAsync(() => {
      let emittedValue: OutlineType | undefined;
      service.lineTypeChanges$.subscribe((value) => {
        emittedValue = value;
      });

      service.shapeForm.get('lineType')?.setValue(OutlineType.dashed);
      tick(100);

      expect(emittedValue).toBe(OutlineType.dashed);
    }));

    it('should emit line width changes', fakeAsync(() => {
      let emittedValue: number | undefined;
      service.lineWidthChanges$.subscribe((value) => {
        emittedValue = value;
      });

      service.shapeForm.get('lineWidth')?.setValue(6);
      tick(100);

      expect(emittedValue).toBe(6);
    }));

    it('should emit line color changes', fakeAsync(() => {
      let emittedValue: string | undefined;
      service.lineColorChanges$.subscribe((value) => {
        emittedValue = value;
      });

      service.shapeForm.get('lineColor')?.setValue('#ff0000');
      tick(100);

      expect(emittedValue).toBe('#ff0000');
    }));

    it('should emit radius changes', fakeAsync(() => {
      let emittedValue: number | undefined;
      service.radiusChanges$.subscribe((value) => {
        emittedValue = value;
      });

      service.shapeForm.get('radius')?.setValue(1000);
      tick(100);

      expect(emittedValue).toBe(1000);
    }));
  });

  describe('Updating From Map Flag', () => {
    it('should track updatingFromMap state', () => {
      expect(service.updatingFromMap).toBeFalse();

      service.setPointsFromMapLocations([
        {
          latitude: { degrees: 32.0 },
          longitude: { degrees: 34.0 },
          altitude: { feet: 0 },
        },
      ]);

      // After setPointsFromMapLocations completes, flag should be false
      expect(service.updatingFromMap).toBeFalse();
    });
  });

  describe('pointsChanges$ filter (B-016)', () => {
    it('should NOT emit when patchPointsFromMapLocations is called', fakeAsync(() => {
      // Initialize a point so the form array has content
      service.patchPointsFromMapLocations([
        {
          latitude: { degrees: 0 },
          longitude: { degrees: 0 },
          altitude: { feet: 0 },
        },
      ]);
      tick(200);

      const emissions: any[] = [];
      service.pointsChanges$.subscribe((val) => emissions.push(val));

      // Map-driven update should be filtered
      service.patchPointsFromMapLocations([
        {
          latitude: { degrees: 32.0 },
          longitude: { degrees: 34.0 },
          altitude: { feet: 0 },
        },
      ]);
      tick(200);

      expect(emissions.length).toBe(0);
    }));

    it('should NOT emit when setPointsFromMapLocations is called', fakeAsync(() => {
      const emissions: any[] = [];
      service.pointsChanges$.subscribe((val) => emissions.push(val));

      service.setPointsFromMapLocations([
        {
          latitude: { degrees: 32.0 },
          longitude: { degrees: 34.0 },
          altitude: { feet: 0 },
        },
      ]);
      tick(200);

      expect(emissions.length).toBe(0);
    }));

    it('should emit when user types into form directly', fakeAsync(() => {
      // Initialize form with a point
      service.patchPointsFromMapLocations([
        {
          latitude: { degrees: 0 },
          longitude: { degrees: 0 },
          altitude: { feet: 0 },
        },
      ]);
      tick(200);

      const emissions: any[] = [];
      service.pointsChanges$.subscribe((val) => emissions.push(val));

      // Simulate user typing (direct form patch, not via map methods)
      service.pointsArray.at(0).patchValue({
        coordinates: { latitude: 32.1, longitude: 34.8 },
      });
      tick(200);

      expect(emissions.length).toBe(1);
      expect(emissions[0][0].latitude.degrees).toBe(32.1);
      expect(emissions[0][0].longitude.degrees).toBe(34.8);
    }));
  });
});
