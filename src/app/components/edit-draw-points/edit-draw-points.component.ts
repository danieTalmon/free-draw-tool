import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ControlContainer,
  FormArray,
  FormArrayName,
  ReactiveFormsModule,
} from '@angular/forms';
import { DrawMapOption } from '@models/user-preferences';
import { EditShapeFacadeService } from '@services/edit-shape-facade.service';
import { MapOperationsEnum } from '@models/map-operations-enum';
import { MapLocation } from '@models/location';
import { DrawToolService } from '@services/draw-tool.service';
import { CoordinateSelectorComponent } from '@components/coordinate-selector/coordinate-selector.component';

@Component({
  selector: 'app-edit-draw-points',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CoordinateSelectorComponent],
  templateUrl: './edit-draw-points.component.html',
  styleUrls: ['./edit-draw-points.component.scss'],
  viewProviders: [
    {
      provide: ControlContainer,
      useExisting: FormArrayName,
    },
  ],
})
export class EditDrawPointsComponent {
  private readonly editShapeFacade = inject(EditShapeFacadeService);
  private readonly drawToolService = inject(DrawToolService);

  @Input() shapeEnum: DrawMapOption | null = null;

  readonly mapOperations = MapOperationsEnum;

  get editDrawPointsFormArray(): FormArray {
    return this.editShapeFacade.getPointsFormArray();
  }

  /**
   * Check if we can add more points (for polygon)
   */
  get canAddPoint(): boolean {
    // For polygon, allow adding more points (up to some reasonable limit)
    return (
      this.shapeEnum === MapOperationsEnum.DRAW_POLYGON &&
      this.editDrawPointsFormArray.length < 20
    );
  }

  /**
   * Check if we can remove points (minimum 3 for polygon)
   */
  get canRemovePoint(): boolean {
    return (
      this.shapeEnum === MapOperationsEnum.DRAW_POLYGON &&
      this.editDrawPointsFormArray.length > 3
    );
  }

  /**
   * Insert a new empty point after the selected polygon row.
   */
  insertPointAfter(index: number): void {
    if (!this.canAddPoint) return;

    const emptyLocation: MapLocation = {
      latitude: { degrees: 0 },
      longitude: { degrees: 0 },
      altitude: { feet: 0 },
    };

    this.editShapeFacade.insertPointAt(index + 1, emptyLocation);
    this.drawToolService.setPolygonPreviewInsertAfterIndex(index);
  }

  /**
   * Remove point at specific index
   */
  removePoint(index: number): void {
    if (!this.canRemovePoint) return;
    this.editShapeFacade.removePoint(index);
    this.drawToolService.setPolygonPreviewInsertAfterIndex(null);
  }

  readonly isShape = (enumString: string): boolean => {
    if (!this.shapeEnum) {
      return false;
    }
    switch (enumString) {
      case 'circle':
        return this.shapeEnum === MapOperationsEnum.DRAW_CIRCLE;
      case 'polyline':
        return this.shapeEnum === MapOperationsEnum.DRAW_POLYLINE;
      case 'polygon':
        return this.shapeEnum === MapOperationsEnum.DRAW_POLYGON;
      case 'text':
        return this.shapeEnum === MapOperationsEnum.DRAW_TEXT;
    }
    return false;
  };
}
