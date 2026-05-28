/// <reference types="jasmine" />

import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of, throwError, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { EditDrawComponent } from '@components/edit-draw/edit-draw.component';
import { EditShapeFacadeService } from '@services/edit-shape-facade.service';
import { MapService } from '@services/map.service';
import { ShapeApiService } from '@services/shape-api.service';
import { SavedShapesService } from '@services/saved-shapes.service';
import { DrawToolService } from '@services/draw-tool.service';
import { MapOperationsEnum } from '@models/map-operations-enum';
import { OutlineType } from '@models/draw-event.model';
import { ShapeDto } from '@models/shape.model';

describe('EditDrawComponent', () => {
  let component: EditDrawComponent;
  let fixture: ComponentFixture<EditDrawComponent>;
  let editShapeFacadeService: EditShapeFacadeService;
  let mapService: MapService;
  let shapeApiService: ShapeApiService;
  let savedShapesService: jasmine.SpyObj<SavedShapesService>;
  let drawToolService: jasmine.SpyObj<DrawToolService>;

  beforeEach(async () => {
    const savedShapesSpy = jasmine.createSpyObj('SavedShapesService', [
      'addShape',
      'removeShape',
    ]);
    const drawToolSpy = jasmine.createSpyObj('DrawToolService', [
      'clearTempEntityAfterSave',
      'initialize',
      'loadPositionsFromForm',
    ]);

    await TestBed.configureTestingModule({
      imports: [
        EditDrawComponent,
        ReactiveFormsModule,
        BrowserAnimationsModule,
        HttpClientTestingModule,
      ],
      providers: [
        EditShapeFacadeService,
        MapService,
        ShapeApiService,
        { provide: SavedShapesService, useValue: savedShapesSpy },
        { provide: DrawToolService, useValue: drawToolSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EditDrawComponent);
    component = fixture.componentInstance;
    editShapeFacadeService = TestBed.inject(EditShapeFacadeService);
    mapService = TestBed.inject(MapService);
    shapeApiService = TestBed.inject(ShapeApiService);
    savedShapesService = TestBed.inject(
      SavedShapesService,
    ) as jasmine.SpyObj<SavedShapesService>;
    drawToolService = TestBed.inject(
      DrawToolService,
    ) as jasmine.SpyObj<DrawToolService>;

    fixture.detectChanges();
  });

  afterEach(() => {
    editShapeFacadeService.ngOnDestroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should have form from facade service', () => {
      expect(component.shapeForm).toBe(editShapeFacadeService.shapeForm);
    });

    it('should have DRAW_NONE draw type initially', () => {
      expect(component.drawType).toBe(MapOperationsEnum.DRAW_NONE);
    });

    it('should have empty shape type title initially', () => {
      expect(component.shapeTypeTitle).toBe('');
    });

    it('should not be saving initially', () => {
      expect(component.isSaving).toBeFalse();
    });

    it('should have no save error initially', () => {
      expect(component.saveError).toBeNull();
    });
  });

  describe('Draw type subscription', () => {
    it('should update draw type when map service emits', fakeAsync(() => {
      mapService.setEditDrawShape(MapOperationsEnum.DRAW_CIRCLE);
      tick();
      fixture.detectChanges();
      expect(component.drawType).toBe(MapOperationsEnum.DRAW_CIRCLE);
    }));

    it('should update shape type title for circle', fakeAsync(() => {
      mapService.setEditDrawShape(MapOperationsEnum.DRAW_CIRCLE);
      tick();
      fixture.detectChanges();
      expect(component.shapeTypeTitle).toBe('Circle');
    }));

    it('should update shape type title for polyline', fakeAsync(() => {
      mapService.setEditDrawShape(MapOperationsEnum.DRAW_POLYLINE);
      tick();
      fixture.detectChanges();
      expect(component.shapeTypeTitle).toBe('Line');
    }));

    it('should update shape type title for polygon', fakeAsync(() => {
      mapService.setEditDrawShape(MapOperationsEnum.DRAW_POLYGON);
      tick();
      fixture.detectChanges();
      expect(component.shapeTypeTitle).toBe('Polygon');
    }));

    it('should update shape type title for text', fakeAsync(() => {
      mapService.setEditDrawShape(MapOperationsEnum.DRAW_TEXT);
      tick();
      fixture.detectChanges();
      expect(component.shapeTypeTitle).toBe('Text');
    }));

    it('should set current shape type on facade service', fakeAsync(() => {
      spyOn(editShapeFacadeService, 'setCurrentShapeType');
      mapService.setEditDrawShape(MapOperationsEnum.DRAW_CIRCLE);
      tick();
      fixture.detectChanges();
      expect(editShapeFacadeService.setCurrentShapeType).toHaveBeenCalledWith(
        MapOperationsEnum.DRAW_CIRCLE,
      );
    }));

    it('should set draw type to DRAW_NONE when DRAW_NONE is emitted', fakeAsync(() => {
      mapService.setEditDrawShape(MapOperationsEnum.DRAW_CIRCLE);
      tick();
      fixture.detectChanges();
      mapService.setEditDrawShape(MapOperationsEnum.DRAW_NONE);
      tick();
      fixture.detectChanges();
      expect(component.drawType).toBe(MapOperationsEnum.DRAW_NONE);
      expect(component.shapeTypeTitle).toBe('');
    }));
  });

  describe('canSave', () => {
    it('should return false when no unsaved changes', () => {
      editShapeFacadeService.unsavedChangesSignal.set(false);
      expect(component.canSave).toBeFalse();
    });

    it('should return false when saving', () => {
      editShapeFacadeService.unsavedChangesSignal.set(true);
      component.isSaving = true;
      expect(component.canSave).toBeFalse();
    });

    it('should return true when has unsaved changes and not saving', () => {
      editShapeFacadeService.unsavedChangesSignal.set(true);
      component.isSaving = false;
      expect(component.canSave).toBeTrue();
    });
  });

  describe('cancel', () => {
    it('should clear save error', () => {
      component.saveError = 'Some error';
      component.cancel();
      expect(component.saveError).toBeNull();
    });

    it('should reset unsaved create-mode drawing to minimum points', () => {
      spyOnProperty(editShapeFacadeService, 'isSaved', 'get').and.returnValue(
        false,
      );

      component.cancel();

      expect(drawToolService.clearTempEntityAfterSave).toHaveBeenCalled();
    });

    it('should revert saved shape edits in the form', () => {
      spyOnProperty(editShapeFacadeService, 'isSaved', 'get').and.returnValue(
        true,
      );
      spyOn(editShapeFacadeService, 'revertToLastSaved');

      component.cancel();

      expect(editShapeFacadeService.revertToLastSaved).toHaveBeenCalled();
    });

    it('should reload saved shape positions on the map after cancel', () => {
      spyOnProperty(editShapeFacadeService, 'isSaved', 'get').and.returnValue(
        true,
      );

      component.cancel();

      expect(drawToolService.loadPositionsFromForm).toHaveBeenCalled();
    });

    it('should keep save disabled when opening saved shape and after cancel', () => {
      const savedDto: ShapeDto = {
        id: 'saved-1',
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
      };

      mapService.setEditDrawShape(MapOperationsEnum.DRAW_CIRCLE);
      editShapeFacadeService.fromShapeDto(savedDto);
      editShapeFacadeService.markAsSaved(savedDto);

      expect(component.canSave).toBeFalse();

      component.shapeForm.patchValue({ name: 'Edited Name' });
      expect(component.canSave).toBeTrue();

      component.cancel();
      expect(component.canSave).toBeFalse();
    });
  });

  describe('save', () => {
    const mockShapeDto: ShapeDto = {
      id: 'new-id',
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
    };

    beforeEach(() => {
      editShapeFacadeService.setCurrentShapeType(MapOperationsEnum.DRAW_CIRCLE);
      editShapeFacadeService.addPoint({
        latitude: { degrees: 32.0 },
        longitude: { degrees: 34.0 },
        altitude: { feet: 0 },
      });
    });

    it('should not save if already saving', () => {
      component.isSaving = true;
      spyOn(shapeApiService, 'save');
      component.save();
      expect(shapeApiService.save).not.toHaveBeenCalled();
    });

    it('should set isSaving to true when saving', fakeAsync(() => {
      // Use timer to delay the observable emission so we can check isSaving before completion
      spyOn(shapeApiService, 'save').and.returnValue(
        timer(100).pipe(switchMap(() => of(mockShapeDto))),
      );
      component.save();
      expect(component.isSaving).toBeTrue();
      tick(300);
    }));

    it('should clear save error when starting save', fakeAsync(() => {
      component.saveError = 'Previous error';
      spyOn(shapeApiService, 'save').and.returnValue(of(mockShapeDto));
      component.save();
      expect(component.saveError).toBeNull();
      tick(300);
    }));

    it('should call shapeApiService.save with DTO', fakeAsync(() => {
      spyOn(shapeApiService, 'save').and.returnValue(of(mockShapeDto));
      component.save();
      expect(shapeApiService.save).toHaveBeenCalled();
      tick(300);
    }));

    it('should clear temp entity and saved state after save', fakeAsync(() => {
      spyOn(shapeApiService, 'save').and.returnValue(of(mockShapeDto));
      spyOn(editShapeFacadeService, 'clearSavedState');
      component.save();
      tick(300);
      // clearTempEntityAfterSave internally calls resetForm and initializeMinimumPoints
      expect(drawToolService.clearTempEntityAfterSave).toHaveBeenCalled();
      expect(editShapeFacadeService.clearSavedState).toHaveBeenCalled();
    }));

    it('should add shape to saved shapes service on success', fakeAsync(() => {
      spyOn(shapeApiService, 'save').and.returnValue(of(mockShapeDto));
      component.save();
      tick(300);
      expect(savedShapesService.addShape).toHaveBeenCalledWith(mockShapeDto);
    }));

    it('should clear temp entity after save', fakeAsync(() => {
      spyOn(shapeApiService, 'save').and.returnValue(of(mockShapeDto));
      component.save();
      tick(300);
      expect(drawToolService.clearTempEntityAfterSave).toHaveBeenCalled();
    }));

    it('should set isSaving to false on success', fakeAsync(() => {
      spyOn(shapeApiService, 'save').and.returnValue(of(mockShapeDto));
      component.save();
      tick(300);
      expect(component.isSaving).toBeFalse();
    }));

    it('should set save error on failure', fakeAsync(() => {
      spyOn(shapeApiService, 'save').and.returnValue(
        throwError(() => new Error('Save failed')),
      );
      component.save();
      tick(300);
      expect(component.saveError).toBe('Save failed');
    }));

    it('should set isSaving to false on failure', fakeAsync(() => {
      spyOn(shapeApiService, 'save').and.returnValue(
        throwError(() => new Error('Save failed')),
      );
      component.save();
      tick(300);
      expect(component.isSaving).toBeFalse();
    }));
  });

  describe('deleteShape', () => {
    it('should reset form when shape has no id', () => {
      spyOn(editShapeFacadeService, 'resetForm');
      spyOn(editShapeFacadeService, 'clearSavedState');
      component.deleteShape();
      expect(editShapeFacadeService.resetForm).toHaveBeenCalled();
      expect(editShapeFacadeService.clearSavedState).toHaveBeenCalled();
    });

    it('should call API delete when shape has id', fakeAsync(() => {
      editShapeFacadeService.shapeForm.patchValue({ id: 'existing-id' });
      spyOn(shapeApiService, 'delete').and.returnValue(of(void 0));
      component.deleteShape();
      tick(300);
      expect(shapeApiService.delete).toHaveBeenCalledWith('existing-id');
    }));

    it('should remove from saved shapes service on success', fakeAsync(() => {
      editShapeFacadeService.shapeForm.patchValue({ id: 'existing-id' });
      spyOn(shapeApiService, 'delete').and.returnValue(of(void 0));
      component.deleteShape();
      tick(300);
      expect(savedShapesService.removeShape).toHaveBeenCalledWith(
        'existing-id',
      );
    }));

    it('should reset form on successful delete', fakeAsync(() => {
      editShapeFacadeService.shapeForm.patchValue({ id: 'existing-id' });
      spyOn(shapeApiService, 'delete').and.returnValue(of(void 0));
      spyOn(editShapeFacadeService, 'resetForm');
      spyOn(editShapeFacadeService, 'clearSavedState');
      component.deleteShape();
      tick(300);
      expect(editShapeFacadeService.resetForm).toHaveBeenCalled();
      expect(editShapeFacadeService.clearSavedState).toHaveBeenCalled();
    }));

    it('should set save error on delete failure', fakeAsync(() => {
      editShapeFacadeService.shapeForm.patchValue({ id: 'existing-id' });
      spyOn(shapeApiService, 'delete').and.returnValue(
        throwError(() => new Error('Delete failed')),
      );
      component.deleteShape();
      tick(300);
      expect(component.saveError).toBe('Delete failed');
    }));
  });

  describe('Line type input configuration', () => {
    it('should have line type input with three options', () => {
      expect(component.lineTypeInput.options.length).toBe(3);
    });

    it('should have solid, dashed, and dotted line types', () => {
      const values = component.lineTypeInput.options.map((o) => o.optionValue);
      expect(values).toContain(OutlineType.solid);
      expect(values).toContain(OutlineType.dashed);
      expect(values).toContain(OutlineType.dotted);
    });
  });

  describe('Line width input configuration', () => {
    it('should have line width input with three options', () => {
      expect(component.lineWidthInput.options.length).toBe(3);
    });

    it('should have 2, 4, and 6 pixel widths', () => {
      const values = component.lineWidthInput.options.map((o) => o.optionValue);
      expect(values).toContain(2);
      expect(values).toContain(4);
      expect(values).toContain(6);
    });
  });

  describe('Color input configuration', () => {
    it('should have color input with six options', () => {
      expect(component.colorInput.options.length).toBe(6);
    });

    it('should include cyan, gray, green, magenta, red, and yellow', () => {
      const values = component.colorInput.options.map((o) => o.optionValue);
      expect(values).toContain('#00ffff');
      expect(values).toContain('#999999');
      expect(values).toContain('#00ff00');
      expect(values).toContain('#ff00ff');
      expect(values).toContain('#ff0000');
      expect(values).toContain('#ffff00');
    });
  });

  describe('ngOnDestroy', () => {
    it('should complete destroy subject', () => {
      const destroySpy = spyOn(component['destroy$'], 'next');
      const completeSpy = spyOn(component['destroy$'], 'complete');

      component.ngOnDestroy();

      expect(destroySpy).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalled();
    });
  });

  // Bug fix tests
  describe('Bug Fix: Save creates new shape instead of updating', () => {
    const bugFixMockShapeDto: ShapeDto = {
      id: 'test-id',
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

    beforeEach(() => {
      editShapeFacadeService.setCurrentShapeType(MapOperationsEnum.DRAW_CIRCLE);
      editShapeFacadeService.addPoint({
        latitude: { degrees: 32.0 },
        longitude: { degrees: 34.0 },
        altitude: { feet: 0 },
      });
    });

    it('should call clearTempEntityAfterSave which resets form for new shape', fakeAsync(() => {
      spyOn(shapeApiService, 'save').and.returnValue(of(bugFixMockShapeDto));

      component.save();
      tick(300);

      // clearTempEntityAfterSave internally calls resetForm and initializeMinimumPoints
      expect(drawToolService.clearTempEntityAfterSave).toHaveBeenCalled();
    }));

    it('should clear saved state after successful save', fakeAsync(() => {
      spyOn(shapeApiService, 'save').and.returnValue(of(bugFixMockShapeDto));
      spyOn(editShapeFacadeService, 'clearSavedState');

      component.save();
      tick(300);

      expect(editShapeFacadeService.clearSavedState).toHaveBeenCalled();
    }));

    it('should not have shape ID in form after saving new shape', fakeAsync(() => {
      spyOn(shapeApiService, 'save').and.returnValue(of(bugFixMockShapeDto));

      component.save();
      tick(300);

      // After reset, the form ID should be cleared
      expect(editShapeFacadeService.shapeId).toBeFalsy();
    }));
  });
});
