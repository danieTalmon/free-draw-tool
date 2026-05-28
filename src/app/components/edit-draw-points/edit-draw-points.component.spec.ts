import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ReactiveFormsModule,
  FormGroup,
  FormArray,
  FormBuilder,
} from '@angular/forms';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { By } from '@angular/platform-browser';

import { EditDrawPointsComponent } from '@components/edit-draw-points/edit-draw-points.component';
import { EditShapeFacadeService } from '@services/edit-shape-facade.service';
import { MapOperationsEnum } from '@models/map-operations-enum';
import { DrawToolService } from '@services/draw-tool.service';

describe('EditDrawPointsComponent', () => {
  let component: EditDrawPointsComponent;
  let fixture: ComponentFixture<TestHostComponent>;
  let editShapeFacadeService: EditShapeFacadeService;
  let drawToolService: jasmine.SpyObj<DrawToolService>;

  // Create a wrapper component to provide FormGroupName context
  @Component({
    template: `
      <form [formGroup]="form">
        <div formArrayName="points">
          <app-edit-draw-points [shapeEnum]="shapeEnum"></app-edit-draw-points>
        </div>
      </form>
    `,
  })
  class TestHostComponent {
    form: FormGroup;
    shapeEnum: MapOperationsEnum | null = null;

    constructor(private fb: FormBuilder) {
      this.form = this.fb.group({
        points: this.fb.array([]),
      });
    }

    get pointsArray(): FormArray {
      return this.form.get('points') as FormArray;
    }
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TestHostComponent],
      imports: [
        EditDrawPointsComponent,
        ReactiveFormsModule,
        HttpClientTestingModule,
      ],
      providers: [
        EditShapeFacadeService,
        {
          provide: DrawToolService,
          useValue: jasmine.createSpyObj('DrawToolService', [
            'setPolygonPreviewInsertAfterIndex',
          ]),
        },
      ],
    }).compileComponents();

    editShapeFacadeService = TestBed.inject(EditShapeFacadeService);
    drawToolService = TestBed.inject(
      DrawToolService,
    ) as jasmine.SpyObj<DrawToolService>;
    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    component = fixture.debugElement.query(
      By.directive(EditDrawPointsComponent),
    ).componentInstance;
  });

  afterEach(() => {
    editShapeFacadeService.ngOnDestroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('editDrawPointsFormArray', () => {
    it('should return points form array from facade service', () => {
      const result = component.editDrawPointsFormArray;
      expect(result).toBe(editShapeFacadeService.getPointsFormArray());
    });
  });

  describe('isShape', () => {
    it('should return false when shapeEnum is null', () => {
      component.shapeEnum = null;
      expect(component.isShape('circle')).toBeFalse();
    });

    it('should return true for circle when DRAW_CIRCLE', () => {
      component.shapeEnum = MapOperationsEnum.DRAW_CIRCLE;
      expect(component.isShape('circle')).toBeTrue();
    });

    it('should return false for circle when not DRAW_CIRCLE', () => {
      component.shapeEnum = MapOperationsEnum.DRAW_POLYLINE;
      expect(component.isShape('circle')).toBeFalse();
    });

    it('should return true for polyline when DRAW_POLYLINE', () => {
      component.shapeEnum = MapOperationsEnum.DRAW_POLYLINE;
      expect(component.isShape('polyline')).toBeTrue();
    });

    it('should return true for polygon when DRAW_POLYGON', () => {
      component.shapeEnum = MapOperationsEnum.DRAW_POLYGON;
      expect(component.isShape('polygon')).toBeTrue();
    });

    it('should return true for text when DRAW_TEXT', () => {
      component.shapeEnum = MapOperationsEnum.DRAW_TEXT;
      expect(component.isShape('text')).toBeTrue();
    });

    it('should return false for unknown shape type', () => {
      component.shapeEnum = MapOperationsEnum.DRAW_CIRCLE;
      expect(component.isShape('unknown')).toBeFalse();
    });
  });

  describe('canAddPoint', () => {
    it('should return false when not polygon', () => {
      component.shapeEnum = MapOperationsEnum.DRAW_CIRCLE;
      expect(component.canAddPoint).toBeFalse();
    });

    it('should return true when polygon with less than 20 points', () => {
      component.shapeEnum = MapOperationsEnum.DRAW_POLYGON;
      // Add some points
      for (let i = 0; i < 5; i++) {
        editShapeFacadeService.addPoint({
          latitude: { degrees: i },
          longitude: { degrees: i },
          altitude: { feet: 0 },
        });
      }
      expect(component.canAddPoint).toBeTrue();
    });

    it('should return false when polygon has 20 points', () => {
      component.shapeEnum = MapOperationsEnum.DRAW_POLYGON;
      // Add 20 points
      for (let i = 0; i < 20; i++) {
        editShapeFacadeService.addPoint({
          latitude: { degrees: i },
          longitude: { degrees: i },
          altitude: { feet: 0 },
        });
      }
      expect(component.canAddPoint).toBeFalse();
    });
  });

  describe('canRemovePoint', () => {
    it('should return false when not polygon', () => {
      component.shapeEnum = MapOperationsEnum.DRAW_CIRCLE;
      editShapeFacadeService.addPoint({
        latitude: { degrees: 0 },
        longitude: { degrees: 0 },
        altitude: { feet: 0 },
      });
      expect(component.canRemovePoint).toBeFalse();
    });

    it('should return false when polygon has 3 points', () => {
      component.shapeEnum = MapOperationsEnum.DRAW_POLYGON;
      for (let i = 0; i < 3; i++) {
        editShapeFacadeService.addPoint({
          latitude: { degrees: i },
          longitude: { degrees: i },
          altitude: { feet: 0 },
        });
      }
      expect(component.canRemovePoint).toBeFalse();
    });

    it('should return true when polygon has more than 3 points', () => {
      component.shapeEnum = MapOperationsEnum.DRAW_POLYGON;
      for (let i = 0; i < 5; i++) {
        editShapeFacadeService.addPoint({
          latitude: { degrees: i },
          longitude: { degrees: i },
          altitude: { feet: 0 },
        });
      }
      expect(component.canRemovePoint).toBeTrue();
    });
  });

  describe('insertPointAfter', () => {
    it('should not insert point when canAddPoint is false', () => {
      component.shapeEnum = MapOperationsEnum.DRAW_CIRCLE;
      const initialLength = editShapeFacadeService.pointsArray.length;
      component.insertPointAfter(0);
      expect(editShapeFacadeService.pointsArray.length).toBe(initialLength);
      expect(
        drawToolService.setPolygonPreviewInsertAfterIndex,
      ).not.toHaveBeenCalled();
    });

    it('should insert empty point after selected index when canAddPoint is true', () => {
      component.shapeEnum = MapOperationsEnum.DRAW_POLYGON;
      // Add minimum points first
      for (let i = 0; i < 3; i++) {
        editShapeFacadeService.addPoint({
          latitude: { degrees: i },
          longitude: { degrees: i },
          altitude: { feet: 0 },
        });
      }

      component.insertPointAfter(1);

      expect(editShapeFacadeService.pointsArray.length).toBe(4);
      expect(
        editShapeFacadeService.pointsArray.at(2).getRawValue().coordinates
          .latitude,
      ).toBe(0);
      expect(
        editShapeFacadeService.pointsArray.at(2).getRawValue().coordinates
          .longitude,
      ).toBe(0);
      expect(
        editShapeFacadeService.pointsArray.at(3).getRawValue().coordinates
          .latitude,
      ).toBe(2);
      expect(
        drawToolService.setPolygonPreviewInsertAfterIndex,
      ).toHaveBeenCalledWith(1);
    });
  });

  describe('removePoint', () => {
    it('should not remove point when canRemovePoint is false', () => {
      component.shapeEnum = MapOperationsEnum.DRAW_POLYGON;
      for (let i = 0; i < 3; i++) {
        editShapeFacadeService.addPoint({
          latitude: { degrees: i },
          longitude: { degrees: i },
          altitude: { feet: 0 },
        });
      }
      const initialLength = editShapeFacadeService.pointsArray.length;
      component.removePoint(0);
      expect(editShapeFacadeService.pointsArray.length).toBe(initialLength);
    });

    it('should remove point at specified index when canRemovePoint is true', () => {
      component.shapeEnum = MapOperationsEnum.DRAW_POLYGON;
      for (let i = 0; i < 5; i++) {
        editShapeFacadeService.addPoint({
          latitude: { degrees: i },
          longitude: { degrees: i },
          altitude: { feet: 0 },
        });
      }
      const initialLength = editShapeFacadeService.pointsArray.length;
      component.removePoint(2);
      expect(editShapeFacadeService.pointsArray.length).toBe(initialLength - 1);
      expect(
        drawToolService.setPolygonPreviewInsertAfterIndex,
      ).toHaveBeenCalledWith(null);
    });

    it('should remove correct point', () => {
      component.shapeEnum = MapOperationsEnum.DRAW_POLYGON;
      for (let i = 0; i < 5; i++) {
        editShapeFacadeService.addPoint({
          latitude: { degrees: i * 10 },
          longitude: { degrees: i * 10 },
          altitude: { feet: 0 },
        });
      }
      // Remove point at index 2 (latitude: 20)
      component.removePoint(2);

      // Check remaining points
      const latitudes = editShapeFacadeService.pointsArray.controls.map(
        (control) => control.getRawValue().coordinates.latitude,
      );
      expect(latitudes).toEqual([0, 10, 30, 40]);
    });
  });

  describe('mapOperations enum', () => {
    it('should expose MapOperationsEnum', () => {
      expect(component.mapOperations).toBe(MapOperationsEnum);
    });
  });
});
