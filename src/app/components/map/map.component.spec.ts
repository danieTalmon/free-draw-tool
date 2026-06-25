import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';

import { MapComponent } from '@components/map/map.component';
import { DrawToolService } from '@services/draw-tool.service';
import { MapService } from '@services/map.service';
import { SavedShapesService } from '@services/saved-shapes.service';
import { DrawingSessionService } from '@services/drawing-session.service';
import { SavedShapeEntity } from '@models/saved-shape-entity.model';
import { ShapeApiService } from '@services/shape-api.service';
import { EditShapeFacadeService } from '@services/edit-shape-facade.service';
import { SavedShapesMapOperationsService } from '@services/saved-shapes-map-operations.service';
import { MapOperationsEnum } from '@models/map-operations-enum';
import { ShapeDto } from '@models/shape.model';
import { OutlineType } from '@models/draw-event.model';
import { DrawMapOption } from '@models/user-preferences';

describe('MapComponent', () => {
  let component: MapComponent;
  let fixture: ComponentFixture<MapComponent>;
  let drawToolService: jasmine.SpyObj<DrawToolService>;
  let mapService: MapService;
  let savedShapesService: jasmine.SpyObj<SavedShapesService>;
  let shapeApiService: jasmine.SpyObj<ShapeApiService>;
  let editShapeFacadeService: jasmine.SpyObj<EditShapeFacadeService>;
  let savedShapesMapOperationsService: jasmine.SpyObj<SavedShapesMapOperationsService>;
  let drawingSessionService: jasmine.SpyObj<DrawingSessionService>;

  const createMockSavedShape = (): SavedShapeEntity => {
    const dto: ShapeDto = {
      id: 'test-shape',
      name: 'Test Shape',
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
    };

    return {
      entity: { id: 'test-entity' } as any,
      shapeDto: dto,
    };
  };

  beforeEach(async () => {
    const drawToolSpy = jasmine.createSpyObj('DrawToolService', [
      'initialize',
      'startDrawing',
      'cancelDrawing',
      'destroy',
      'loadPositionsFromForm',
    ]);

    const savedShapesSpy = jasmine.createSpyObj('SavedShapesService', [
      'initialize',
      'selectShape',
      'hideShape',
      'showShape',
      'showAllShapes',
      'removeShape',
    ]);

    const shapeApiSpy = jasmine.createSpyObj('ShapeApiService', [
      'delete',
      'update',
    ]);
    shapeApiSpy.delete.and.returnValue(of(void 0));

    const editFacadeSpy = jasmine.createSpyObj('EditShapeFacadeService', [
      'fromShapeDto',
      'markAsSaved',
      'setCurrentShapeType',
    ]);

    const drawingSessionSpy = jasmine.createSpyObj(
      'DrawingSessionService',
      ['startCreating', 'startEditing', 'cancel', 'confirmSave', 'switchType'],
      {
        isActive: () => false,
        shapeType: () => MapOperationsEnum.DRAW_NONE,
      },
    );
    // Make session spy simulate the mapService side-effects so signal-based
    // assertions (currentDrawType, showEditForm) remain meaningful.
    drawingSessionSpy.startCreating.and.callFake((type: DrawMapOption) => {
      mapService.setEditDrawShape(type);
    });
    drawingSessionSpy.cancel.and.callFake(() => {
      mapService.setEditDrawShape(MapOperationsEnum.DRAW_NONE);
    });

    const savedShapesMapOperationsSpy = jasmine.createSpyObj(
      'SavedShapesMapOperationsService',
      [
        'bindDragInputActions',
        'findSavedShapeAtPosition',
        'startDragCandidate',
        'updateDrag',
        'finishDrag',
        'consumeSuppressedLeftClick',
        'resetDragState',
      ],
    );
    savedShapesMapOperationsSpy.consumeSuppressedLeftClick.and.returnValue(
      false,
    );

    await TestBed.configureTestingModule({
      imports: [MapComponent, HttpClientTestingModule, ReactiveFormsModule],
      providers: [
        MapService,
        { provide: DrawToolService, useValue: drawToolSpy },
        { provide: SavedShapesService, useValue: savedShapesSpy },
        { provide: ShapeApiService, useValue: shapeApiSpy },
        { provide: EditShapeFacadeService, useValue: editFacadeSpy },
        { provide: DrawingSessionService, useValue: drawingSessionSpy },
        {
          provide: SavedShapesMapOperationsService,
          useValue: savedShapesMapOperationsSpy,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MapComponent);
    component = fixture.componentInstance;
    drawToolService = TestBed.inject(
      DrawToolService,
    ) as jasmine.SpyObj<DrawToolService>;
    mapService = TestBed.inject(MapService);
    savedShapesService = TestBed.inject(
      SavedShapesService,
    ) as jasmine.SpyObj<SavedShapesService>;
    shapeApiService = TestBed.inject(
      ShapeApiService,
    ) as jasmine.SpyObj<ShapeApiService>;
    editShapeFacadeService = TestBed.inject(
      EditShapeFacadeService,
    ) as jasmine.SpyObj<EditShapeFacadeService>;
    savedShapesMapOperationsService = TestBed.inject(
      SavedShapesMapOperationsService,
    ) as jasmine.SpyObj<SavedShapesMapOperationsService>;
    drawingSessionService = TestBed.inject(
      DrawingSessionService,
    ) as jasmine.SpyObj<DrawingSessionService>;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initial state', () => {
    it('should have null viewer initially', () => {
      expect(component.viewer).toBeNull();
    });

    it('should not be in edit mode initially', () => {
      expect(component.isEditMode).toBeFalse();
    });

    it('should not show edit form initially', () => {
      expect(component.showEditForm).toBeFalse();
    });

    it('should have DRAW_NONE as current draw type', () => {
      expect(component.currentDrawType).toBe(MapOperationsEnum.DRAW_NONE);
    });

    it('should have hidden context menu', () => {
      expect(component.contextMenuVisible).toBeFalse();
    });
  });

  describe('isDrawingMode', () => {
    it('should return false when DRAW_NONE', () => {
      component.currentDrawType = MapOperationsEnum.DRAW_NONE;
      expect(component.isDrawingMode).toBeFalse();
    });

    it('should return true when drawing circle', () => {
      component.currentDrawType = MapOperationsEnum.DRAW_CIRCLE;
      expect(component.isDrawingMode).toBeTrue();
    });

    it('should return true when drawing polyline', () => {
      component.currentDrawType = MapOperationsEnum.DRAW_POLYLINE;
      expect(component.isDrawingMode).toBeTrue();
    });
  });

  describe('toggleEditMode', () => {
    it('should toggle isEditMode to true', () => {
      component.isEditMode = false;
      component.toggleEditMode();
      expect(component.isEditMode).toBeTrue();
    });

    it('should toggle isEditMode to false', () => {
      component.isEditMode = true;
      component.toggleEditMode();
      expect(component.isEditMode).toBeFalse();
    });

    it('should cancel the active session when exiting edit mode', () => {
      component.isEditMode = true;
      component.toggleEditMode();
      expect(drawingSessionService.cancel).toHaveBeenCalled();
    });

    it('should set draw type to DRAW_NONE when exiting edit mode', () => {
      component.isEditMode = true;
      component.currentDrawType = MapOperationsEnum.DRAW_CIRCLE;
      component.toggleEditMode();
      expect(component.currentDrawType).toBe(MapOperationsEnum.DRAW_NONE);
    });

    it('should hide edit form when exiting edit mode', () => {
      component.isEditMode = true;
      component.currentDrawType = MapOperationsEnum.DRAW_CIRCLE;
      component.toggleEditMode();
      expect(component.showEditForm).toBeFalse();
    });

    it('should show all shapes when exiting edit mode', () => {
      component.isEditMode = true;
      component.toggleEditMode();
      expect(savedShapesService.showAllShapes).toHaveBeenCalled();
    });

    it('should update map service when exiting edit mode', () => {
      spyOn(mapService, 'setEditDrawShape').and.callThrough();
      component.isEditMode = true;
      component.toggleEditMode();
      expect(mapService.setEditDrawShape).toHaveBeenCalledWith(
        MapOperationsEnum.DRAW_NONE,
      );
    });
  });

  describe('startDrawing', () => {
    beforeEach(() => {
      component.isEditMode = true;
    });

    it('should not start drawing when not in edit mode', () => {
      component.isEditMode = false;
      component.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      expect(drawingSessionService.startCreating).not.toHaveBeenCalled();
    });

    it('should delegate to drawingSessionService.startCreating with specified type', () => {
      component.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      expect(drawingSessionService.startCreating).toHaveBeenCalledWith(
        MapOperationsEnum.DRAW_CIRCLE,
      );
    });

    it('should set current draw type', () => {
      component.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      expect(component.currentDrawType).toBe(MapOperationsEnum.DRAW_CIRCLE);
    });

    it('should show edit form', () => {
      component.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      expect(component.showEditForm).toBeTrue();
    });

    it('should update map service', () => {
      spyOn(mapService, 'setEditDrawShape').and.callThrough();
      component.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      expect(mapService.setEditDrawShape).toHaveBeenCalledWith(
        MapOperationsEnum.DRAW_CIRCLE,
      );
    });

    it('should toggle off when clicking same type', () => {
      component.currentDrawType = MapOperationsEnum.DRAW_CIRCLE;
      component.startDrawing(MapOperationsEnum.DRAW_CIRCLE);
      expect(drawingSessionService.cancel).toHaveBeenCalled();
      expect(component.currentDrawType).toBe(MapOperationsEnum.DRAW_NONE);
      expect(component.showEditForm).toBeFalse();
    });
  });

  describe('Draw type subscription', () => {
    it('should update current draw type when map service emits', fakeAsync(() => {
      mapService.setEditDrawShape(MapOperationsEnum.DRAW_POLYLINE);
      tick();
      expect(component.currentDrawType).toBe(MapOperationsEnum.DRAW_POLYLINE);
    }));

    it('should show edit form when draw type is set', fakeAsync(() => {
      mapService.setEditDrawShape(MapOperationsEnum.DRAW_POLYGON);
      tick();
      expect(component.showEditForm).toBeTrue();
    }));

    it('should hide edit form when DRAW_NONE', fakeAsync(() => {
      component.currentDrawType = MapOperationsEnum.DRAW_CIRCLE;
      mapService.setEditDrawShape(MapOperationsEnum.DRAW_NONE);
      tick();
      expect(component.showEditForm).toBeFalse();
    }));
  });

  describe('closeContextMenu', () => {
    it('should set contextMenuVisible to false', () => {
      component.contextMenuVisible = true;
      component.closeContextMenu();
      expect(component.contextMenuVisible).toBeFalse();
    });

    it('should set contextMenuShape to null', () => {
      component.contextMenuShape = createMockSavedShape();
      component.closeContextMenu();
      expect(component.contextMenuShape).toBeNull();
    });
  });

  describe('onContextMenuAction', () => {
    it('should call openShapeForEditing for edit action', () => {
      const savedShape = createMockSavedShape();
      spyOn<any>(component, 'openShapeForEditing');

      component.onContextMenuAction({ type: 'edit', shape: savedShape });

      expect(component['openShapeForEditing']).toHaveBeenCalledWith(savedShape);
    });

    it('should call deleteShapeFromContextMenu for delete action', () => {
      const savedShape = createMockSavedShape();
      spyOn<any>(component, 'deleteShapeFromContextMenu');

      component.onContextMenuAction({ type: 'delete', shape: savedShape });

      expect(component['deleteShapeFromContextMenu']).toHaveBeenCalledWith(
        savedShape,
      );
    });
  });

  describe('Delete from context menu', () => {
    it('should call API delete', fakeAsync(() => {
      const savedShape = createMockSavedShape();
      component['deleteShapeFromContextMenu'](savedShape);
      tick();

      expect(shapeApiService.delete).toHaveBeenCalledWith('test-shape');
    }));

    it('should remove shape from saved shapes service', fakeAsync(() => {
      const savedShape = createMockSavedShape();
      component['deleteShapeFromContextMenu'](savedShape);
      tick();

      expect(savedShapesService.removeShape).toHaveBeenCalledWith('test-shape');
    }));
  });

  describe('Open shape for editing', () => {
    it('should delegate to drawingSessionService.startEditing (Option A)', () => {
      const savedShape = createMockSavedShape();
      component.isEditMode = true;
      component['openShapeForEditing'](savedShape);

      expect(drawingSessionService.startEditing).toHaveBeenCalledWith(
        savedShape,
      );
    });

    it('should not call drawToolService or editShapeFacadeService directly', () => {
      const savedShape = createMockSavedShape();
      component.isEditMode = true;
      component['openShapeForEditing'](savedShape);

      expect(drawToolService.startDrawing).not.toHaveBeenCalled();
      expect(editShapeFacadeService.fromShapeDto).not.toHaveBeenCalled();
    });
  });

  describe('Saved shape interaction in edit mode', () => {
    it('should allow saved shape interaction when edit mode is enabled and no session is active', () => {
      component.isEditMode = true;
      component.currentDrawType = MapOperationsEnum.DRAW_NONE;

      expect(component['canInteractWithSavedShapes']()).toBeTrue();
    });

    it('should block saved shape interaction when a drawing session is active', () => {
      component.isEditMode = true;
      // Simulate an active session by overriding the spy's isActive accessor.
      Object.defineProperty(drawingSessionService, 'isActive', {
        get: () => () => true,
        configurable: true,
      });

      expect(component['canInteractWithSavedShapes']()).toBeFalse();
    });

    it('should block saved shape interaction outside edit mode', () => {
      component.isEditMode = false;
      component.currentDrawType = MapOperationsEnum.DRAW_POLYLINE;

      expect(component['canInteractWithSavedShapes']()).toBeFalse();
    });

    it('should select a saved shape without opening context menu on left click while drawing', () => {
      const savedShape = createMockSavedShape();
      component.isEditMode = true;
      component.currentDrawType = MapOperationsEnum.DRAW_POLYLINE;
      component.contextMenuVisible = true;
      component.contextMenuShape = savedShape;
      component.viewer = { destroy: jasmine.createSpy('destroy') } as any;
      savedShapesMapOperationsService.findSavedShapeAtPosition.and.returnValue(
        savedShape,
      );

      component['handleSavedShapeLeftClick']({ x: 100, y: 80 } as any);

      expect(savedShapesService.selectShape).toHaveBeenCalledWith('test-shape');
      expect(component.contextMenuVisible).toBeFalse();
      expect(component.contextMenuShape).toBeNull();
    });

    it('should open context menu on right click while drawing', () => {
      const savedShape = createMockSavedShape();
      component.isEditMode = true;
      component.currentDrawType = MapOperationsEnum.DRAW_POLYLINE;
      component.viewer = { destroy: jasmine.createSpy('destroy') } as any;
      savedShapesMapOperationsService.findSavedShapeAtPosition.and.returnValue(
        savedShape,
      );

      component['handleSavedShapeRightClick']({ x: 120, y: 90 } as any);

      expect(savedShapesService.selectShape).not.toHaveBeenCalled();
      expect(component.contextMenuVisible).toBeTrue();
      expect(component.contextMenuShape).toBe(savedShape);
      expect(component.contextMenuX).toBe(120);
      expect(component.contextMenuY).toBe(90);
    });

    it('should open context menu on right click when operations service resolves shape', () => {
      const savedShape = createMockSavedShape();
      component.isEditMode = true;
      component.currentDrawType = MapOperationsEnum.DRAW_POLYLINE;
      component.viewer = { destroy: jasmine.createSpy('destroy') } as any;
      savedShapesMapOperationsService.findSavedShapeAtPosition.and.returnValue(
        savedShape,
      );

      component['handleSavedShapeRightClick']({ x: 120, y: 90 } as any);

      expect(component.contextMenuVisible).toBeTrue();
      expect(component.contextMenuShape).toBe(savedShape);
    });

    it('should close context menu on left click of empty map area', () => {
      component.contextMenuVisible = true;
      component.contextMenuShape = createMockSavedShape();
      component.viewer = { destroy: jasmine.createSpy('destroy') } as any;
      savedShapesMapOperationsService.findSavedShapeAtPosition.and.returnValue(
        null,
      );

      component['handleSavedShapeLeftClick']({ x: 0, y: 0 } as any);

      expect(savedShapesService.selectShape).toHaveBeenCalledWith(null);
      expect(component.contextMenuVisible).toBeFalse();
      expect(component.contextMenuShape).toBeNull();
    });

    it('should suppress next left click after drag gesture', () => {
      const savedShape = createMockSavedShape();
      component.contextMenuVisible = true;
      component.contextMenuShape = savedShape;
      component.viewer = { destroy: jasmine.createSpy('destroy') } as any;
      savedShapesMapOperationsService.consumeSuppressedLeftClick.and.returnValue(
        true,
      );

      component['handleSavedShapeLeftClick']({ x: 50, y: 60 } as any);

      expect(
        savedShapesMapOperationsService.consumeSuppressedLeftClick,
      ).toHaveBeenCalled();
      expect(savedShapesService.selectShape).not.toHaveBeenCalled();
      expect(component.contextMenuVisible).toBeTrue();
      expect(component.contextMenuShape).toBe(savedShape);
    });
  });

  describe('MapOperationsEnum exposure', () => {
    it('should expose MapOperationsEnum', () => {
      expect(component.MapOperationsEnum).toBe(MapOperationsEnum);
    });
  });

  describe('ngOnDestroy', () => {
    it('should destroy draw tool service', () => {
      component.ngOnDestroy();
      expect(drawToolService.destroy).toHaveBeenCalled();
    });
  });
});
