import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DrawInput, OutlineType } from '@models/draw-event.model';
import { DrawMapOption } from '@models/user-preferences';
import { EditShapeFacadeService } from '@services/edit-shape-facade.service';
import { MapService } from '@services/map.service';
import { ShapeApiService } from '@services/shape-api.service';
import { SavedShapesService } from '@services/saved-shapes.service';
import { DrawToolService } from '@services/draw-tool.service';
import { Subject, startWith, takeUntil } from 'rxjs';
import { MapOperationsEnum } from '@models/map-operations-enum';
import { SHAPE_TYPE_TO_FORM_TYPE_TITLE } from '@consts/edit-draw-form.consts';
import { EditDrawPointsComponent } from '@components/edit-draw-points/edit-draw-points.component';
import { StyleInputComponent } from '@components/style-input/style-input.component';

@Component({
  selector: 'app-edit-draw',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    EditDrawPointsComponent,
    StyleInputComponent,
  ],
  templateUrl: './edit-draw.component.html',
  styleUrls: ['./edit-draw.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditDrawComponent implements OnDestroy {
  readonly shapeFormService = inject(EditShapeFacadeService);
  private readonly mapService = inject(MapService);
  private readonly shapeApiService = inject(ShapeApiService);
  private readonly savedShapesService = inject(SavedShapesService);
  private readonly drawToolService = inject(DrawToolService);
  private readonly drawTypeSignal = this.mapService.editDrawShapeSignal;
  private readonly shapeTypeTitleSignal = computed(() => {
    const drawType = this.drawTypeSignal();
    return drawType === MapOperationsEnum.DRAW_NONE
      ? ''
      : SHAPE_TYPE_TO_FORM_TYPE_TITLE[drawType];
  });
  private readonly isSavingState = signal(false);
  private readonly saveErrorState = signal<string | null>(null);
  private readonly drawTypeEffect = effect(() => {
    const drawType = this.drawTypeSignal();
    if (drawType !== MapOperationsEnum.DRAW_NONE) {
      this.shapeFormService.setCurrentShapeType(drawType);
    }
  });

  shapeForm: FormGroup = this.shapeFormService.shapeForm;
  private readonly formChangesSignal = toSignal(
    this.shapeForm.valueChanges.pipe(startWith(this.shapeForm.getRawValue())),
    { initialValue: this.shapeForm.getRawValue() },
  );
  get drawType(): DrawMapOption {
    return this.drawTypeSignal();
  }

  get shapeTypeTitle(): string {
    return this.shapeTypeTitleSignal();
  }

  get isSaving(): boolean {
    return this.isSavingState();
  }

  set isSaving(value: boolean) {
    this.isSavingState.set(value);
  }

  get saveError(): string | null {
    return this.saveErrorState();
  }

  set saveError(value: string | null) {
    this.saveErrorState.set(value);
  }

  readonly mapDrawOptions = MapOperationsEnum;

  lineTypeInput: DrawInput = {
    inputName: 'Line Type',
    options: [
      {
        optionValue: OutlineType.solid,
        optionImageName: 'line-type-full.svg',
        img: '<img height="30" src="assets/draw/line-type-full.svg">',
      },
      {
        optionValue: OutlineType.dashed,
        optionImageName: 'line-dash-wide.svg',
        img: '<img height="30" src="assets/draw/line-dash-wide.svg">',
      },
      {
        optionValue: OutlineType.dotted,
        optionImageName: 'line-dash-points.svg',
        img: '<img height="30" src="assets/draw/line-dash-points.svg">',
      },
    ],
  };

  lineWidthInput: DrawInput = {
    inputName: 'Line Width',
    options: [
      {
        optionValue: 2,
        optionImageName: 'line-width-2px.svg',
        img: '<img height="30" src="assets/draw/line-width-2px.svg">',
      },
      {
        optionValue: 4,
        optionImageName: 'line-width-4px.svg',
        img: '<img height="30" src="assets/draw/line-width-4px.svg">',
      },
      {
        optionValue: 6,
        optionImageName: 'line-width-6px.svg',
        img: '<img height="30" src="assets/draw/line-width-6px.svg">',
      },
    ],
  };

  colorInput: DrawInput = {
    inputName: 'Line Color',
    options: [
      {
        optionValue: '#00ffff',
        optionImageName: 'color-cyan.svg',
        img: '<img height="30" src="assets/draw/color-cyan.svg">',
      },
      {
        optionValue: '#999999',
        optionImageName: 'color-gray.svg',
        img: '<img height="30" src="assets/draw/color-gray.svg">',
      },
      {
        optionValue: '#00ff00',
        optionImageName: 'color-green.svg',
        img: '<img height="30" src="assets/draw/color-green.svg">',
      },
      {
        optionValue: '#ff00ff',
        optionImageName: 'color-magenta.svg',
        img: '<img height="30" src="assets/draw/color-magenta.svg">',
      },
      {
        optionValue: '#ff0000',
        optionImageName: 'color-red.svg',
        img: '<img height="30" src="assets/draw/color-red.svg">',
      },
      {
        optionValue: '#ffff00',
        optionImageName: 'color-yellow.svg',
        img: '<img height="30" src="assets/draw/color-yellow.svg">',
      },
    ],
  };

  private destroy$ = new Subject<void>();

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Check if save button should be enabled
   */
  get canSave(): boolean {
    // Track both form value changes and service-level unsaved changes signal for OnPush.
    this.formChangesSignal();
    return this.shapeFormService.unsavedChangesSignal() && !this.isSaving;
  }

  /**
   * Cancel editing - revert to last saved state or reset form
   */
  readonly cancel = (): void => {
    this.saveError = null;

    if (this.shapeFormService.isSaved) {
      this.shapeFormService.revertToLastSaved();
      this.drawToolService.loadPositionsFromForm();
      return;
    }

    this.drawToolService.clearTempEntityAfterSave();
  };

  /**
   * Save shape to server (create or update)
   */
  readonly save = (): void => {
    if (this.isSaving) return;

    this.isSaving = true;
    this.saveError = null;

    this.shapeFormService
      .saveCurrentShape()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (savedShape) => {
          this.isSaving = false;

          // Clear the temporary drawing entity and reset for new shape
          // This also initializes minimum points for the current shape type
          this.drawToolService.clearTempEntityAfterSave();

          console.log('Shape saved successfully:', savedShape);
        },
        error: (error) => {
          this.isSaving = false;
          this.saveError = error.message || 'Failed to save shape';
          console.error('Error saving shape:', error);
        },
      });
  };

  /**
   * Delete current shape from server
   */
  readonly deleteShape = (): void => {
    const shapeId = this.shapeFormService.shapeId;
    if (!shapeId) {
      // Shape was never saved, just reset
      this.shapeFormService.resetForm();
      this.shapeFormService.clearSavedState();
      return;
    }

    this.shapeApiService
      .delete(shapeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          console.log('Shape deleted successfully');

          // Remove from SavedShapesService (removes permanent entity)
          this.savedShapesService.removeShape(shapeId);

          this.shapeFormService.resetForm();
          this.shapeFormService.clearSavedState();
        },
        error: (error: unknown) => {
          const message =
            error instanceof Error ? error.message : 'Failed to delete shape';
          this.saveError = message;
          console.error('Error deleting shape:', error);
        },
      });
  };

  readonly setData = (): void => {
    // TODO: Implement shape data setting
    // this.shape?.polyline?.positions
    //   ?.getValue(JulianDate.now())
    //   .forEach((point: Cartesian3) => {
    //     const newLoc = cartesian3ToLocation(point);
    //     newLoc ? this.shapeData.push(newLoc) : '';
    //   });
  };
}
