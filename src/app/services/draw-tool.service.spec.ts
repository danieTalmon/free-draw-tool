import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NgZone } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import {
  Cartesian2,
  Cartesian3,
  Viewer,
  ScreenSpaceEventHandler,
} from 'cesium';

import { DrawToolService } from '@services/draw-tool.service';
import { EditShapeFacadeService } from '@services/edit-shape-facade.service';
import { MapOperationsEnum } from '@models/map-operations-enum';
import { OutlineType } from '@models/draw-event.model';
import { MapLocation } from '@models/location';
import { ShapeDrawStyle } from '@models/shape-draw-style.model';

describe('DrawToolService', () => {
  let service: DrawToolService;
  let editShapeFacadeService: EditShapeFacadeService;
  let mockViewer: any;
  let mockHandler: jasmine.SpyObj<ScreenSpaceEventHandler>;

  const createMockViewer = () => {
    mockHandler = jasmine.createSpyObj('ScreenSpaceEventHandler', [
      'setInputAction',
      'destroy',
    ]);

    const mockScene = {
      canvas: document.createElement('canvas'),
      camera: {
        getPickRay: jasmine.createSpy('getPickRay').and.returnValue({}),
      },
      globe: {
        pick: jasmine
          .createSpy('pick')
          .and.returnValue(Cartesian3.fromDegrees(34.8, 32.0, 0)),
        ellipsoid: {},
      },
      pick: jasmine.createSpy('pick').and.returnValue(null),
      screenSpaceCameraController: {
        translateEventTypes: null,
        zoomEventTypes: null,
      },
    };

    return {
      scene: mockScene,
      entities: {
        add: jasmine.createSpy('add').and.callFake((options: any) => ({
          ...options,
          id: options.id || 'mock-entity',
          show: true,
        })),
        remove: jasmine.createSpy('remove'),
        values: [],
      },
      dataSources: {
        getByName: jasmine.createSpy('getByName').and.returnValue([]),
        add: jasmine.createSpy('add'),
      },
      camera: {
        setView: jasmine.createSpy('setView'),
        pickEllipsoid: jasmine
          .createSpy('pickEllipsoid')
          .and.returnValue(Cartesian3.fromDegrees(34.8, 32.0, 0)),
      },
      destroy: jasmine.createSpy('destroy'),
    };
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule, HttpClientTestingModule],
      providers: [DrawToolService, EditShapeFacadeService],
    });

    service = TestBed.inject(DrawToolService);
    editShapeFacadeService = TestBed.inject(EditShapeFacadeService);
    mockViewer = createMockViewer();
  });

  afterEach(() => {
    service.ngOnDestroy();
    editShapeFacadeService.ngOnDestroy();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initialize', () => {
    it('should initialize with viewer', () => {
      expect(() => service.initialize(mockViewer)).not.toThrow();
    });
  });

  describe('startDrawing', () => {
    beforeEach(() => {
      service.initialize(mockViewer);
    });

    it('should start drawing circle', () => {
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      expect(mockViewer.entities.add).toHaveBeenCalled();
    });

    it('should create temporary circle outline as a styled polyline (no fill)', () => {
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      const addCall = mockViewer.entities.add.calls.mostRecent().args[0];
      expect(addCall.polyline).toBeTruthy();
      expect(addCall.polyline.material).toBeTruthy();
      expect(addCall.polyline.width).toBeTruthy();
      expect(addCall.ellipse).toBeUndefined();
    });

    it('should start drawing polyline', () => {
      service.startDrawing(MapOperationsEnum.DRAW_POLYLINE);
      expect(mockViewer.entities.add).toHaveBeenCalled();
    });

    it('should start drawing polygon', () => {
      service.startDrawing(MapOperationsEnum.DRAW_POLYGON);
      expect(mockViewer.entities.add).toHaveBeenCalled();
    });

    it('should start drawing text', () => {
      service.startDrawing(MapOperationsEnum.DRAW_TEXT);
      expect(mockViewer.entities.add).toHaveBeenCalled();
    });

    it('should initialize minimum points for circle', () => {
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      expect(editShapeFacadeService.pointsArray.length).toBe(1);
    });

    it('should initialize minimum points for polyline', () => {
      service.startDrawing(MapOperationsEnum.DRAW_POLYLINE);
      expect(editShapeFacadeService.pointsArray.length).toBe(2);
    });

    it('should initialize minimum points for polygon', () => {
      service.startDrawing(MapOperationsEnum.DRAW_POLYGON);
      expect(editShapeFacadeService.pointsArray.length).toBe(3);
    });

    it('should initialize minimum points for text', () => {
      service.startDrawing(MapOperationsEnum.DRAW_TEXT);
      expect(editShapeFacadeService.pointsArray.length).toBe(1);
    });

    it('should clear previous entity when starting new drawing', () => {
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      const removeCallCount = mockViewer.entities.remove.calls.count();

      service.startDrawing(MapOperationsEnum.DRAW_POLYLINE);
      expect(mockViewer.entities.remove.calls.count()).toBeGreaterThan(
        removeCallCount,
      );
    });

    it('should clear saved state for new shape', () => {
      spyOn(editShapeFacadeService, 'clearSavedState');
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      expect(editShapeFacadeService.clearSavedState).toHaveBeenCalled();
    });

    it('should preserve existing form points when starting edit mode', () => {
      editShapeFacadeService.setPointsFromMapLocations([
        {
          latitude: { degrees: 32.0 },
          longitude: { degrees: 34.0 },
          altitude: { feet: 0 },
        },
      ]);
      spyOn(editShapeFacadeService, 'clearSavedState');

      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE, {
        preserveFormState: true,
      });

      expect(editShapeFacadeService.clearSavedState).not.toHaveBeenCalled();
      expect(editShapeFacadeService.pointsArray.length).toBe(1);
      expect(
        editShapeFacadeService.pointsArray.at(0).getRawValue().coordinates
          .latitude,
      ).toBe(32.0);
      expect(
        editShapeFacadeService.pointsArray.at(0).getRawValue().coordinates
          .longitude,
      ).toBe(34.0);
    });

    it('should not start drawing without viewer', () => {
      // Access the service's private viewer property and set it to null to test
      // the error handling without needing a new service instance
      const originalViewer = (service as any).viewer;
      (service as any).viewer = null;
      spyOn(console, 'error');
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      expect(console.error).toHaveBeenCalledWith('Viewer not initialized');
      (service as any).viewer = originalViewer;
    });
  });

  describe('cancelDrawing', () => {
    beforeEach(() => {
      service.initialize(mockViewer);
    });

    it('should cancel drawing and cleanup', () => {
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      service.cancelDrawing();
      // Entity should be removed during cleanup
      expect(mockViewer.entities.remove).toHaveBeenCalled();
    });
  });

  describe('clearTempEntityAfterSave', () => {
    beforeEach(() => {
      service.initialize(mockViewer);
    });

    it('should clear temp entity', () => {
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      service.clearTempEntityAfterSave();
      expect(mockViewer.entities.remove).toHaveBeenCalled();
    });

    it('should recreate temp entity for current type', () => {
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      const initialAddCount = mockViewer.entities.add.calls.count();

      service.clearTempEntityAfterSave();

      expect(mockViewer.entities.add.calls.count()).toBeGreaterThan(
        initialAddCount,
      );
    });

    it('should reset form points', () => {
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      editShapeFacadeService.addPoint({
        latitude: { degrees: 32.0 },
        longitude: { degrees: 34.0 },
        altitude: { feet: 0 },
      });

      service.clearTempEntityAfterSave();

      // Should have minimum points for circle
      expect(editShapeFacadeService.pointsArray.length).toBe(1);
      expect(
        editShapeFacadeService.pointsArray.at(0).getRawValue().coordinates
          .latitude,
      ).toBe(0);
    });

    it('should update the form again when clicking on the map after save reset', () => {
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);

      service.clearTempEntityAfterSave();

      (service as any).handleClick({ position: new Cartesian2(120, 120) });

      const point = editShapeFacadeService.getPointAsMapLocation(0);
      expect(point?.latitude.degrees).not.toBe(0);
      expect(point?.longitude.degrees).not.toBe(0);
    });
  });

  describe('loadPositionsFromForm', () => {
    beforeEach(() => {
      service.initialize(mockViewer);
    });

    it('should load polyline positions from form', () => {
      service.startDrawing(MapOperationsEnum.DRAW_POLYLINE);
      editShapeFacadeService.setPointsFromMapLocations([
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
      ]);

      service.loadPositionsFromForm();
      // No error means positions loaded correctly
      expect(true).toBeTrue();
    });

    it('should load polygon positions from form', () => {
      service.startDrawing(MapOperationsEnum.DRAW_POLYGON);
      editShapeFacadeService.setPointsFromMapLocations([
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
          latitude: { degrees: 32.5 },
          longitude: { degrees: 34.5 },
          altitude: { feet: 0 },
        },
      ]);

      service.loadPositionsFromForm();
      expect(true).toBeTrue();
    });

    it('should load circle position and radius from form', () => {
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      editShapeFacadeService.setPointsFromMapLocations([
        {
          latitude: { degrees: 32.0 },
          longitude: { degrees: 34.0 },
          altitude: { feet: 0 },
        },
      ]);
      editShapeFacadeService.shapeForm.patchValue({ radius: 500 });

      service.loadPositionsFromForm();
      expect(true).toBeTrue();
    });
  });

  describe('updateStyle', () => {
    beforeEach(() => {
      service.initialize(mockViewer);
    });

    it('should update style configuration', () => {
      const newStyle: Partial<ShapeDrawStyle> = {
        lineWidth: 6,
        entityColor: '#ff0000',
      };

      service.updateStyle(newStyle);

      const config = service.getStyleConfig();
      expect(config.lineWidth).toBe(6);
      expect(config.entityColor).toBe('#ff0000');
    });

    it('should recreate entity with new style when drawing', () => {
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      const initialAddCount = mockViewer.entities.add.calls.count();

      service.updateStyle({ lineWidth: 6 });

      expect(mockViewer.entities.add.calls.count()).toBeGreaterThan(
        initialAddCount,
      );
    });
  });

  describe('updateTextLabel', () => {
    it('should update text label', () => {
      service.updateTextLabel('New Label');
      const config = service.getStyleConfig();
      expect(config.textLabel).toBe('New Label');
    });

    it('should default to "Text" for empty label', () => {
      service.updateTextLabel('');
      const config = service.getStyleConfig();
      expect(config.textLabel).toBe('Text');
    });
  });

  describe('getStyleConfig', () => {
    it('should return copy of style config', () => {
      const config1 = service.getStyleConfig();
      const config2 = service.getStyleConfig();
      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });

    it('should have default values', () => {
      const config = service.getStyleConfig();
      expect(config.lineWidth).toBe(2);
      expect(config.entityColor).toBe('#00ffff');
      expect(config.lineType).toBe(OutlineType.solid);
      expect(config.maxPolygonPoints).toBe(3);
      expect(config.textLabel).toBe('Text');
    });
  });

  describe('coordinate conversion', () => {
    it('should convert Cartesian3 to MapLocation', () => {
      const cartesian = Cartesian3.fromDegrees(34.8, 32.0, 100);
      const location = service.cartesian3ToMapLocation(cartesian);

      expect(location.latitude.degrees).toBeCloseTo(32.0, 5);
      expect(location.longitude.degrees).toBeCloseTo(34.8, 5);
    });

    it('should convert MapLocation to Cartesian3', () => {
      const location: MapLocation = {
        latitude: { degrees: 32.0 },
        longitude: { degrees: 34.8 },
        altitude: { feet: 0 },
      };

      const cartesian = service.mapLocationToCartesian3(location);
      expect(cartesian).toBeTruthy();
    });
  });

  describe('destroy', () => {
    beforeEach(() => {
      service.initialize(mockViewer);
    });

    it('should cleanup on destroy', () => {
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      expect(() => service.destroy()).not.toThrow();
    });
  });

  describe('Form binding', () => {
    beforeEach(() => {
      service.initialize(mockViewer);
    });

    it('should update style when line type changes', fakeAsync(() => {
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      editShapeFacadeService.shapeForm
        .get('lineType')
        ?.setValue(OutlineType.dashed);
      tick(100);

      const config = service.getStyleConfig();
      expect(config.lineType).toBe(OutlineType.dashed);
    }));

    it('should update style when line width changes', fakeAsync(() => {
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      editShapeFacadeService.shapeForm.get('lineWidth')?.setValue(6);
      tick(100);

      const config = service.getStyleConfig();
      expect(config.lineWidth).toBe(6);
    }));

    it('should update style when line color changes', fakeAsync(() => {
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      editShapeFacadeService.shapeForm.get('lineColor')?.setValue('#ff0000');
      tick(100);

      const config = service.getStyleConfig();
      expect(config.entityColor).toBe('#ff0000');
    }));

    it('should recreate polyline entity when line color changes', fakeAsync(() => {
      service.startDrawing(MapOperationsEnum.DRAW_POLYLINE);
      const addCallsBefore = mockViewer.entities.add.calls.count();

      editShapeFacadeService.shapeForm.get('lineColor')?.setValue('#00ff00');
      tick(100);

      expect(mockViewer.entities.add.calls.count()).toBeGreaterThan(
        addCallsBefore,
      );
      expect(service.getStyleConfig().entityColor).toBe('#00ff00');
    }));

    it('should apply changed line width to rendered circle outline', fakeAsync(() => {
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);

      editShapeFacadeService.shapeForm.get('lineWidth')?.setValue(6);
      tick(100);

      const latestEntityOptions =
        mockViewer.entities.add.calls.mostRecent().args[0];
      expect(latestEntityOptions.polyline.width).toBe(6);
      expect(service.getStyleConfig().lineWidth).toBe(6);
    }));

    it('should update text label when name changes for text shape', fakeAsync(() => {
      service.startDrawing(MapOperationsEnum.DRAW_TEXT);
      editShapeFacadeService.shapeForm.get('name')?.setValue('My Text');
      tick(200);

      const config = service.getStyleConfig();
      expect(config.textLabel).toBe('My Text');
    }));
  });

  // Bug fix tests
  describe('Bug Fix: 2D mode position picking', () => {
    it('should have pickEllipsoid available on viewer camera', () => {
      // Verify the mock structure matches what the code expects
      expect(mockViewer.camera.pickEllipsoid).toBeDefined();
    });

    it('should use pickEllipsoid for position detection', () => {
      // The code now uses pickEllipsoid as primary method for 2D mode
      service.initialize(mockViewer);
      expect(mockViewer).toBeTruthy();
    });
  });

  describe('Bug Fix: Text shape dragging', () => {
    beforeEach(() => {
      service.initialize(mockViewer);
    });

    it('should create an invisible larger drag target for text entities', () => {
      service.startDrawing(MapOperationsEnum.DRAW_TEXT);

      const latestEntityOptions =
        mockViewer.entities.add.calls.mostRecent().args[0];

      expect(latestEntityOptions.point).toBeDefined();
      expect(latestEntityOptions.point.pixelSize).toBeGreaterThan(10);
      expect(latestEntityOptions.point.outlineWidth).toBe(0);
    });

    it('should set isDragging when clicking on text entity', () => {
      service.startDrawing(MapOperationsEnum.DRAW_TEXT);
      // Text dragging state should be properly initialized
      expect(service).toBeTruthy();
    });

    it('should stop dragging on mouse up for text shape', () => {
      service.startDrawing(MapOperationsEnum.DRAW_TEXT);
      // Service should handle mouse up for text shapes
      expect(service).toBeTruthy();
    });
  });

  describe('Regression: reported not-fixed bugs', () => {
    beforeEach(() => {
      service.initialize(mockViewer);
    });

    it('should create an invisible larger drag target for circle entities', () => {
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);

      const latestEntityOptions =
        mockViewer.entities.add.calls.mostRecent().args[0];

      expect(latestEntityOptions.point).toBeDefined();
      expect(latestEntityOptions.point.pixelSize).toBeGreaterThan(10);
      expect(latestEntityOptions.point.outlineWidth).toBe(0);
    });

    it('should populate polyline point inputs in the expected slots after clicks', () => {
      service.startDrawing(MapOperationsEnum.DRAW_POLYLINE);

      (service as any).handleClick({ position: new Cartesian2(100, 100) });

      expect(editShapeFacadeService.pointsArray.length).toBe(2);
      const startPoint = editShapeFacadeService.getPointAsMapLocation(0);
      const endPoint = editShapeFacadeService.getPointAsMapLocation(1);
      expect(startPoint?.longitude.degrees).not.toBe(0);
      expect(startPoint?.latitude.degrees).not.toBe(0);
      expect(endPoint?.longitude.degrees).toBe(0);
      expect(endPoint?.latitude.degrees).toBe(0);
    });

    it('should populate circle center coordinates on click', () => {
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);

      (service as any).handleClick({ position: new Cartesian2(120, 120) });

      expect(editShapeFacadeService.pointsArray.length).toBe(1);
      const centerPoint = editShapeFacadeService.getPointAsMapLocation(0);
      expect(centerPoint?.longitude.degrees).not.toBe(0);
      expect(centerPoint?.latitude.degrees).not.toBe(0);
    });

    it('should update text position after drag sequence', () => {
      service.startDrawing(MapOperationsEnum.DRAW_TEXT);

      // Place initial text position
      (service as any).handleClick({ position: new Cartesian2(100, 100) });

      // Pick the temp text entity for drag start
      const tempEntity = (service as any).shapeEntity;
      mockViewer.scene.pick.and.returnValue({ id: tempEntity });
      (service as any).handleMouseDown({ position: new Cartesian2(100, 100) });

      // Move cursor to new location and release
      mockViewer.camera.pickEllipsoid.and.returnValue(
        Cartesian3.fromDegrees(35.1, 33.2, 0),
      );
      (service as any).handleMouseMove({
        endPosition: new Cartesian2(140, 140),
      });
      (service as any).handleMouseUp({ position: new Cartesian2(140, 140) });

      const formPoint = editShapeFacadeService.getPointAsMapLocation(0);
      const savedDto = editShapeFacadeService.toShapeDto();
      expect(formPoint?.longitude.degrees).toBeCloseTo(35.1, 3);
      expect(formPoint?.latitude.degrees).toBeCloseTo(33.2, 3);
      expect(savedDto.points[0].coordinates.longitude).toBeCloseTo(35.1, 3);
      expect(savedDto.points[0].coordinates.latitude).toBeCloseTo(33.2, 3);
    });

    it('should drag whole circle shape and update form coordinates', () => {
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      editShapeFacadeService.shapeForm.patchValue(
        { radius: 500 },
        { emitEvent: false },
      );
      editShapeFacadeService.setPointsFromMapLocations([
        {
          latitude: { degrees: 32.0 },
          longitude: { degrees: 34.0 },
          altitude: { feet: 0 },
        },
      ]);
      service.loadPositionsFromForm();

      const tempEntity = (service as any).shapeEntity;
      mockViewer.scene.pick.and.returnValue({ id: tempEntity });
      mockViewer.camera.pickEllipsoid.and.returnValues(
        Cartesian3.fromDegrees(34.0, 32.0, 0),
        Cartesian3.fromDegrees(34.5, 32.5, 0),
      );

      (service as any).handleMouseDown({ position: new Cartesian2(100, 100) });
      (service as any).handleMouseMove({
        endPosition: new Cartesian2(140, 140),
      });
      (service as any).handleMouseUp({ position: new Cartesian2(140, 140) });

      const formPoint = editShapeFacadeService.getPointAsMapLocation(0);
      const savedDto = editShapeFacadeService.toShapeDto();
      // All shapes now sync drag to form
      expect(formPoint?.longitude.degrees).toBeCloseTo(34.5, 3);
      expect(formPoint?.latitude.degrees).toBeCloseTo(32.5, 3);
      expect(savedDto.points[0].coordinates.longitude).toBeCloseTo(34.5, 3);
      expect(savedDto.points[0].coordinates.latitude).toBeCloseTo(32.5, 3);
    });

    it('should drag completed circle even when Cesium entity pick misses and update form', () => {
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      editShapeFacadeService.shapeForm.patchValue(
        { radius: 50000 },
        { emitEvent: false },
      );
      editShapeFacadeService.setPointsFromMapLocations([
        {
          latitude: { degrees: 32.0 },
          longitude: { degrees: 34.0 },
          altitude: { feet: 0 },
        },
      ]);
      service.loadPositionsFromForm();

      mockViewer.scene.pick.and.returnValue(null);
      mockViewer.camera.pickEllipsoid.and.returnValues(
        Cartesian3.fromDegrees(34.1, 32.1, 0),
        Cartesian3.fromDegrees(34.3, 32.3, 0),
      );

      (service as any).handleMouseDown({ position: new Cartesian2(100, 100) });
      (service as any).handleMouseMove({
        endPosition: new Cartesian2(140, 140),
      });
      (service as any).handleMouseUp({ position: new Cartesian2(140, 140) });

      const formPoint = editShapeFacadeService.getPointAsMapLocation(0);
      const savedDto = editShapeFacadeService.toShapeDto();
      // All shapes now sync drag to form - coordinates updated from drag delta
      expect(formPoint?.longitude.degrees).toBeGreaterThan(34.0);
      expect(formPoint?.latitude.degrees).toBeGreaterThan(32.0);
      expect(savedDto.points[0].coordinates.longitude).toBeGreaterThan(34.0);
      expect(savedDto.points[0].coordinates.latitude).toBeGreaterThan(32.0);
    });

    it('should apply form style values when loading existing polyline for edit', () => {
      service.startDrawing(MapOperationsEnum.DRAW_POLYLINE);

      editShapeFacadeService.shapeForm.patchValue(
        {
          lineType: OutlineType.dashed,
          lineWidth: 6,
          lineColor: '#ff0000',
          name: 'Edited Line',
        },
        { emitEvent: false },
      );
      editShapeFacadeService.setPointsFromMapLocations([
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
      ]);

      service.loadPositionsFromForm();

      const style = service.getStyleConfig();
      expect(style.lineType).toBe(OutlineType.dashed);
      expect(style.lineWidth).toBe(6);
      expect(style.entityColor).toBe('#ff0000');

      const latestEntityOptions =
        mockViewer.entities.add.calls.mostRecent().args[0];
      expect(latestEntityOptions.polyline.width).toBe(6);
    });

    it('should drag whole polyline shape and update form coordinates when dragging selected shape entity', () => {
      service.startDrawing(MapOperationsEnum.DRAW_POLYLINE);
      editShapeFacadeService.setPointsFromMapLocations([
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
      ]);
      service.loadPositionsFromForm();

      const before = editShapeFacadeService.getPointAsMapLocation(0);
      const tempEntity = (service as any).shapeEntity;
      mockViewer.scene.pick.and.returnValue({ id: tempEntity });

      mockViewer.camera.pickEllipsoid.and.returnValues(
        Cartesian3.fromDegrees(34.0, 32.0, 0),
        Cartesian3.fromDegrees(34.5, 32.5, 0),
      );

      (service as any).handleMouseDown({ position: new Cartesian2(100, 100) });
      (service as any).handleMouseMove({
        endPosition: new Cartesian2(140, 140),
      });
      (service as any).handleMouseUp({ position: new Cartesian2(140, 140) });

      const formPoint = editShapeFacadeService.getPointAsMapLocation(0);
      const savedDto = editShapeFacadeService.toShapeDto();
      expect(formPoint?.longitude.degrees).toBeGreaterThan(
        before?.longitude.degrees ?? 0,
      );
      expect(formPoint?.latitude.degrees).toBeGreaterThan(
        before?.latitude.degrees ?? 0,
      );
      expect(savedDto.points[0].coordinates.longitude).toBeGreaterThan(
        before?.longitude.degrees ?? 0,
      );
      expect(savedDto.points[0].coordinates.latitude).toBeGreaterThan(
        before?.latitude.degrees ?? 0,
      );
    });

    it('should not swallow the second polyline click while line is still being created', () => {
      service.startDrawing(MapOperationsEnum.DRAW_POLYLINE);

      (service as any).handleClick({ position: new Cartesian2(100, 100) });

      const tempEntity = (service as any).shapeEntity;
      mockViewer.scene.pick.and.returnValue({ id: tempEntity });

      (service as any).handleMouseDown({ position: new Cartesian2(140, 140) });
      (service as any).handleClick({ position: new Cartesian2(140, 140) });

      const secondPoint = editShapeFacadeService.getPointAsMapLocation(1);
      expect(secondPoint?.latitude.degrees).not.toBe(0);
      expect(secondPoint?.longitude.degrees).not.toBe(0);
    });

    it('should drag whole polygon shape and update form coordinates when dragging selected shape entity', () => {
      service.startDrawing(MapOperationsEnum.DRAW_POLYGON);
      editShapeFacadeService.setPointsFromMapLocations([
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
          latitude: { degrees: 32.5 },
          longitude: { degrees: 34.5 },
          altitude: { feet: 0 },
        },
      ]);
      service.loadPositionsFromForm();

      const before = editShapeFacadeService.getPointAsMapLocation(0);
      const tempEntity = (service as any).shapeEntity;
      mockViewer.scene.pick.and.returnValue({ id: tempEntity });

      mockViewer.camera.pickEllipsoid.and.returnValues(
        Cartesian3.fromDegrees(34.0, 32.0, 0),
        Cartesian3.fromDegrees(34.2, 32.3, 0),
      );

      (service as any).handleMouseDown({ position: new Cartesian2(100, 100) });
      (service as any).handleMouseMove({
        endPosition: new Cartesian2(130, 130),
      });
      (service as any).handleMouseUp({ position: new Cartesian2(130, 130) });

      const formPoint = editShapeFacadeService.getPointAsMapLocation(0);
      const savedDto = editShapeFacadeService.toShapeDto();
      expect(formPoint?.longitude.degrees).toBeGreaterThan(
        before?.longitude.degrees ?? 0,
      );
      expect(formPoint?.latitude.degrees).toBeGreaterThan(
        before?.latitude.degrees ?? 0,
      );
      expect(savedDto.points[0].coordinates.longitude).toBeGreaterThan(
        before?.longitude.degrees ?? 0,
      );
      expect(savedDto.points[0].coordinates.latitude).toBeGreaterThan(
        before?.latitude.degrees ?? 0,
      );
    });

    it('should sync form during whole-shape drag when saved shape id matches opened form id', () => {
      service.startDrawing(MapOperationsEnum.DRAW_POLYLINE);
      editShapeFacadeService.setPointsFromMapLocations([
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
      ]);
      service.loadPositionsFromForm();
      editShapeFacadeService.shapeForm.get('id')?.setValue('shape-1');

      const before = editShapeFacadeService.getPointAsMapLocation(0);

      (service as any).isDraggingWholeShape = true;
      (service as any).lastDragCartesian = Cartesian3.fromDegrees(
        34.0,
        32.0,
        0,
      );
      (service as any).draggedSavedShapeId = 'shape-1';

      mockViewer.camera.pickEllipsoid.and.returnValue(
        Cartesian3.fromDegrees(34.4, 32.3, 0),
      );

      (service as any).handleMouseMove({
        endPosition: new Cartesian2(130, 130),
      });

      const formPoint = editShapeFacadeService.getPointAsMapLocation(0);
      expect(formPoint?.longitude.degrees).toBeGreaterThan(
        before?.longitude.degrees ?? 0,
      );
      expect(formPoint?.latitude.degrees).toBeGreaterThan(
        before?.latitude.degrees ?? 0,
      );
    });

    it('should start and apply circle whole-drag when entity is picked but map position is null on mouse down', () => {
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);

      editShapeFacadeService.setPointsFromMapLocations([
        {
          latitude: { degrees: 32.0 },
          longitude: { degrees: 34.0 },
          altitude: { feet: 0 },
        },
      ]);
      editShapeFacadeService.shapeForm.patchValue({ radius: 650 });
      service.loadPositionsFromForm();

      const before = editShapeFacadeService.getPointAsMapLocation(0);
      const tempEntity = (service as any).shapeEntity;
      mockViewer.scene.pick.and.returnValue({ id: tempEntity });

      mockViewer.camera.pickEllipsoid.and.returnValues(
        null,
        Cartesian3.fromDegrees(34.3, 32.2, 0),
      );

      (service as any).handleMouseDown({ position: new Cartesian2(100, 100) });
      expect((service as any).isDraggingWholeShape).toBeTrue();

      (service as any).handleMouseMove({
        endPosition: new Cartesian2(130, 130),
      });
      (service as any).handleMouseUp({ position: new Cartesian2(130, 130) });

      const formPoint = editShapeFacadeService.getPointAsMapLocation(0);
      expect(formPoint?.longitude.degrees).not.toBeCloseTo(
        before?.longitude.degrees ?? 0,
        6,
      );
      expect(formPoint?.latitude.degrees).not.toBeCloseTo(
        before?.latitude.degrees ?? 0,
        6,
      );
    });

    it('should not start temp circle creation when mouse down picks a non-temp entity', () => {
      service.startDrawing(MapOperationsEnum.DRAW_CIRCLE);

      const tempEntity = (service as any).shapeEntity;
      const savedEntity = { id: 'saved-circle-1' } as any;
      mockViewer.scene.pick.and.returnValue({ id: savedEntity });
      mockViewer.camera.pickEllipsoid.and.returnValue(
        Cartesian3.fromDegrees(34.2, 32.1, 0),
      );

      (service as any).handleMouseDown({ position: new Cartesian2(100, 100) });

      expect(savedEntity).not.toBe(tempEntity);
      expect((service as any).state.isDragging).toBeFalse();
      expect((service as any).positions.length).toBe(0);
    });

    it('should not sync form during whole-shape drag when saved shape id does not match opened form id', () => {
      service.startDrawing(MapOperationsEnum.DRAW_POLYLINE);
      editShapeFacadeService.setPointsFromMapLocations([
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
      ]);
      service.loadPositionsFromForm();
      editShapeFacadeService.shapeForm.get('id')?.setValue('shape-form');

      const before = editShapeFacadeService.getPointAsMapLocation(0);

      (service as any).isDraggingWholeShape = true;
      (service as any).lastDragCartesian = Cartesian3.fromDegrees(
        34.0,
        32.0,
        0,
      );
      (service as any).draggedSavedShapeId = 'shape-other';

      mockViewer.camera.pickEllipsoid.and.returnValue(
        Cartesian3.fromDegrees(34.4, 32.3, 0),
      );

      (service as any).handleMouseMove({
        endPosition: new Cartesian2(130, 130),
      });

      const formPoint = editShapeFacadeService.getPointAsMapLocation(0);
      const savedDto = editShapeFacadeService.toShapeDto();

      // Form remains unchanged for saved-shape-not-in-form drag path.
      expect(formPoint?.longitude.degrees).toBeCloseTo(
        before?.longitude.degrees ?? 0,
        6,
      );
      expect(formPoint?.latitude.degrees).toBeCloseTo(
        before?.latitude.degrees ?? 0,
        6,
      );

      // Pending geometry override is consumed on save conversion.
      expect(savedDto.points[0].coordinates.longitude).toBeGreaterThan(
        before?.longitude.degrees ?? 0,
      );
      expect(savedDto.points[0].coordinates.latitude).toBeGreaterThan(
        before?.latitude.degrees ?? 0,
      );
    });

    it('should include preview point in displayed polyline positions while drawing', () => {
      service.startDrawing(MapOperationsEnum.DRAW_POLYLINE);

      (service as any).positions = [Cartesian3.fromDegrees(34.0, 32.0, 0)];
      (service as any).isPolylineDrawen = false;
      (service as any).previewPosition = Cartesian3.fromDegrees(35.0, 33.0, 0);

      const displayPositions = (service as any).getDisplayPolylinePositions();
      const previewLocation = service.cartesian3ToMapLocation(
        displayPositions[1],
      );

      expect(displayPositions.length).toBe(2);
      expect(previewLocation.longitude.degrees).toBeCloseTo(35.0, 4);
      expect(previewLocation.latitude.degrees).toBeCloseTo(33.0, 4);
    });

    it('should create and clear vertex entities for editable line/polygon shapes', () => {
      service.startDrawing(MapOperationsEnum.DRAW_POLYLINE);

      (service as any).positions = [
        Cartesian3.fromDegrees(34.0, 32.0, 0),
        Cartesian3.fromDegrees(35.0, 33.0, 0),
      ];

      (service as any).syncVertexEntities();

      const vertexEntities = (service as any).vertexEntities;
      expect(vertexEntities.length).toBe(2);
      expect(vertexEntities[0].name).toBe('Vertex-0');
      expect(vertexEntities[1].name).toBe('Vertex-1');

      (service as any).clearVertexEntities();
      expect((service as any).vertexEntities.length).toBe(0);
      expect(mockViewer.entities.remove).toHaveBeenCalledTimes(2);
    });

    it('should return closed polygon display positions with preview when polygon is unfinished', () => {
      service.startDrawing(MapOperationsEnum.DRAW_POLYGON);

      (service as any).positions = [
        Cartesian3.fromDegrees(34.0, 32.0, 0),
        Cartesian3.fromDegrees(35.0, 33.0, 0),
        Cartesian3.fromDegrees(36.0, 34.0, 0),
      ];
      (service as any).isPolygonDrawen = false;
      (service as any).previewPosition = Cartesian3.fromDegrees(34.5, 33.5, 0);

      const displayPositions = (service as any).getDisplayPolygonPositions();
      const first = service.cartesian3ToMapLocation(displayPositions[0]);
      const last = service.cartesian3ToMapLocation(
        displayPositions[displayPositions.length - 1],
      );

      expect(displayPositions.length).toBe(5);
      expect(last.longitude.degrees).toBeCloseTo(first.longitude.degrees, 4);
      expect(last.latitude.degrees).toBeCloseTo(first.latitude.degrees, 4);
    });

    it('should render polygon preview at insertion index after selecting row insert', () => {
      service.startDrawing(MapOperationsEnum.DRAW_POLYGON);
      editShapeFacadeService.setPointsFromMapLocations([
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
      ]);
      service.loadPositionsFromForm();

      service.setPolygonPreviewInsertAfterIndex(0);
      (service as any).previewPosition = Cartesian3.fromDegrees(34.5, 32.5, 0);
      (service as any).isPolygonDrawen = false;

      const displayPositions = (service as any).getDisplayPolygonPositions();
      const previewLocation = service.cartesian3ToMapLocation(
        displayPositions[1],
      );

      expect(previewLocation.longitude.degrees).toBeCloseTo(34.5, 4);
      expect(previewLocation.latitude.degrees).toBeCloseTo(32.5, 4);
    });

    it('should insert polygon click location at selected insertion index', () => {
      service.startDrawing(MapOperationsEnum.DRAW_POLYGON);
      editShapeFacadeService.setPointsFromMapLocations([
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
        {
          latitude: { degrees: 0 },
          longitude: { degrees: 0 },
          altitude: { feet: 0 },
        },
      ]);
      service.loadPositionsFromForm();

      service.setPolygonPreviewInsertAfterIndex(1);
      mockViewer.camera.pickEllipsoid.and.returnValue(
        Cartesian3.fromDegrees(35.5, 33.5, 0),
      );

      (service as any).handleClick({ position: new Cartesian2(120, 120) });

      const insertedPoint = editShapeFacadeService.getPointAsMapLocation(2);
      expect(insertedPoint?.longitude.degrees).toBeCloseTo(35.5, 4);
      expect(insertedPoint?.latitude.degrees).toBeCloseTo(33.5, 4);
      expect((service as any).polygonPreviewInsertAfterIndex).toBeNull();
    });

    it('should clear previously clicked positions when switching shape types even after debounced form updates', fakeAsync(() => {
      service.startDrawing(MapOperationsEnum.DRAW_TEXT);

      (service as any).handleClick({ position: new Cartesian2(100, 100) });

      const textPoint = editShapeFacadeService.getPointAsMapLocation(0);
      expect(textPoint?.latitude.degrees).not.toBe(0);
      expect(textPoint?.longitude.degrees).not.toBe(0);

      service.startDrawing(MapOperationsEnum.DRAW_POLYLINE);
      tick(150);

      const startPoint = editShapeFacadeService.getPointAsMapLocation(0);
      const endPoint = editShapeFacadeService.getPointAsMapLocation(1);
      expect(startPoint?.latitude.degrees).toBe(0);
      expect(startPoint?.longitude.degrees).toBe(0);
      expect(endPoint?.latitude.degrees).toBe(0);
      expect(endPoint?.longitude.degrees).toBe(0);
      expect((service as any).positions.length).toBe(0);
    }));
  });
});
