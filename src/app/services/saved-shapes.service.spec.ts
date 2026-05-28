import { TestBed } from '@angular/core/testing';
import { CustomDataSource, Viewer, Entity, JulianDate } from 'cesium';

import { SavedShapesService } from '@services/saved-shapes.service';
import { ShapeDto } from '@models/shape.model';
import { OutlineType } from '@models/draw-event.model';

describe('SavedShapesService', () => {
  let service: SavedShapesService;
  let mockViewer: jasmine.SpyObj<Viewer>;
  let mockDataSources: any;
  let testDataSource: CustomDataSource;

  const createMockViewer = (): jasmine.SpyObj<Viewer> => {
    testDataSource = new CustomDataSource('FREE_DRAW_SHAPES');

    mockDataSources = {
      getByName: jasmine.createSpy('getByName').and.returnValue([]),
      add: jasmine.createSpy('add').and.callFake((ds: CustomDataSource) => {
        return Promise.resolve(ds);
      }),
    };

    const viewer = jasmine.createSpyObj('Viewer', [], {
      dataSources: mockDataSources,
    });

    return viewer;
  };

  const createTestShapeDto = (overrides: Partial<ShapeDto> = {}): ShapeDto => ({
    id: 'test-shape-1',
    name: 'Test Shape',
    shapeType: 'DRAW_CIRCLE',
    points: [
      {
        coordinates: { latitude: 32.0, longitude: 34.0 },
        altitude: { feet: 0 },
      },
    ],
    radius: 500,
    lineType: OutlineType.solid,
    lineWidth: 2,
    lineColor: '#00ffff',
    ...overrides,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SavedShapesService],
    });
    service = TestBed.inject(SavedShapesService);
    mockViewer = createMockViewer();
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initialize', () => {
    it('should initialize with viewer', () => {
      expect(() => service.initialize(mockViewer)).not.toThrow();
    });

    it('should create new datasource if none exists', () => {
      mockDataSources.getByName.and.returnValue([]);
      service.initialize(mockViewer);
      expect(mockDataSources.add).toHaveBeenCalled();
    });

    it('should use existing datasource if available', () => {
      mockDataSources.getByName.and.returnValue([testDataSource]);
      service.initialize(mockViewer);
      expect(mockDataSources.add).not.toHaveBeenCalled();
    });
  });

  describe('without initialization', () => {
    it('should return null when adding shape without initialization', () => {
      const dto = createTestShapeDto();
      const result = service.addShape(dto);
      expect(result).toBeNull();
    });
  });

  describe('addShape', () => {
    beforeEach(() => {
      mockDataSources.getByName.and.returnValue([testDataSource]);
      service.initialize(mockViewer);
    });

    it('should add a circle shape', () => {
      const dto = createTestShapeDto({ shapeType: 'DRAW_CIRCLE' });
      const entity = service.addShape(dto);
      expect(entity).toBeTruthy();
      expect(entity?.ellipse).toBeTruthy();

      const savedShape = service.getShapeById(dto.id!);
      expect(savedShape?.hitEntities?.length).toBe(1);
    });

    it('should create circle with outline only (no fill)', () => {
      const dto = createTestShapeDto({ shapeType: 'DRAW_CIRCLE' });
      const entity = service.addShape(dto);
      const sampleTime = JulianDate.now();

      expect(entity?.ellipse).toBeTruthy();
      expect(entity?.ellipse?.fill?.getValue(sampleTime)).toBe(false);
      expect(entity?.ellipse?.outline?.getValue(sampleTime)).toBe(true);
      expect(entity?.ellipse?.outlineColor).toBeTruthy();
    });

    it('should add a polyline shape', () => {
      const dto = createTestShapeDto({
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
      });
      const entity = service.addShape(dto);
      expect(entity).toBeTruthy();
      expect(entity?.polyline).toBeTruthy();

      const savedShape = service.getShapeById(dto.id!);
      expect(savedShape?.vertexEntities?.length).toBe(2);
    });

    it('should add a polygon shape', () => {
      const dto = createTestShapeDto({
        shapeType: 'DRAW_POLYGON',
        points: [
          {
            coordinates: { latitude: 32.0, longitude: 34.0 },
            altitude: { feet: 0 },
          },
          {
            coordinates: { latitude: 33.0, longitude: 35.0 },
            altitude: { feet: 0 },
          },
          {
            coordinates: { latitude: 32.5, longitude: 34.5 },
            altitude: { feet: 0 },
          },
        ],
      });
      const entity = service.addShape(dto);
      expect(entity).toBeTruthy();
      expect(entity?.polyline).toBeTruthy();

      const savedShape = service.getShapeById(dto.id!);
      expect(savedShape?.vertexEntities?.length).toBe(3);
    });

    it('should add a text shape', () => {
      const dto = createTestShapeDto({ shapeType: 'DRAW_TEXT' });
      const entity = service.addShape(dto);
      expect(entity).toBeTruthy();
      expect(entity?.label).toBeTruthy();
    });

    it('should return null for shape without id', () => {
      const dto = createTestShapeDto();
      delete (dto as any).id;
      const entity = service.addShape(dto);
      expect(entity).toBeNull();
    });

    it('should replace existing shape with same id', () => {
      const dto1 = createTestShapeDto({ id: 'same-id', name: 'First' });
      const dto2 = createTestShapeDto({ id: 'same-id', name: 'Second' });

      service.addShape(dto1);
      service.addShape(dto2);

      const savedShape = service.getShapeById('same-id');
      expect(savedShape?.shapeDto.name).toBe('Second');
    });

    it('should emit shapes update', () => {
      let shapesCount = 0;
      service.shapes$.subscribe((shapes) => {
        shapesCount = shapes.length;
      });

      service.addShape(createTestShapeDto({ id: 'shape-1' }));
      expect(shapesCount).toBe(1);

      service.addShape(createTestShapeDto({ id: 'shape-2' }));
      expect(shapesCount).toBe(2);
    });
  });

  describe('removeShape', () => {
    beforeEach(() => {
      mockDataSources.getByName.and.returnValue([testDataSource]);
      service.initialize(mockViewer);
    });

    it('should remove shape by id', () => {
      const dto = createTestShapeDto({ id: 'to-remove' });
      service.addShape(dto);

      const result = service.removeShape('to-remove');
      expect(result).toBeTrue();
      expect(service.getShapeById('to-remove')).toBeNull();
    });

    it('should remove vertex entities with parent shape', () => {
      const dto = createTestShapeDto({
        id: 'poly-remove',
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
      });
      service.addShape(dto);

      const result = service.removeShape('poly-remove');
      expect(result).toBeTrue();
    });

    it('should return false for non-existent shape', () => {
      const result = service.removeShape('non-existent');
      expect(result).toBeFalse();
    });

    it('should clear selection if removed shape was selected', () => {
      const dto = createTestShapeDto({ id: 'selected-shape' });
      service.addShape(dto);
      service.selectShape('selected-shape');

      let selectedShape: any;
      service.selectedShape$.subscribe((shape) => {
        selectedShape = shape;
      });

      service.removeShape('selected-shape');
      expect(selectedShape).toBeNull();
    });
  });

  describe('updateShape', () => {
    beforeEach(() => {
      mockDataSources.getByName.and.returnValue([testDataSource]);
      service.initialize(mockViewer);
    });

    it('should update existing shape', () => {
      const dto = createTestShapeDto({ id: 'to-update', name: 'Original' });
      service.addShape(dto);

      const updatedDto = { ...dto, name: 'Updated' };
      service.updateShape(updatedDto);

      const savedShape = service.getShapeById('to-update');
      expect(savedShape?.shapeDto.name).toBe('Updated');
    });

    it('should return null for shape without id', () => {
      const dto = createTestShapeDto();
      delete (dto as any).id;
      const result = service.updateShape(dto);
      expect(result).toBeNull();
    });
  });

  describe('getShapeByEntity', () => {
    beforeEach(() => {
      mockDataSources.getByName.and.returnValue([testDataSource]);
      service.initialize(mockViewer);
    });

    it('should return shape for known entity', () => {
      const dto = createTestShapeDto({ id: 'entity-shape' });
      const entity = service.addShape(dto);

      const result = service.getShapeByEntity(entity!);
      expect(result).toBeTruthy();
      expect(result?.shapeDto.id).toBe('entity-shape');
    });

    it('should return parent shape for known vertex entity', () => {
      const dto = createTestShapeDto({
        id: 'entity-shape-vertices',
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
      });

      service.addShape(dto);
      const savedShape = service.getShapeById('entity-shape-vertices');
      const vertexEntity = savedShape?.vertexEntities?.[0];
      expect(vertexEntity).toBeTruthy();

      const result = service.getShapeByEntity(vertexEntity!);
      expect(result?.shapeDto.id).toBe('entity-shape-vertices');
    });

    it('should return parent shape for invisible hit entity', () => {
      const dto = createTestShapeDto({ id: 'entity-shape-hit' });

      service.addShape(dto);
      const savedShape = service.getShapeById('entity-shape-hit');
      const hitEntity = savedShape?.hitEntities?.[0];
      expect(hitEntity).toBeTruthy();

      const result = service.getShapeByEntity(hitEntity!);
      expect(result?.shapeDto.id).toBe('entity-shape-hit');
    });

    it('should return null for unknown entity', () => {
      const unknownEntity = new Entity({ id: 'unknown' });
      const result = service.getShapeByEntity(unknownEntity);
      expect(result).toBeNull();
    });
  });

  describe('getShapeById', () => {
    beforeEach(() => {
      mockDataSources.getByName.and.returnValue([testDataSource]);
      service.initialize(mockViewer);
    });

    it('should return shape by id', () => {
      const dto = createTestShapeDto({ id: 'find-me' });
      service.addShape(dto);

      const result = service.getShapeById('find-me');
      expect(result).toBeTruthy();
      expect(result?.shapeDto.id).toBe('find-me');
    });

    it('should return null for non-existent id', () => {
      const result = service.getShapeById('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('selectShape', () => {
    beforeEach(() => {
      mockDataSources.getByName.and.returnValue([testDataSource]);
      service.initialize(mockViewer);
    });

    it('should select shape by id', () => {
      const dto = createTestShapeDto({ id: 'select-me' });
      service.addShape(dto);

      let selectedShape: any;
      service.selectedShape$.subscribe((shape) => {
        selectedShape = shape;
      });

      service.selectShape('select-me');
      expect(selectedShape?.shapeDto.id).toBe('select-me');
    });

    it('should deselect when null is passed', () => {
      const dto = createTestShapeDto({ id: 'select-me' });
      service.addShape(dto);
      service.selectShape('select-me');

      let selectedShape: any = 'initial';
      service.selectedShape$.subscribe((shape) => {
        selectedShape = shape;
      });

      service.selectShape(null);
      expect(selectedShape).toBeNull();
    });

    it('should return null for non-existent shape id', () => {
      let selectedShape: any = 'initial';
      service.selectedShape$.subscribe((shape) => {
        selectedShape = shape;
      });

      service.selectShape('non-existent');
      expect(selectedShape).toBeNull();
    });
  });

  describe('hideShape / showShape', () => {
    beforeEach(() => {
      mockDataSources.getByName.and.returnValue([testDataSource]);
      service.initialize(mockViewer);
    });

    it('should hide shape', () => {
      const dto = createTestShapeDto({ id: 'hide-me' });
      const entity = service.addShape(dto);

      service.hideShape('hide-me');
      expect(entity?.show).toBeFalse();

      const savedShape = service.getShapeById('hide-me');
      expect(
        savedShape?.hitEntities?.every((e) => e.show === false),
      ).toBeTrue();
    });

    it('should hide vertex entities for polyline', () => {
      const dto = createTestShapeDto({
        id: 'hide-vertices',
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
      });
      service.addShape(dto);

      service.hideShape('hide-vertices');
      const savedShape = service.getShapeById('hide-vertices');
      expect(
        savedShape?.vertexEntities?.every((e) => e.show === false),
      ).toBeTrue();
    });

    it('should show shape', () => {
      const dto = createTestShapeDto({ id: 'show-me' });
      const entity = service.addShape(dto);
      service.hideShape('show-me');

      service.showShape('show-me');
      expect(entity?.show).toBeTrue();

      const savedShape = service.getShapeById('show-me');
      expect(savedShape?.hitEntities?.every((e) => e.show === true)).toBeTrue();
    });

    it('should show vertex entities for polyline', () => {
      const dto = createTestShapeDto({
        id: 'show-vertices',
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
      });
      service.addShape(dto);
      service.hideShape('show-vertices');

      service.showShape('show-vertices');
      const savedShape = service.getShapeById('show-vertices');
      expect(
        savedShape?.vertexEntities?.every((e) => e.show === true),
      ).toBeTrue();
    });

    it('should show all shapes', () => {
      const entity1 = service.addShape(createTestShapeDto({ id: 'shape-1' }));
      const entity2 = service.addShape(createTestShapeDto({ id: 'shape-2' }));

      service.hideShape('shape-1');
      service.hideShape('shape-2');

      service.showAllShapes();

      expect(entity1?.show).toBeTrue();
      expect(entity2?.show).toBeTrue();
    });
  });

  describe('isEntitySavedShape', () => {
    beforeEach(() => {
      mockDataSources.getByName.and.returnValue([testDataSource]);
      service.initialize(mockViewer);
    });

    it('should return true for saved shape entity', () => {
      const dto = createTestShapeDto({ id: 'saved-entity' });
      const entity = service.addShape(dto);

      expect(service.isEntitySavedShape(entity!)).toBeTrue();
    });

    it('should return false for unknown entity', () => {
      const unknownEntity = new Entity({ id: 'unknown' });
      expect(service.isEntitySavedShape(unknownEntity)).toBeFalse();
    });
  });
});
