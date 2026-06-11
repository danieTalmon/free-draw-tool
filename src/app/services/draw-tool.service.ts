import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { OutlineType } from '@models/draw-event.model';
import { EntityLayers } from '@models/map-entities-layers';
import { DrawMapOption } from '@models/user-preferences';
import {
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  Entity,
  MaterialProperty,
  PolylineDashMaterialProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
} from 'cesium';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { MapOperationsEnum } from '@models/map-operations-enum';
import { MapLocation } from '@models/location';
import { ShapeDrawStyle } from '@models/shape-draw-style.model';
import { EditShapeFacadeService } from '@services/edit-shape-facade.service';
import {
  CENTER_DRAG_HANDLE_SIZE,
  INIT_POLYGON_POINTS,
  INVISIBLE_DRAG_HANDLE_ALPHA,
} from '@consts/draw.consts';
import {
  cartesian3ToMapLocation,
  mapLocationToCartesian3,
  sampleCircleBoundary,
} from '@helpers/cesium.helpers';

interface DrawToolState {
  type: DrawMapOption;
  isDrawing: boolean;
  isDragging: boolean;
  handlerCount: number;
  formShapeId: string | null;
}

interface StartDrawingOptions {
  preserveFormState?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class DrawToolService implements OnDestroy {
  private readonly editShapeFacadeService = inject(EditShapeFacadeService);
  private readonly ngZone = inject(NgZone);

  private positions: Cartesian3[] = [];
  private previewPosition: Cartesian3 | null = null;
  private radius: number | undefined = undefined;
  private state: DrawToolState = {
    type: MapOperationsEnum.DRAW_NONE,
    isDrawing: false,
    isDragging: false,
    handlerCount: 0,
    formShapeId: null,
  };

  private shapeSelectedSubject = new Subject<{
    entity: Entity;
    positions: MapLocation[];
    type: MapOperationsEnum;
  }>();
  private shapeDraggedSubject = new Subject<{
    entity: Entity;
    positions: MapLocation[];
    type: MapOperationsEnum;
  }>();
  private shapeStretchedSubject = new Subject<{
    entity: Entity;
    positions: MapLocation[];
    type: MapOperationsEnum;
  }>();

  shapeSelected$ = this.shapeSelectedSubject.asObservable();
  shapeDragged$ = this.shapeDraggedSubject.asObservable();
  shapeStretched$ = this.shapeStretchedSubject.asObservable();

  private viewer: Viewer | null = null;
  private handler: ScreenSpaceEventHandler | null = null;
  private shapeEntity: Entity | null = null;
  private shapeEditableConfig: ShapeDrawStyle = {
    entityColor: '#00ffff',
    lineWidth: 2,
    lineType: OutlineType.solid,
    maxPolygonPoints: INIT_POLYGON_POINTS,
    textLabel: 'Text',
  };
  private readonly destroy$ = new Subject<void>();
  private isPolylineDrawen = false;
  private isPolygonDrawen = false;
  private draggedVertexIndex: number | null = null;
  private isDraggingWholeShape = false;
  private syncWholeShapeDragToForm = false;
  private lastDragCartesian: Cartesian3 | null = null;
  private skipNextClick = false;
  private pointerDraggedSinceMouseDown = false;
  private vertexEntities: Entity[] = [];
  private draggedSavedShapeId: string | null = null;
  private polygonPreviewInsertAfterIndex: number | null = null;

  constructor() {
    this.bindFormChanges();
  }

  readonly initialize = (viewer: Viewer): void => {
    this.viewer = viewer;
  };

  // Convert Cartesian3 to MapLocation
  readonly cartesian3ToMapLocation = (cartesian: Cartesian3): MapLocation => {
    return cartesian3ToMapLocation(cartesian);
  };

  // Convert MapLocation to Cartesian3
  readonly mapLocationToCartesian3 = (location: MapLocation): Cartesian3 => {
    return mapLocationToCartesian3(location);
  };

  // Emit current positions as MapLocations (runs inside Angular zone to trigger change detection)
  private readonly emitPositionChanges = (): void => {
    const locations = this.positions
      .filter((position) => position !== undefined)
      .map((position) => this.cartesian3ToMapLocation(position));
    const normalizedLocations = this.withMinimumShapePoints(locations);
    this.ngZone.run(() => {
      this.editShapeFacadeService.clearPendingGeometryOverride();
      this.editShapeFacadeService.patchPointsFromMapLocations(
        normalizedLocations,
      );
    });
  };

  // Patch only one point in-place during drag (avoids destroying/recreating FormArray controls)
  private readonly emitDraggedVertexChange = (index: number): void => {
    if (index < 0 || index >= this.positions.length) return;
    const location = this.cartesian3ToMapLocation(this.positions[index]);
    this.ngZone.run(() => {
      this.editShapeFacadeService.clearPendingGeometryOverride();
      this.editShapeFacadeService.updatePoint(location, index);
    });
  };

  // Update radius in-place during circle drag
  private readonly emitRadiusChange = (): void => {
    const meters = this.radius ?? 0;
    this.ngZone.run(() => {
      this.editShapeFacadeService.clearPendingGeometryOverride();
      this.editShapeFacadeService.updateRadius(meters);
    });
  };

  private readonly emitPendingGeometryOverride = (): void => {
    const locations = this.positions.map((position) =>
      this.cartesian3ToMapLocation(position),
    );
    this.ngZone.run(() => {
      this.editShapeFacadeService.setPendingGeometryOverride(
        locations,
        this.radius,
      );
    });
  };

  // Update style from form
  readonly updateStyle = (style: Partial<ShapeDrawStyle>): void => {
    this.shapeEditableConfig = { ...this.shapeEditableConfig, ...style };
    // Recreate entity with new style if currently drawing
    if (this.shapeEntity && this.viewer && this.state.isDrawing) {
      const currentType = this.state.type;
      this.createTemporaryEntity(currentType);
    }
  };

  // Update text label
  readonly updateTextLabel = (text: string): void => {
    this.shapeEditableConfig.textLabel = text || 'Text';
  };

  // Update a specific position from form
  readonly updatePositionFromForm = (
    index: number,
    location: MapLocation,
  ): void => {
    if (index >= 0 && index < this.positions.length) {
      this.positions[index] = this.mapLocationToCartesian3(location);
    }
  };

  // Get current style config
  readonly getStyleConfig = (): ShapeDrawStyle => {
    return { ...this.shapeEditableConfig };
  };

  readonly startDrawing = (
    type: DrawMapOption,
    options?: StartDrawingOptions,
  ): void => {
    if (!this.viewer) {
      console.error('Viewer not initialized');
      return;
    }

    // Destroy any existing mouse handlers before creating new ones
    if (this.handler) {
      this.handler.destroy();
      this.handler = null;
    }

    // Cleanup previous drawing session
    if (this.shapeEntity != null) {
      this.viewer.entities.remove(this.shapeEntity);
    }
    this.shapeEntity = null;
    this.positions = [];
    this.previewPosition = null;
    this.radius = undefined;
    this.isPolylineDrawen = false;
    this.isPolygonDrawen = false;
    this.draggedVertexIndex = null;
    this.isDraggingWholeShape = false;
    this.syncWholeShapeDragToForm = false;
    this.lastDragCartesian = null;
    this.skipNextClick = false;
    this.pointerDraggedSinceMouseDown = false;
    this.draggedSavedShapeId = null;
    this.polygonPreviewInsertAfterIndex = null;
    this.clearVertexEntities();
    this.editShapeFacadeService.clearPendingGeometryOverride();

    if (!options?.preserveFormState) {
      // New drawings start from a clean saved state and placeholder points.
      this.editShapeFacadeService.clearSavedState();
      this.initializeMinimumPoints(type);
    }

    this.state = {
      type,
      isDrawing: true,
      isDragging: false,
      handlerCount: type === MapOperationsEnum.DRAW_POLYLINE ? 2 : 1,
      formShapeId: this.state.formShapeId,
    };

    // Preserve current form style values when starting or resuming editing.
    this.syncStyleFromForm();

    // Create entity once - positions will update via CallbackProperty
    this.createTemporaryEntity(type);

    this.setupMouseHandlers();
  };

  readonly cancelDrawing = (): void => {
    this.state.isDrawing = false;
    this.cleanup();
  };

  /**
   * Clear the temporary entity after a shape is saved.
   * Keeps the drawing mode active for creating a new shape.
   */
  readonly clearTempEntityAfterSave = (): void => {
    if (!this.viewer) return;

    // Remove temp entity
    if (this.shapeEntity) {
      this.viewer.entities.remove(this.shapeEntity);
      this.shapeEntity = null;
    }

    // Clear vertex entities
    this.clearVertexEntities();

    // Reset positions
    this.positions = [];
    this.previewPosition = null;
    this.radius = undefined;
    this.isPolylineDrawen = false;
    this.isPolygonDrawen = false;
    this.draggedVertexIndex = null;
    this.isDraggingWholeShape = false;
    this.syncWholeShapeDragToForm = false;
    this.lastDragCartesian = null;
    this.skipNextClick = false;
    this.pointerDraggedSinceMouseDown = false;
    this.draggedSavedShapeId = null;
    this.polygonPreviewInsertAfterIndex = null;

    // Reset form with minimum empty points for the current shape type
    // Call resetForm first to clear the shape ID, then initializeMinimumPoints
    if (this.state.type !== MapOperationsEnum.DRAW_NONE) {
      this.editShapeFacadeService.resetForm();
      this.initializeMinimumPoints(this.state.type);
      // Recreate temp entity for new drawing
      this.createTemporaryEntity(this.state.type);
    }
  };

  /**
   * Load positions from form data (used when editing an existing shape)
   */
  readonly loadPositionsFromForm = (): void => {
    this.editShapeFacadeService.clearPendingGeometryOverride();
    const pointsArray = this.editShapeFacadeService.pointsArray;
    const locations: MapLocation[] = [];

    for (let i = 0; i < pointsArray.length; i++) {
      const loc = this.editShapeFacadeService.getPointAsMapLocation(i);
      if (loc) {
        locations.push(loc);
      }
    }

    if (locations.length === 0) return;

    this.syncStyleFromForm();

    // Keep behavior consistent with form value-change flow (placeholder filtering,
    // polygon completion logic, and vertex synchronization).
    this.replacePositionsFromForm(locations);

    if (
      this.state.type === MapOperationsEnum.DRAW_POLYGON &&
      this.polygonPreviewInsertAfterIndex !== null &&
      this.polygonPreviewInsertAfterIndex >= this.positions.length
    ) {
      this.polygonPreviewInsertAfterIndex =
        this.positions.length > 0 ? this.positions.length - 1 : null;
    }

    if (this.state.type === MapOperationsEnum.DRAW_CIRCLE) {
      // Load radius from form
      const radiusValue =
        this.editShapeFacadeService.shapeForm.get('radius')?.value;
      this.radius = (radiusValue ?? 0) > 0 ? (radiusValue ?? 0) : 100;
    }

    this.previewPosition = null;

    // Ensure temp entity reflects form style values while editing existing shapes.
    if (
      this.state.isDrawing &&
      this.state.type !== MapOperationsEnum.DRAW_NONE
    ) {
      this.createTemporaryEntity(this.state.type);
    }
  };

  private readonly setupMouseHandlers = (): void => {
    if (!this.viewer?.scene.canvas) {
      return;
    }

    const scene = this.viewer.scene;
    this.handler = new ScreenSpaceEventHandler(scene.canvas);

    this.handler.setInputAction(
      this.handleMouseDown,
      ScreenSpaceEventType.LEFT_DOWN,
    );
    this.handler.setInputAction(
      this.handleMouseMove,
      ScreenSpaceEventType.MOUSE_MOVE,
    );
    this.handler.setInputAction(
      this.handleMouseUp,
      ScreenSpaceEventType.LEFT_UP,
    );
    this.handler.setInputAction(
      this.handleClick,
      ScreenSpaceEventType.LEFT_CLICK,
    );
  };

  private readonly handleMouseDown = (movement: {
    position: Cartesian2;
  }): void => {
    if (!this.state.isDrawing || !this.viewer) return;

    const pickedObject = this.viewer.scene.pick(movement.position);
    const pickedEntity = pickedObject?.id as Entity | undefined;
    const cartesian3 = this.pickMapPosition(movement.position);

    if (this.canDragWholeShape()) {
      if (this.isVertexEditingShape()) {
        const vertexIndex = this.getPickedVertexIndex(movement.position);
        if (vertexIndex !== null) {
          this.draggedVertexIndex = vertexIndex;
          this.pointerDraggedSinceMouseDown = false;
          return;
        }
      }

      const canStartWholeShapeDrag =
        (pickedEntity === this.shapeEntity && this.positions.length > 0) ||
        this.isCircleInteriorDragHit(cartesian3);

      const dragAnchor =
        cartesian3 ??
        (pickedEntity === this.shapeEntity && this.positions.length > 0
          ? this.positions[0]
          : null);

      if (canStartWholeShapeDrag && dragAnchor) {
        this.isDraggingWholeShape = true;
        this.draggedSavedShapeId =
          pickedEntity && pickedEntity !== this.shapeEntity
            ? this.getEntityId(pickedEntity)
            : null;
        this.syncWholeShapeDragToForm = true;
        this.lastDragCartesian = dragAnchor;
        this.pointerDraggedSinceMouseDown = false;
        return;
      }
    }

    const pickedNonTempEntity =
      !!pickedEntity && pickedEntity !== this.shapeEntity;
    if (
      this.state.type === MapOperationsEnum.DRAW_CIRCLE &&
      pickedNonTempEntity
    ) {
      // Saved-shape drag service owns drag interactions for non-temp entities.
      return;
    }

    if (!cartesian3) return;

    if (this.state.type === MapOperationsEnum.DRAW_CIRCLE) {
      this.state.isDragging = true;
      // Set center position - entity updates via CallbackProperty
      this.positions = [cartesian3];
      this.emitPositionChanges();
    }
  };

  private isCircleInteriorDragHit(position: Cartesian3 | null): boolean {
    if (
      this.state.type !== MapOperationsEnum.DRAW_CIRCLE ||
      !position ||
      this.positions.length === 0 ||
      this.radius === undefined ||
      this.radius <= 0
    ) {
      return false;
    }

    return Cartesian3.distance(this.positions[0], position) <= this.radius;
  }

  private readonly handleMouseMove = (movement: {
    endPosition: Cartesian2;
  }): void => {
    if (!this.state.isDrawing || !this.viewer) return;

    const ray = this.viewer.scene.camera.getPickRay(movement.endPosition);
    if (!ray) return;

    // Try pickEllipsoid first (works better in 2D mode), then globe.pick
    let currentCartesian3 = this.viewer.camera.pickEllipsoid(
      movement.endPosition,
      this.viewer.scene.globe.ellipsoid,
    );

    if (!currentCartesian3) {
      currentCartesian3 = this.viewer.scene.globe.pick(ray, this.viewer.scene);
    }

    if (!currentCartesian3) return;

    if (this.positions.length === 0) return;

    try {
      if (this.draggedVertexIndex !== null) {
        // Update position in-place — vertex CallbackProperty picks it up automatically
        this.positions[this.draggedVertexIndex] = currentCartesian3;
        this.pointerDraggedSinceMouseDown = true;
        // Patch only the dragged control — avoids full FormArray destroy/recreate
        this.emitDraggedVertexChange(this.draggedVertexIndex);
        return;
      }

      if (this.isDraggingWholeShape && this.lastDragCartesian) {
        const delta = Cartesian3.subtract(
          currentCartesian3,
          this.lastDragCartesian,
          new Cartesian3(),
        );
        this.positions = this.positions.map((position) =>
          Cartesian3.add(position, delta, new Cartesian3()),
        );
        this.lastDragCartesian = currentCartesian3;
        this.pointerDraggedSinceMouseDown = true;
        const isTempShapeDrag = !this.draggedSavedShapeId;
        const isSavedShapeEditMode =
          !!this.state.formShapeId &&
          !!this.draggedSavedShapeId &&
          this.state.formShapeId === this.draggedSavedShapeId;

        const shouldSyncToForm = isTempShapeDrag || isSavedShapeEditMode;
        if (shouldSyncToForm) {
          this.syncVertexEntities();
          this.emitPositionChanges();
        } else {
          this.emitPendingGeometryOverride();
        }
        return;
      }

      switch (this.state.type) {
        case MapOperationsEnum.DRAW_CIRCLE:
          if (this.state.isDragging && this.positions.length > 0) {
            const radius = Cartesian3.distance(
              this.positions[0],
              currentCartesian3,
            );
            this.radius = radius && radius > 0 ? radius : 100;
            this.emitRadiusChange();
          }
          break;
        case MapOperationsEnum.DRAW_POLYLINE:
          if (!this.isPolylineDrawen) {
            this.previewPosition = currentCartesian3;
          }
          break;
        case MapOperationsEnum.DRAW_POLYGON: {
          if (this.positions.length > 0 && !this.isPolygonDrawen) {
            this.previewPosition = currentCartesian3;
          }
          break;
        }
        case MapOperationsEnum.DRAW_TEXT:
          break;
        case MapOperationsEnum.DRAW_NONE:
          break;
        default:
          break;
      }
    } catch (error) {
      console.error('Error in handleMouseMove:', error);
    }
  };

  private readonly handleMouseUp = (movement: {
    position: Cartesian2;
  }): void => {
    if (!this.viewer) return;

    try {
      if (this.draggedVertexIndex !== null) {
        this.skipNextClick = this.pointerDraggedSinceMouseDown;
        this.draggedVertexIndex = null;
        this.pointerDraggedSinceMouseDown = false;
        return;
      }

      if (this.isDraggingWholeShape) {
        this.skipNextClick = this.pointerDraggedSinceMouseDown;
        this.isDraggingWholeShape = false;
        this.syncWholeShapeDragToForm = false;
        this.draggedSavedShapeId = null;
        this.lastDragCartesian = null;
        this.pointerDraggedSinceMouseDown = false;
        return;
      }

      if (
        this.state.type === MapOperationsEnum.DRAW_CIRCLE &&
        this.state.isDragging
      ) {
        this.state.isDragging = false;

        const ray = this.viewer.scene.camera.getPickRay(movement.position);
        if (!ray) return;

        // Try pickEllipsoid first (works better in 2D mode), then globe.pick
        let currentCartesian3 = this.viewer.camera.pickEllipsoid(
          movement.position,
          this.viewer.scene.globe.ellipsoid,
        );

        if (!currentCartesian3) {
          currentCartesian3 = this.viewer.scene.globe.pick(
            ray,
            this.viewer.scene,
          );
        }

        if (!currentCartesian3) return;

        const radius = Cartesian3.distance(
          this.positions[0],
          currentCartesian3,
        );
        this.radius = radius && radius > 0 ? radius : 100;
        this.emitRadiusChange();
      }
    } catch (error) {
      console.error('Error in handleMouseUp:', error);
      if (this.state.isDragging) {
        this.state.isDragging = false;
      }
    }
  };

  private readonly handleClick = (movement: { position: Cartesian2 }): void => {
    if (!this.state.isDrawing || !this.viewer) {
      return;
    }

    if (this.skipNextClick) {
      this.skipNextClick = false;
      return;
    }

    try {
      // Try pickEllipsoid first (works better in 2D mode), then globe.pick
      let location = this.viewer.camera.pickEllipsoid(
        movement.position,
        this.viewer.scene.globe.ellipsoid,
      );

      if (location == null) {
        const ray = this.viewer.scene.camera.getPickRay(movement.position);
        if (ray != null) {
          location = this.viewer.scene.globe.pick(ray, this.viewer.scene);
        }
      }

      if (location == null) {
        return;
      }

      switch (this.state.type) {
        case MapOperationsEnum.DRAW_POLYLINE:
          if (this.positions.length === 0) {
            this.positions.push(location);
            this.previewPosition = null;
            this.syncVertexEntities();
            this.emitPositionChanges();
          } else if (!this.isPolylineDrawen) {
            this.positions.push(location);
            this.isPolylineDrawen = true;
            this.previewPosition = null;
            this.syncVertexEntities();
            this.emitPositionChanges();
          }
          break;
        case MapOperationsEnum.DRAW_POLYGON:
          if (
            this.positions.length < this.shapeEditableConfig.maxPolygonPoints &&
            !this.isPolygonDrawen
          ) {
            if (
              this.polygonPreviewInsertAfterIndex !== null &&
              this.polygonPreviewInsertAfterIndex >= 0 &&
              this.polygonPreviewInsertAfterIndex < this.positions.length
            ) {
              this.positions.splice(
                this.polygonPreviewInsertAfterIndex + 1,
                0,
                location,
              );
            } else {
              this.positions.push(location);
            }
            this.isPolygonDrawen =
              this.positions.length >=
              this.shapeEditableConfig.maxPolygonPoints;
            this.previewPosition = null;
            this.polygonPreviewInsertAfterIndex = null;
            this.syncVertexEntities();
            this.emitPositionChanges();
          }
          break;
        case MapOperationsEnum.DRAW_TEXT:
          // Update text position - entity updates via CallbackProperty
          if (this.positions.length === 0) {
            this.positions.push(location);
          } else {
            this.positions[0] = location;
          }
          this.emitPositionChanges();
          break;
        case MapOperationsEnum.DRAW_CIRCLE:
          if (this.positions.length === 0) {
            this.positions = [location];
            this.emitPositionChanges();
          }
          break;
        case MapOperationsEnum.DRAW_NONE:
          break;
        default:
          break;
      }
    } catch (error) {
      console.error('Error in handleClick:', error);
    }
  };

  private getPolylineMaterial(): MaterialProperty {
    const color = Color.fromCssColorString(
      this.shapeEditableConfig.entityColor,
    );
    switch (this.shapeEditableConfig.lineType) {
      case OutlineType.dashed:
        return new PolylineDashMaterialProperty({ color, dashLength: 20 });
      case OutlineType.dotted:
        return new PolylineDashMaterialProperty({
          color,
          dashLength: 6,
          dashPattern: 0xcccc,
        });
      default:
        return new ColorMaterialProperty(color);
    }
  }

  private getCircleBoundaryPositions(): Cartesian3[] {
    const center = this.positions[0];
    if (!center || this.radius === undefined) {
      return [];
    }
    return sampleCircleBoundary(center, this.radius);
  }

  private getCenterDragHandle(color: Color) {
    return {
      pixelSize: CENTER_DRAG_HANDLE_SIZE,
      color: color.withAlpha(INVISIBLE_DRAG_HANDLE_ALPHA),
      outlineColor: Color.WHITE.withAlpha(INVISIBLE_DRAG_HANDLE_ALPHA),
      outlineWidth: 0,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    };
  }

  private readonly createTemporaryEntity = (type: MapOperationsEnum): void => {
    if (!this.viewer) return;

    // Remove existing entity if any
    if (this.shapeEntity) {
      this.viewer.entities.remove(this.shapeEntity);
      this.shapeEntity = null;
    }

    const color = Color.fromCssColorString(
      this.shapeEditableConfig.entityColor,
    );
    const lineWidth = this.shapeEditableConfig.lineWidth;

    switch (type) {
      case MapOperationsEnum.DRAW_CIRCLE:
        this.shapeEntity = this.viewer.entities.add({
          name: 'Temporary Circle',
          show: true,
          position: new CallbackProperty(
            () => this.positions[0],
            false,
          ) as unknown as Cartesian3,
          polyline: {
            show: new CallbackProperty(
              () =>
                this.positions.length > 0 &&
                this.radius !== undefined &&
                this.radius > 0,
              false,
            ),
            positions: new CallbackProperty(
              () => this.getCircleBoundaryPositions(),
              false,
            ) as unknown as Cartesian3[],
            width: lineWidth,
            material: this.getPolylineMaterial(),
            clampToGround: true,
          },
          point: {
            show: new CallbackProperty(() => this.positions.length > 0, false),
            ...this.getCenterDragHandle(color),
          },
        });
        break;
      case MapOperationsEnum.DRAW_POLYLINE:
        this.shapeEntity = this.viewer.entities.add({
          name: 'Temporary Polyline',
          show: true,
          polyline: {
            show: new CallbackProperty(
              () => this.getDisplayPolylinePositions().length >= 2,
              false,
            ),
            positions: new CallbackProperty(
              () => this.getDisplayPolylinePositions(),
              false,
            ) as unknown as Cartesian3[],
            width: lineWidth,
            material: this.getPolylineMaterial(),
            clampToGround: true,
          },
        });
        break;
      case MapOperationsEnum.DRAW_POLYGON:
        this.shapeEntity = this.viewer.entities.add({
          name: 'Temporary Polygon',
          show: true,
          polyline: {
            show: new CallbackProperty(
              () => this.getDisplayPolygonPositions().length >= 2,
              false,
            ),
            positions: new CallbackProperty(
              () => this.getDisplayPolygonPositions(),
              false,
            ) as unknown as Cartesian3[],
            width: lineWidth,
            material: this.getPolylineMaterial(),
            clampToGround: true,
          },
        });
        break;
      case MapOperationsEnum.DRAW_TEXT:
        this.shapeEntity = this.viewer.entities.add({
          name: 'Temporary Text',
          show: true,
          position: new CallbackProperty(
            () => this.positions[0],
            false,
          ) as unknown as Cartesian3,
          label: {
            show: new CallbackProperty(() => this.positions.length > 0, false),
            text: new CallbackProperty(
              () => this.shapeEditableConfig.textLabel || 'Text',
              false,
            ) as unknown as string,
            font: '26px monospace',
            fillColor: color,
            outlineColor: Color.WHITE,
            outlineWidth: 2,
            pixelOffset: new Cartesian2(0, -15),
          },
          point: {
            show: new CallbackProperty(() => this.positions.length > 0, false),
            ...this.getCenterDragHandle(color),
          },
        });
        break;
      default:
        this.shapeEntity = null;
        break;
    }
  };

  private readonly addEntityToDataSource = (entity: Entity): void => {
    const dataSources = this.viewer?.dataSources;
    if (!dataSources) return;
    const freeDrawDataSource = dataSources.getByName(
      EntityLayers.FREE_DRAW_SHAPES,
    )[0];
    console.log('freeDrawDataSource', freeDrawDataSource);
    freeDrawDataSource.entities.add(entity);
  };

  private readonly cleanup = (): void => {
    if (this.shapeEntity && this.viewer) {
      this.viewer.entities.remove(this.shapeEntity);
      this.shapeEntity = null;
    }

    this.clearVertexEntities();

    if (this.handler) {
      this.handler.destroy();
      this.handler = null;
    }

    this.state = {
      type: MapOperationsEnum.DRAW_NONE,
      isDrawing: false,
      isDragging: false,
      handlerCount: 0,
      formShapeId: this.state.formShapeId,
    };
    this.positions = [];
    this.previewPosition = null;
    this.isPolylineDrawen = false;
    this.isPolygonDrawen = false;
    this.draggedVertexIndex = null;
    this.isDraggingWholeShape = false;
    this.syncWholeShapeDragToForm = false;
    this.lastDragCartesian = null;
    this.skipNextClick = false;
    this.pointerDraggedSinceMouseDown = false;
    this.draggedSavedShapeId = null;
    this.polygonPreviewInsertAfterIndex = null;
    this.editShapeFacadeService.clearPendingGeometryOverride();
  };

  private getEntityId(entity: Entity | undefined): string | null {
    const rawId = entity?.id;
    if (typeof rawId === 'string' && rawId.trim().length > 0) {
      return rawId.trim();
    }
    return null;
  }

  private pickMapPosition(position: Cartesian2): Cartesian3 | null {
    if (!this.viewer) {
      return null;
    }

    let cartesian3 = this.viewer.camera.pickEllipsoid(
      position,
      this.viewer.scene.globe.ellipsoid,
    );

    if (!cartesian3) {
      const ray = this.viewer.scene.camera.getPickRay(position);
      if (!ray) {
        return null;
      }
      cartesian3 = this.viewer.scene.globe.pick(ray, this.viewer.scene);
    }

    return cartesian3 ?? null;
  }

  readonly destroy = (): void => {
    this.cleanup();
    this.ngOnDestroy();
    this.viewer = null;
  };

  readonly setPolygonPreviewInsertAfterIndex = (index: number | null): void => {
    if (index === null || Number.isNaN(index)) {
      this.polygonPreviewInsertAfterIndex = null;
      return;
    }

    this.polygonPreviewInsertAfterIndex = Math.max(0, Math.trunc(index));
  };

  private bindFormChanges(): void {
    this.editShapeFacadeService.nameChanges$
      .pipe(
        takeUntil(this.destroy$),
        filter(() => this.state.type === MapOperationsEnum.DRAW_TEXT),
      )
      .subscribe((name) => {
        this.updateTextLabel(String(name ?? ''));
      });

    this.editShapeFacadeService.lineTypeChanges$
      .pipe(takeUntil(this.destroy$))
      .subscribe((lineType) => {
        this.updateStyle({ lineType: lineType as OutlineType });
      });

    this.editShapeFacadeService.lineWidthChanges$
      .pipe(takeUntil(this.destroy$))
      .subscribe((lineWidth) => {
        this.updateStyle({ lineWidth: Number(lineWidth ?? 2) });
      });

    this.editShapeFacadeService.lineColorChanges$
      .pipe(takeUntil(this.destroy$))
      .subscribe((lineColor) => {
        this.updateStyle({ entityColor: String(lineColor ?? '#00ffff') });
      });

    this.editShapeFacadeService.pointsChanges$
      .pipe(takeUntil(this.destroy$))
      .subscribe((points) => {
        this.replacePositionsFromForm(points);
      });

    this.editShapeFacadeService.shapeIdChanges$
      .pipe(takeUntil(this.destroy$))
      .subscribe((shapeId) => {
        this.state.formShapeId = shapeId;
      });

    this.editShapeFacadeService.radiusChanges$
      .pipe(
        takeUntil(this.destroy$),
        filter(() => this.state.type === MapOperationsEnum.DRAW_CIRCLE),
      )
      .subscribe((meters) => {
        this.radius = meters > 0 ? meters : undefined;
      });
  }

  private replacePositionsFromForm(points: MapLocation[]): void {
    if (this.state.type === MapOperationsEnum.DRAW_NONE) {
      return;
    }

    switch (this.state.type) {
      case MapOperationsEnum.DRAW_CIRCLE:
      case MapOperationsEnum.DRAW_TEXT:
        if (points.length < 1) return;
        // Check if point is valid (not zeros - placeholder point)
        const point = points[0];
        if (point.latitude.degrees === 0 && point.longitude.degrees === 0) {
          // Placeholder point - keep positions empty
          this.positions = [];
        } else {
          this.positions = points
            .slice(0, 1)
            .map((p) => this.mapLocationToCartesian3(p));
        }
        this.previewPosition = null;
        break;
      case MapOperationsEnum.DRAW_POLYLINE:
        if (points.length < 2) return;
        const polylinePoints = points.slice(0, 2);
        const validPolylinePoints = polylinePoints.filter(
          (point) => !this.isPlaceholderPoint(point),
        );
        if (validPolylinePoints.length === 0) {
          this.positions = [];
          this.isPolylineDrawen = false;
        } else {
          this.positions = validPolylinePoints.map((point) =>
            this.mapLocationToCartesian3(point),
          );
          this.isPolylineDrawen = validPolylinePoints.length >= 2;
        }
        this.previewPosition = null;
        this.syncVertexEntities();
        break;
      case MapOperationsEnum.DRAW_POLYGON:
        if (points.length < 3) return;
        const validPolygonPoints = points.filter(
          (point) => !this.isPlaceholderPoint(point),
        );
        this.shapeEditableConfig.maxPolygonPoints = points.length;
        if (validPolygonPoints.length === 0) {
          this.positions = [];
          this.isPolygonDrawen = false;
        } else {
          this.positions = validPolygonPoints.map((point) =>
            this.mapLocationToCartesian3(point),
          );
          this.isPolygonDrawen =
            validPolygonPoints.length >=
            this.shapeEditableConfig.maxPolygonPoints;
        }
        this.previewPosition = null;
        this.syncVertexEntities();
        break;
      default:
        break;
    }
  }

  private initializeMinimumPoints(type: DrawMapOption): void {
    const emptyPoint: MapLocation = {
      latitude: { degrees: 0 },
      longitude: { degrees: 0 },
      altitude: { feet: 0 },
    };

    let minPoints: MapLocation[] = [];
    switch (type) {
      case MapOperationsEnum.DRAW_CIRCLE:
      case MapOperationsEnum.DRAW_TEXT:
        minPoints = [emptyPoint];
        break;
      case MapOperationsEnum.DRAW_POLYLINE:
        minPoints = [emptyPoint, { ...emptyPoint }];
        break;
      case MapOperationsEnum.DRAW_POLYGON:
        minPoints = [emptyPoint, { ...emptyPoint }, { ...emptyPoint }];
        break;
      default:
        break;
    }

    this.editShapeFacadeService.patchPointsFromMapLocations(minPoints);
  }

  private syncStyleFromForm(): void {
    const form = this.editShapeFacadeService.shapeForm;
    const lineType =
      (form.get('lineType')?.value as OutlineType) ?? OutlineType.solid;
    const lineWidth = Number(form.get('lineWidth')?.value ?? 2);
    const lineColor = String(form.get('lineColor')?.value ?? '#00ffff');
    const textLabel = String(form.get('name')?.value ?? '').trim() || 'Text';

    this.shapeEditableConfig = {
      ...this.shapeEditableConfig,
      lineType,
      lineWidth,
      entityColor: lineColor,
      textLabel,
    };
  }

  private withMinimumShapePoints(locations: MapLocation[]): MapLocation[] {
    const minimumPoints = this.getMinimumPointCountForCurrentShape();
    if (minimumPoints === 0 || locations.length >= minimumPoints) {
      return locations;
    }

    const emptyPoint: MapLocation = {
      latitude: { degrees: 0 },
      longitude: { degrees: 0 },
      altitude: { feet: 0 },
    };

    const filled = [...locations];
    while (filled.length < minimumPoints) {
      filled.push({
        latitude: { degrees: emptyPoint.latitude.degrees },
        longitude: { degrees: emptyPoint.longitude.degrees },
        altitude: { feet: emptyPoint.altitude.feet },
      });
    }

    return filled;
  }

  private getMinimumPointCountForCurrentShape(): number {
    switch (this.state.type) {
      case MapOperationsEnum.DRAW_CIRCLE:
      case MapOperationsEnum.DRAW_TEXT:
        return 1;
      case MapOperationsEnum.DRAW_POLYLINE:
        return 2;
      case MapOperationsEnum.DRAW_POLYGON:
        return Math.max(this.shapeEditableConfig.maxPolygonPoints, 3);
      default:
        return 0;
    }
  }

  private isPlaceholderPoint(point: MapLocation): boolean {
    return point.latitude.degrees === 0 && point.longitude.degrees === 0;
  }

  private isVertexEditingShape(): boolean {
    return (
      this.state.type === MapOperationsEnum.DRAW_POLYLINE ||
      this.state.type === MapOperationsEnum.DRAW_POLYGON
    );
  }

  private canDragWholeShape(): boolean {
    if (this.positions.length === 0) {
      return false;
    }

    switch (this.state.type) {
      case MapOperationsEnum.DRAW_CIRCLE:
      case MapOperationsEnum.DRAW_TEXT:
        return true;
      case MapOperationsEnum.DRAW_POLYLINE:
        return this.isPolylineDrawen;
      case MapOperationsEnum.DRAW_POLYGON:
        return this.isPolygonDrawen;
      default:
        return false;
    }
  }

  private isCompletedEditableShape(): boolean {
    if (this.state.type === MapOperationsEnum.DRAW_TEXT) {
      return this.positions.length > 0;
    }

    if (this.state.type === MapOperationsEnum.DRAW_POLYLINE) {
      return this.isPolylineDrawen;
    }

    if (this.state.type === MapOperationsEnum.DRAW_POLYGON) {
      return this.isPolygonDrawen;
    }

    return false;
  }

  private getDisplayPolylinePositions(): Cartesian3[] {
    if (!this.isPolylineDrawen && this.previewPosition) {
      return [...this.positions, this.previewPosition];
    }

    return [...this.positions];
  }

  private getDisplayPolygonPositions(): Cartesian3[] {
    const polygonPositions = [...this.positions];

    if (!this.isPolygonDrawen && this.previewPosition) {
      if (
        this.polygonPreviewInsertAfterIndex !== null &&
        this.polygonPreviewInsertAfterIndex >= 0 &&
        this.polygonPreviewInsertAfterIndex < polygonPositions.length
      ) {
        polygonPositions.splice(
          this.polygonPreviewInsertAfterIndex + 1,
          0,
          this.previewPosition,
        );
      } else {
        polygonPositions.push(this.previewPosition);
      }
    }

    if (polygonPositions.length >= 3) {
      return [...polygonPositions, polygonPositions[0]];
    }

    return polygonPositions;
  }

  private getPickedVertexIndex(position: Cartesian2): number | null {
    if (!this.viewer) {
      return null;
    }

    const pickedObject = this.viewer.scene.pick(position);
    const pickedEntity = pickedObject?.id as Entity | undefined;

    if (!pickedEntity) {
      return null;
    }

    const vertexIndex = this.vertexEntities.indexOf(pickedEntity);
    return vertexIndex >= 0 ? vertexIndex : null;
  }

  private syncVertexEntities(): void {
    if (!this.viewer) {
      return;
    }

    this.clearVertexEntities();

    if (!this.isVertexEditingShape()) {
      return;
    }

    this.vertexEntities = this.positions.map((_, index) =>
      this.viewer!.entities.add({
        name: `Vertex-${index}`,
        position: new CallbackProperty(
          () => this.positions[index],
          false,
        ) as unknown as Cartesian3,
        point: {
          pixelSize: 11,
          color: Color.WHITE,
          outlineColor: new CallbackProperty(
            () =>
              Color.fromCssColorString(this.shapeEditableConfig.entityColor),
            false,
          ) as unknown as Color,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }),
    );
  }

  private clearVertexEntities(): void {
    if (!this.viewer || this.vertexEntities.length === 0) {
      this.vertexEntities = [];
      return;
    }

    this.vertexEntities.forEach((entity) => {
      this.viewer?.entities.remove(entity);
    });
    this.vertexEntities = [];
  }

  ngOnDestroy(): void {
    if (!this.destroy$.closed) {
      this.destroy$.next();
      this.destroy$.complete();
    }
    this.shapeSelectedSubject.complete();
    this.shapeDraggedSubject.complete();
    this.shapeStretchedSubject.complete();
  }
}
