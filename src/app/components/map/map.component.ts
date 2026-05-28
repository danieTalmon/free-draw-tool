import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewInit,
  HostBinding,
  NgZone,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Viewer,
  Cartesian3,
  OpenStreetMapImageryProvider,
  SceneMode,
  CameraEventType,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartesian2,
  Entity,
} from 'cesium';
import { Subject, takeUntil } from 'rxjs';
import { DrawToolService } from '@services/draw-tool.service';
import { MapService } from '@services/map.service';
import { SavedShapesService } from '@services/saved-shapes.service';
import { SavedShapeEntity } from '@models/saved-shape-entity.model';
import { MapOperationsEnum } from '@models/map-operations-enum';
import { DrawMapOption } from '@models/user-preferences';
import { ContextMenuAction } from '@models/context-menu-action.model';
import { ShapeApiService } from '@services/shape-api.service';
import { EditShapeFacadeService } from '@services/edit-shape-facade.service';
import { shapeTypeToMapOperation } from '@adapters/shape.adapter';
import { SavedShapesMapOperationsService } from '../../services/saved-shapes-map-operations.service';
import { EditDrawComponent } from '@components/edit-draw/edit-draw.component';
import { ShapeContextMenuComponent } from '@components/shape-context-menu/shape-context-menu.component';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, EditDrawComponent, ShapeContextMenuComponent],
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapComponent implements AfterViewInit, OnDestroy {
  private readonly drawToolService = inject(DrawToolService);
  private readonly mapService = inject(MapService);
  private readonly savedShapesService = inject(SavedShapesService);
  private readonly shapeApiService = inject(ShapeApiService);
  private readonly editShapeFacadeService = inject(EditShapeFacadeService);
  private readonly savedShapesMapOperationsService = inject(
    SavedShapesMapOperationsService,
  );
  private readonly ngZone = inject(NgZone);

  @ViewChild('cesiumContainer', { static: true })
  cesiumContainer!: ElementRef<HTMLDivElement>;

  @HostBinding('class.drawing-mode')
  get isDrawingMode(): boolean {
    return this.currentDrawType !== MapOperationsEnum.DRAW_NONE;
  }

  viewer: Viewer | null = null;
  private readonly isEditModeState = signal(false);
  private readonly currentDrawTypeSignal = this.mapService.editDrawShapeSignal;
  private readonly showEditFormSignal = computed(
    () => this.currentDrawTypeSignal() !== MapOperationsEnum.DRAW_NONE,
  );

  get isEditMode(): boolean {
    return this.isEditModeState();
  }

  set isEditMode(value: boolean) {
    this.isEditModeState.set(value);
  }

  get showEditForm(): boolean {
    return this.showEditFormSignal();
  }

  get currentDrawType(): DrawMapOption {
    return this.currentDrawTypeSignal();
  }

  set currentDrawType(value: DrawMapOption) {
    this.mapService.setEditDrawShape(value);
  }

  // Context menu state
  private readonly contextMenuVisibleState = signal(false);
  private readonly contextMenuXState = signal(0);
  private readonly contextMenuYState = signal(0);
  private readonly contextMenuShapeState = signal<SavedShapeEntity | null>(
    null,
  );

  get contextMenuVisible(): boolean {
    return this.contextMenuVisibleState();
  }

  set contextMenuVisible(value: boolean) {
    this.contextMenuVisibleState.set(value);
  }

  get contextMenuX(): number {
    return this.contextMenuXState();
  }

  set contextMenuX(value: number) {
    this.contextMenuXState.set(value);
  }

  get contextMenuY(): number {
    return this.contextMenuYState();
  }

  set contextMenuY(value: number) {
    this.contextMenuYState.set(value);
  }

  get contextMenuShape(): SavedShapeEntity | null {
    return this.contextMenuShapeState();
  }

  set contextMenuShape(value: SavedShapeEntity | null) {
    this.contextMenuShapeState.set(value);
  }

  readonly MapOperationsEnum = MapOperationsEnum;

  private destroy$ = new Subject<void>();
  private contextMenuHandler: ScreenSpaceEventHandler | null = null;

  ngAfterViewInit(): void {
    this.initCesium();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.drawToolService.destroy();
    if (this.contextMenuHandler) {
      this.contextMenuHandler.destroy();
      this.contextMenuHandler = null;
    }
    this.savedShapesMapOperationsService.resetDragState();
    if (this.viewer) {
      this.viewer.destroy();
    }
  }

  private initCesium(): void {
    // Create viewer with OpenStreetMap imagery in 2D mode
    this.viewer = new Viewer(this.cesiumContainer.nativeElement, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      vrButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: true,
      navigationHelpButton: false,
      sceneMode: SceneMode.SCENE2D,
      imageryProvider: new OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/',
      }),
    });

    // Initialize the draw tool service with the viewer
    this.drawToolService.initialize(this.viewer);

    // Initialize the saved shapes service with the viewer
    this.savedShapesService.initialize(this.viewer);

    // Setup context menu handler for saved shapes
    this.setupContextMenuHandler();

    // Configure camera controls: use middle mouse button for panning
    const controller = this.viewer.scene.screenSpaceCameraController;
    controller.translateEventTypes = CameraEventType.MIDDLE_DRAG;
    controller.zoomEventTypes = [
      CameraEventType.RIGHT_DRAG,
      CameraEventType.WHEEL,
    ];
    controller.tiltEventTypes = undefined as any;
    controller.rotateEventTypes = undefined as any;

    // Set initial camera position (e.g., over a nice location)
    this.viewer.camera.setView({
      destination: Cartesian3.fromDegrees(34.8, 32.0, 500000),
    });
  }

  toggleEditMode(): void {
    this.isEditMode = !this.isEditMode;
    if (!this.isEditMode) {
      // Exit edit mode - cancel any drawing and hide form
      this.drawToolService.cancelDrawing();
      this.currentDrawType = MapOperationsEnum.DRAW_NONE;
      // Show all saved shapes that might have been hidden during editing
      this.savedShapesService.showAllShapes();
    }
  }

  startDrawing(type: DrawMapOption): void {
    if (!this.isEditMode) return;

    // If clicking the same type, toggle off
    if (this.currentDrawType === type) {
      this.drawToolService.cancelDrawing();
      this.currentDrawType = MapOperationsEnum.DRAW_NONE;
      return;
    }

    this.currentDrawType = type;
    this.drawToolService.startDrawing(type);
  }

  // Context Menu Methods
  private setupContextMenuHandler(): void {
    if (!this.viewer?.scene.canvas) return;

    this.contextMenuHandler = new ScreenSpaceEventHandler(
      this.viewer.scene.canvas,
    );

    this.savedShapesMapOperationsService.bindDragInputActions(
      this.contextMenuHandler,
      this.viewer,
      () => this.canInteractWithSavedShapes(),
      () => this.closeContextMenu(),
    );

    this.contextMenuHandler.setInputAction(
      (movement: { position: Cartesian2 }) => {
        this.ngZone.run(() => {
          if (!this.canInteractWithSavedShapes()) {
            return;
          }

          this.handleSavedShapeLeftClick(movement.position);
        });
      },
      ScreenSpaceEventType.LEFT_CLICK,
    );

    // Listen for right-clicks on saved shapes whenever edit mode is enabled.
    this.contextMenuHandler.setInputAction(
      (movement: { position: Cartesian2 }) => {
        this.ngZone.run(() => {
          if (!this.canInteractWithSavedShapes()) {
            return;
          }

          this.handleSavedShapeRightClick(movement.position);
        });
      },
      ScreenSpaceEventType.RIGHT_CLICK,
    );
  }

  private canInteractWithSavedShapes(): boolean {
    return this.isEditMode;
  }

  private handleSavedShapeLeftClick(position: Cartesian2): void {
    if (!this.viewer) return;

    if (this.savedShapesMapOperationsService.consumeSuppressedLeftClick()) {
      return;
    }

    const savedShape =
      this.savedShapesMapOperationsService.findSavedShapeAtPosition(
        this.viewer,
        position,
      );
    if (savedShape) {
      // Left click only selects; the context menu opens on right click.
      this.savedShapesService.selectShape(savedShape.shapeDto.id || null);
      this.closeContextMenu();
    } else {
      this.savedShapesService.selectShape(null);
      this.closeContextMenu();
    }
  }

  private handleSavedShapeRightClick(position: Cartesian2): void {
    if (!this.viewer) return;

    const savedShape =
      this.savedShapesMapOperationsService.findSavedShapeAtPosition(
        this.viewer,
        position,
      );
    if (savedShape) {
      this.showContextMenu(position, savedShape);
    } else {
      this.closeContextMenu();
    }
  }

  private showContextMenu(position: Cartesian2, shape: SavedShapeEntity): void {
    this.contextMenuX = position.x;
    this.contextMenuY = position.y;
    this.contextMenuShape = shape;
    this.contextMenuVisible = true;
  }

  closeContextMenu(): void {
    this.contextMenuVisible = false;
    this.contextMenuShape = null;
  }

  onContextMenuAction(action: ContextMenuAction): void {
    switch (action.type) {
      case 'edit':
        this.openShapeForEditing(action.shape);
        break;
      case 'delete':
        this.deleteShapeFromContextMenu(action.shape);
        break;
    }
  }

  private openShapeForEditing(savedShape: SavedShapeEntity): void {
    const dto = savedShape.shapeDto;
    const drawType = shapeTypeToMapOperation(dto.shapeType);

    // Hide the saved shape entity while editing (temp entity will be used)
    if (dto.id) {
      this.savedShapesService.hideShape(dto.id);
    }

    // Set the draw type to open the form
    this.currentDrawType = drawType;

    // Start drawing mode first so handlers/entity are ready.
    this.drawToolService.startDrawing(drawType, { preserveFormState: true });

    // Load the shape data into the form
    this.editShapeFacadeService.fromShapeDto(dto);
    this.editShapeFacadeService.markAsSaved(dto);
    this.editShapeFacadeService.setCurrentShapeType(drawType);
    this.drawToolService.loadPositionsFromForm();
  }

  private deleteShapeFromContextMenu(savedShape: SavedShapeEntity): void {
    const shapeId = savedShape.shapeDto.id;
    if (!shapeId) return;

    // Delete from API
    this.shapeApiService
      .delete(shapeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Remove from saved shapes service (removes entity)
          this.savedShapesService.removeShape(shapeId);
          console.log('Shape deleted from context menu');
        },
        error: (error) => {
          console.error('Error deleting shape:', error);
        },
      });
  }
}
