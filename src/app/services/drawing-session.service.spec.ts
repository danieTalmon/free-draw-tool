import { TestBed } from '@angular/core/testing';
import { DrawingSessionService } from '@services/drawing-session.service';
import { DrawToolService } from '@services/draw-tool.service';
import { SavedShapesService } from '@services/saved-shapes.service';
import { EditShapeFacadeService } from '@services/edit-shape-facade.service';
import { MapService } from '@services/map.service';
import { MapOperationsEnum } from '@models/map-operations-enum';
import { SavedShapeEntity } from '@models/saved-shape-entity.model';
import { ShapeDto } from '@models/shape.model';
import { OutlineType } from '@models/draw-event.model';
import { Entity } from 'cesium';

describe('DrawingSessionService', () => {
  let service: DrawingSessionService;
  let drawToolService: jasmine.SpyObj<DrawToolService>;
  let savedShapesService: jasmine.SpyObj<SavedShapesService>;
  let editShapeFacadeService: jasmine.SpyObj<EditShapeFacadeService>;
  let mapService: jasmine.SpyObj<MapService>;

  const createTestDto = (overrides: Partial<ShapeDto> = {}): ShapeDto => ({
    id: 'shape-1',
    name: 'Test Shape',
    shapeType: 'DRAW_POLYLINE',
    points: [
      {
        coordinates: { latitude: 32.0, longitude: 34.0 },
        altitude: { feet: 0 },
      },
      {
        coordinates: { latitude: 33.0, longitude: 35.0 },
        altitude: { feet: 0 },
      },
    ],
    lineType: OutlineType.solid,
    lineWidth: 2,
    lineColor: '#00ffff',
    ...overrides,
  });

  const createSavedShape = (
    overrides: Partial<ShapeDto> = {},
  ): SavedShapeEntity => ({
    entity: new Entity({ id: overrides.id ?? 'shape-1' }),
    shapeDto: createTestDto(overrides),
    vertexEntities: [],
    hitEntities: [],
  });

  beforeEach(() => {
    drawToolService = jasmine.createSpyObj('DrawToolService', [
      'startDrawing',
      'cancelDrawing',
      'loadPositionsFromForm',
    ]);
    savedShapesService = jasmine.createSpyObj('SavedShapesService', [
      'hideShape',
      'showShape',
    ]);
    editShapeFacadeService = jasmine.createSpyObj('EditShapeFacadeService', [
      'fromShapeDto',
      'markAsSaved',
      'setCurrentShapeType',
    ]);
    mapService = jasmine.createSpyObj('MapService', ['setEditDrawShape']);

    TestBed.configureTestingModule({
      providers: [
        DrawingSessionService,
        { provide: DrawToolService, useValue: drawToolService },
        { provide: SavedShapesService, useValue: savedShapesService },
        { provide: EditShapeFacadeService, useValue: editShapeFacadeService },
        { provide: MapService, useValue: mapService },
      ],
    });

    service = TestBed.inject(DrawingSessionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initial state', () => {
    it('should start in idle mode', () => {
      expect(service.mode()).toBe('idle');
      expect(service.isActive()).toBeFalse();
      expect(service.editingShapeId()).toBeNull();
      expect(service.shapeType()).toBe(MapOperationsEnum.DRAW_NONE);
    });
  });

  describe('startCreating', () => {
    it('should transition to creating mode', () => {
      service.startCreating(MapOperationsEnum.DRAW_CIRCLE);

      expect(service.mode()).toBe('creating');
      expect(service.shapeType()).toBe(MapOperationsEnum.DRAW_CIRCLE);
      expect(service.editingShapeId()).toBeNull();
      expect(service.isActive()).toBeTrue();
    });

    it('should call drawToolService.startDrawing with the given type', () => {
      service.startCreating(MapOperationsEnum.DRAW_POLYLINE);

      expect(drawToolService.startDrawing).toHaveBeenCalledWith(
        MapOperationsEnum.DRAW_POLYLINE,
      );
    });

    it('should call mapService.setEditDrawShape with the given type', () => {
      service.startCreating(MapOperationsEnum.DRAW_CIRCLE);

      expect(mapService.setEditDrawShape).toHaveBeenCalledWith(
        MapOperationsEnum.DRAW_CIRCLE,
      );
    });

    it('should restore previous editing shape before starting new session', () => {
      const savedShape = createSavedShape({ id: 'prev-shape' });
      service.startEditing(savedShape);
      savedShapesService.showShape.calls.reset();

      service.startCreating(MapOperationsEnum.DRAW_CIRCLE);

      expect(savedShapesService.showShape).toHaveBeenCalledWith('prev-shape');
      expect(service.editingShapeId()).toBeNull();
    });
  });

  describe('startEditing', () => {
    it('should transition to editing mode', () => {
      const savedShape = createSavedShape({
        id: 'shape-1',
        shapeType: 'DRAW_POLYLINE',
      });
      service.startEditing(savedShape);

      expect(service.mode()).toBe('editing');
      expect(service.editingShapeId()).toBe('shape-1');
      expect(service.shapeType()).toBe(MapOperationsEnum.DRAW_POLYLINE);
      expect(service.isActive()).toBeTrue();
    });

    it('should hide the saved entity before starting drawing (fixes P-01, P-03)', () => {
      const savedShape = createSavedShape({ id: 'shape-1' });
      service.startEditing(savedShape);

      expect(savedShapesService.hideShape).toHaveBeenCalledWith('shape-1');
    });

    it('should call drawToolService.startDrawing with preserveFormState', () => {
      const savedShape = createSavedShape({
        id: 'shape-1',
        shapeType: 'DRAW_POLYLINE',
      });
      service.startEditing(savedShape);

      expect(drawToolService.startDrawing).toHaveBeenCalledWith(
        MapOperationsEnum.DRAW_POLYLINE,
        { preserveFormState: true },
      );
    });

    it('should load shape into form', () => {
      const savedShape = createSavedShape({
        id: 'shape-1',
        shapeType: 'DRAW_CIRCLE',
      });
      service.startEditing(savedShape);

      expect(editShapeFacadeService.fromShapeDto).toHaveBeenCalledWith(
        savedShape.shapeDto,
      );
      expect(editShapeFacadeService.markAsSaved).toHaveBeenCalledWith(
        savedShape.shapeDto,
      );
      expect(editShapeFacadeService.setCurrentShapeType).toHaveBeenCalledWith(
        MapOperationsEnum.DRAW_CIRCLE,
      );
      expect(drawToolService.loadPositionsFromForm).toHaveBeenCalled();
    });

    it('should restore previous editing shape before hiding the new one', () => {
      const first = createSavedShape({ id: 'first-shape' });
      const second = createSavedShape({ id: 'second-shape' });

      service.startEditing(first);
      savedShapesService.showShape.calls.reset();
      savedShapesService.hideShape.calls.reset();

      service.startEditing(second);

      expect(savedShapesService.showShape).toHaveBeenCalledWith('first-shape');
      expect(savedShapesService.hideShape).toHaveBeenCalledWith('second-shape');
    });
  });

  describe('switchType', () => {
    it('should do nothing when mode is idle', () => {
      service.switchType(MapOperationsEnum.DRAW_CIRCLE);

      expect(drawToolService.startDrawing).not.toHaveBeenCalled();
      expect(service.mode()).toBe('idle');
    });

    it('should transition to creating mode and clear editingShapeId', () => {
      const savedShape = createSavedShape({ id: 'shape-1' });
      service.startEditing(savedShape);

      service.switchType(MapOperationsEnum.DRAW_CIRCLE);

      expect(service.mode()).toBe('creating');
      expect(service.editingShapeId()).toBeNull();
      expect(service.shapeType()).toBe(MapOperationsEnum.DRAW_CIRCLE);
    });

    it('should restore the previously hidden saved entity', () => {
      const savedShape = createSavedShape({ id: 'shape-1' });
      service.startEditing(savedShape);
      savedShapesService.showShape.calls.reset();

      service.switchType(MapOperationsEnum.DRAW_CIRCLE);

      expect(savedShapesService.showShape).toHaveBeenCalledWith('shape-1');
    });

    it('should call drawToolService.startDrawing with the new type', () => {
      service.startCreating(MapOperationsEnum.DRAW_POLYLINE);
      drawToolService.startDrawing.calls.reset();

      service.switchType(MapOperationsEnum.DRAW_CIRCLE);

      expect(drawToolService.startDrawing).toHaveBeenCalledWith(
        MapOperationsEnum.DRAW_CIRCLE,
      );
    });
  });

  describe('cancel', () => {
    it('should transition to idle and call cancelDrawing', () => {
      service.startCreating(MapOperationsEnum.DRAW_CIRCLE);
      service.cancel();

      expect(service.mode()).toBe('idle');
      expect(service.isActive()).toBeFalse();
      expect(drawToolService.cancelDrawing).toHaveBeenCalled();
    });

    it('should reset mapService draw shape to DRAW_NONE', () => {
      service.startCreating(MapOperationsEnum.DRAW_CIRCLE);
      service.cancel();

      expect(mapService.setEditDrawShape).toHaveBeenCalledWith(
        MapOperationsEnum.DRAW_NONE,
      );
    });

    it('should restore the hidden saved entity when cancelling from EDITING', () => {
      const savedShape = createSavedShape({ id: 'shape-1' });
      service.startEditing(savedShape);
      savedShapesService.showShape.calls.reset();

      service.cancel();

      expect(savedShapesService.showShape).toHaveBeenCalledWith('shape-1');
    });

    it('should NOT call showShape when cancelling from CREATING (no hidden entity)', () => {
      service.startCreating(MapOperationsEnum.DRAW_CIRCLE);
      savedShapesService.showShape.calls.reset();

      service.cancel();

      expect(savedShapesService.showShape).not.toHaveBeenCalled();
    });

    it('should reset all state to idle', () => {
      const savedShape = createSavedShape({ id: 'shape-1' });
      service.startEditing(savedShape);
      service.cancel();

      expect(service.mode()).toBe('idle');
      expect(service.editingShapeId()).toBeNull();
      expect(service.shapeType()).toBe(MapOperationsEnum.DRAW_NONE);
    });
  });

  describe('confirmSave', () => {
    it('should transition to idle', () => {
      service.startCreating(MapOperationsEnum.DRAW_CIRCLE);
      service.confirmSave();

      expect(service.mode()).toBe('idle');
      expect(service.isActive()).toBeFalse();
    });

    it('should reset mapService draw shape to DRAW_NONE', () => {
      service.startEditing(createSavedShape({ id: 'shape-1' }));
      service.confirmSave();

      expect(mapService.setEditDrawShape).toHaveBeenCalledWith(
        MapOperationsEnum.DRAW_NONE,
      );
    });

    it('should NOT call showShape — savedShapesService.updateShape already replaced the entity', () => {
      service.startEditing(createSavedShape({ id: 'shape-1' }));
      savedShapesService.showShape.calls.reset();

      service.confirmSave();

      expect(savedShapesService.showShape).not.toHaveBeenCalled();
    });

    it('should reset all state to idle', () => {
      service.startEditing(
        createSavedShape({ id: 'shape-1', shapeType: 'DRAW_POLYLINE' }),
      );
      service.confirmSave();

      expect(service.mode()).toBe('idle');
      expect(service.editingShapeId()).toBeNull();
      expect(service.shapeType()).toBe(MapOperationsEnum.DRAW_NONE);
    });
  });
});
