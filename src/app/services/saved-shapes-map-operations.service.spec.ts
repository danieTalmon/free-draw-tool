import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Cartesian2, Cartesian3, ScreenSpaceEventType } from 'cesium';

import { SavedShapesMapOperationsService } from '@services/saved-shapes-map-operations.service';
import { SavedShapesService } from '@services/saved-shapes.service';
import { ShapeApiService } from '@services/shape-api.service';
import { EditShapeFacadeService } from '@services/edit-shape-facade.service';
import { ShapeDto } from '@models/shape.model';
import { OutlineType } from '@models/draw-event.model';

describe('SavedShapesMapOperationsService', () => {
  let service: SavedShapesMapOperationsService;
  let savedShapesService: jasmine.SpyObj<SavedShapesService>;
  let shapeApiService: jasmine.SpyObj<ShapeApiService>;
  let editShapeFacadeService: jasmine.SpyObj<EditShapeFacadeService>;
  let currentFormShapeId: string | null;

  const createDto = (): ShapeDto => ({
    id: 'shape-1',
    name: 'Saved Shape',
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
  });

  const createCircleDto = (): ShapeDto => ({
    id: 'circle-1',
    name: 'Saved Circle',
    shapeType: 'DRAW_CIRCLE',
    points: [
      {
        coordinates: { latitude: 32.0, longitude: 34.0 },
        altitude: { feet: 0 },
      },
    ],
    radius: 400,
    lineType: OutlineType.solid,
    lineWidth: 2,
    lineColor: '#00ffff',
  });

  const createViewerStub = () => {
    const pickSpy = jasmine.createSpy('pick').and.returnValue({ id: {} });
    const pickEllipsoidSpy = jasmine
      .createSpy('pickEllipsoid')
      .and.returnValues(
        Cartesian3.fromDegrees(34, 32, 0),
        Cartesian3.fromDegrees(34.1, 32.1, 0),
      );

    return {
      scene: {
        pick: pickSpy,
        globe: {
          ellipsoid: {},
          pick: jasmine.createSpy('globePick').and.returnValue(null),
        },
        camera: {
          getPickRay: jasmine.createSpy('getPickRay').and.returnValue(null),
        },
      },
      camera: {
        pickEllipsoid: pickEllipsoidSpy,
      },
    } as any;
  };

  beforeEach(() => {
    const savedShapesSpy = jasmine.createSpyObj('SavedShapesService', [
      'getShapeByEntity',
      'findShapeNearScreenPosition',
      'selectShape',
      'getShapeById',
      'updateShape',
    ]);

    const shapeApiSpy = jasmine.createSpyObj('ShapeApiService', ['update']);

    const editShapeFacadeSpy = jasmine.createSpyObj(
      'EditShapeFacadeService',
      [
        'clearPendingGeometryOverride',
        'patchPointsFromMapLocations',
        'updateRadius',
      ],
      { shapeId: null },
    );

    currentFormShapeId = null;
    Object.defineProperty(editShapeFacadeSpy, 'shapeId', {
      get: () => currentFormShapeId,
    });

    TestBed.configureTestingModule({
      providers: [
        SavedShapesMapOperationsService,
        { provide: SavedShapesService, useValue: savedShapesSpy },
        { provide: ShapeApiService, useValue: shapeApiSpy },
        { provide: EditShapeFacadeService, useValue: editShapeFacadeSpy },
      ],
    });

    service = TestBed.inject(SavedShapesMapOperationsService);
    savedShapesService = TestBed.inject(
      SavedShapesService,
    ) as jasmine.SpyObj<SavedShapesService>;
    shapeApiService = TestBed.inject(
      ShapeApiService,
    ) as jasmine.SpyObj<ShapeApiService>;
    editShapeFacadeService = TestBed.inject(
      EditShapeFacadeService,
    ) as jasmine.SpyObj<EditShapeFacadeService>;
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('should suppress one left click after drag threshold is crossed', () => {
    const dto = createDto();
    const viewer = createViewerStub();

    savedShapesService.getShapeByEntity.and.returnValue({
      entity: {} as any,
      shapeDto: dto,
    });
    savedShapesService.getShapeById.and.returnValue({
      entity: {} as any,
      shapeDto: dto,
    });

    const started = service.startDragCandidate(viewer, new Cartesian2(10, 10));
    service.updateDrag(viewer, new Cartesian2(25, 25));

    expect(started).toBeTrue();
    expect(savedShapesService.selectShape).toHaveBeenCalledWith('shape-1');
    expect(service.consumeSuppressedLeftClick()).toBeTrue();
    expect(service.consumeSuppressedLeftClick()).toBeFalse();
  });

  it('should persist once on finish drag', () => {
    const dto = createDto();
    const viewer = createViewerStub();

    savedShapesService.getShapeByEntity.and.returnValue({
      entity: {} as any,
      shapeDto: dto,
    });
    savedShapesService.getShapeById.and.returnValue({
      entity: {} as any,
      shapeDto: dto,
    });
    shapeApiService.update.and.returnValue(of(dto));

    service.startDragCandidate(viewer, new Cartesian2(10, 10));
    service.updateDrag(viewer, new Cartesian2(25, 25));
    service.finishDrag();

    expect(shapeApiService.update).toHaveBeenCalledTimes(1);
  });

  it('should rollback when persist fails', () => {
    const dto = createDto();
    const viewer = createViewerStub();

    savedShapesService.getShapeByEntity.and.returnValue({
      entity: {} as any,
      shapeDto: dto,
    });
    savedShapesService.getShapeById.and.returnValue({
      entity: {} as any,
      shapeDto: dto,
    });
    shapeApiService.update.and.returnValue(
      throwError(() => new Error('persist failed')),
    );

    spyOn(window, 'alert');

    service.startDragCandidate(viewer, new Cartesian2(10, 10));
    service.updateDrag(viewer, new Cartesian2(25, 25));
    service.finishDrag();

    expect(savedShapesService.updateShape).toHaveBeenCalledWith(dto);
    expect(window.alert).toHaveBeenCalled();
  });

  it('should bind drag setInputAction handlers in service', () => {
    const handler = {
      setInputAction: jasmine.createSpy('setInputAction'),
    } as any;
    const canInteract = jasmine.createSpy('canInteract').and.returnValue(true);
    const onStarted = jasmine.createSpy('onStarted');

    service.bindDragInputActions(handler, null, canInteract, onStarted);

    expect(handler.setInputAction).toHaveBeenCalledTimes(3);
    expect(handler.setInputAction).toHaveBeenCalledWith(
      jasmine.any(Function),
      ScreenSpaceEventType.LEFT_DOWN,
    );
    expect(handler.setInputAction).toHaveBeenCalledWith(
      jasmine.any(Function),
      ScreenSpaceEventType.MOUSE_MOVE,
    );
    expect(handler.setInputAction).toHaveBeenCalledWith(
      jasmine.any(Function),
      ScreenSpaceEventType.LEFT_UP,
    );
  });

  it('should sync form points when dragged shape id matches form shape id', () => {
    const dto = createDto();
    const viewer = createViewerStub();
    currentFormShapeId = 'shape-1';

    savedShapesService.getShapeByEntity.and.returnValue({
      entity: {} as any,
      shapeDto: dto,
    });
    savedShapesService.getShapeById.and.returnValue({
      entity: {} as any,
      shapeDto: dto,
    });

    service.startDragCandidate(viewer, new Cartesian2(10, 10));
    service.updateDrag(viewer, new Cartesian2(25, 25));

    expect(
      editShapeFacadeService.clearPendingGeometryOverride,
    ).toHaveBeenCalled();
    expect(
      editShapeFacadeService.patchPointsFromMapLocations,
    ).toHaveBeenCalled();
  });

  it('should not mutate form when dragged shape id does not match form shape id', () => {
    const dto = createDto();
    const viewer = createViewerStub();
    currentFormShapeId = 'different-shape';

    savedShapesService.getShapeByEntity.and.returnValue({
      entity: {} as any,
      shapeDto: dto,
    });
    savedShapesService.getShapeById.and.returnValue({
      entity: {} as any,
      shapeDto: dto,
    });

    service.startDragCandidate(viewer, new Cartesian2(10, 10));
    service.updateDrag(viewer, new Cartesian2(25, 25));

    expect(
      editShapeFacadeService.patchPointsFromMapLocations,
    ).not.toHaveBeenCalled();
    expect(editShapeFacadeService.updateRadius).not.toHaveBeenCalled();
  });

  it('should sync circle radius when dragged circle id matches form shape id', () => {
    const dto = createCircleDto();
    const viewer = createViewerStub();
    currentFormShapeId = 'circle-1';

    savedShapesService.getShapeByEntity.and.returnValue({
      entity: {} as any,
      shapeDto: dto,
    });
    savedShapesService.getShapeById.and.returnValue({
      entity: {} as any,
      shapeDto: dto,
    });

    service.startDragCandidate(viewer, new Cartesian2(10, 10));
    service.updateDrag(viewer, new Cartesian2(25, 25));

    expect(
      editShapeFacadeService.patchPointsFromMapLocations,
    ).toHaveBeenCalled();
    expect(editShapeFacadeService.updateRadius).toHaveBeenCalledWith(400);
  });

  it('should not sync circle form fields when dragged circle id does not match form shape id', () => {
    const dto = createCircleDto();
    const viewer = createViewerStub();
    currentFormShapeId = 'other-circle';

    savedShapesService.getShapeByEntity.and.returnValue({
      entity: {} as any,
      shapeDto: dto,
    });
    savedShapesService.getShapeById.and.returnValue({
      entity: {} as any,
      shapeDto: dto,
    });

    service.startDragCandidate(viewer, new Cartesian2(10, 10));
    service.updateDrag(viewer, new Cartesian2(25, 25));

    expect(
      editShapeFacadeService.patchPointsFromMapLocations,
    ).not.toHaveBeenCalled();
    expect(editShapeFacadeService.updateRadius).not.toHaveBeenCalled();
  });
});
