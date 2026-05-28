import { Injectable, inject } from '@angular/core';
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Entity,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
} from 'cesium';
import { SavedShapesService } from '@services/saved-shapes.service';
import { ShapeApiService } from '@services/shape-api.service';
import { EditShapeFacadeService } from '@services/edit-shape-facade.service';
import { SavedShapeEntity } from '@models/saved-shape-entity.model';
import { ShapeDto } from '@models/shape.model';
import { shapePointsToMapLocations } from '@adapters/shape.adapter';

interface SavedShapeDragSession {
  shapeId: string;
  originalDto: ShapeDto;
  latestDto: ShapeDto;
  lastDragCartesian: Cartesian3;
  startScreenPosition: Cartesian2;
  hasDragged: boolean;
}

const FEET_PER_METER = 3.28084;
const DRAG_THRESHOLD_PX = 6;

@Injectable({
  providedIn: 'root',
})
export class SavedShapesMapOperationsService {
  private readonly savedShapesService = inject(SavedShapesService);
  private readonly shapeApiService = inject(ShapeApiService);
  private readonly editShapeFacadeService = inject(EditShapeFacadeService);

  private dragSession: SavedShapeDragSession | null = null;
  private suppressNextLeftClick = false;

  bindDragInputActions(
    handler: ScreenSpaceEventHandler,
    viewer: Viewer | null,
    canInteract: () => boolean,
    onDragStarted?: () => void,
  ): void {
    handler.setInputAction((movement: { position: Cartesian2 }) => {
      if (!canInteract()) {
        return;
      }

      const started = this.startDragCandidate(viewer, movement.position);
      if (started) {
        onDragStarted?.();
      }
    }, ScreenSpaceEventType.LEFT_DOWN);

    handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
      if (!canInteract()) {
        return;
      }

      this.updateDrag(viewer, movement.endPosition);
    }, ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction(() => {
      if (!canInteract()) {
        return;
      }

      this.finishDrag();
    }, ScreenSpaceEventType.LEFT_UP);
  }

  findSavedShapeAtPosition(
    viewer: Viewer | null,
    position: Cartesian2,
  ): SavedShapeEntity | null {
    const pickedObject = this.pickSavedShapeTarget(viewer, position);
    const pickedEntity = pickedObject?.id as Entity | undefined;

    return (
      (pickedEntity &&
        this.savedShapesService.getShapeByEntity(pickedEntity)) ||
      this.savedShapesService.findShapeNearScreenPosition(position)
    );
  }

  startDragCandidate(viewer: Viewer | null, position: Cartesian2): boolean {
    if (!viewer) {
      return false;
    }

    const savedShape = this.findSavedShapeAtPosition(viewer, position);
    const shapeId = savedShape?.shapeDto.id;
    if (!savedShape || !shapeId) {
      this.dragSession = null;
      return false;
    }

    const dragAnchor = this.pickMapPosition(viewer, position);
    if (!dragAnchor) {
      this.dragSession = null;
      return false;
    }

    this.dragSession = {
      shapeId,
      originalDto: this.cloneShapeDto(savedShape.shapeDto),
      latestDto: this.cloneShapeDto(savedShape.shapeDto),
      lastDragCartesian: dragAnchor,
      startScreenPosition: new Cartesian2(position.x, position.y),
      hasDragged: false,
    };

    return true;
  }

  updateDrag(viewer: Viewer | null, position: Cartesian2): void {
    if (!viewer || !this.dragSession) {
      return;
    }

    const currentAnchor = this.pickMapPosition(viewer, position);
    if (!currentAnchor) {
      return;
    }

    if (!this.dragSession.hasDragged) {
      const movedDistance = Cartesian2.distance(
        this.dragSession.startScreenPosition,
        position,
      );
      if (movedDistance < DRAG_THRESHOLD_PX) {
        return;
      }

      this.dragSession.hasDragged = true;
      this.suppressNextLeftClick = true;
      this.savedShapesService.selectShape(this.dragSession.shapeId);
    }

    const delta = Cartesian3.subtract(
      currentAnchor,
      this.dragSession.lastDragCartesian,
      new Cartesian3(),
    );

    const draggedShape = this.savedShapesService.getShapeById(
      this.dragSession.shapeId,
    );
    const sourceDto = draggedShape?.shapeDto ?? this.dragSession.latestDto;
    const translated = this.translateShapeDtoByDelta(sourceDto, delta);
    this.savedShapesService.updateShape(translated);
    this.syncFormForDraggedShapeIfMatched(translated);

    this.dragSession.latestDto = translated;
    this.dragSession.lastDragCartesian = currentAnchor;
  }

  finishDrag(): void {
    const session = this.dragSession;
    this.dragSession = null;

    if (!session?.hasDragged) {
      return;
    }

    this.shapeApiService.update(session.shapeId, session.latestDto).subscribe({
      next: (savedShape) => {
        this.savedShapesService.updateShape(savedShape);
      },
      error: (error) => {
        this.savedShapesService.updateShape(session.originalDto);
        console.error('Error saving dragged shape:', error);
        if (
          typeof window !== 'undefined' &&
          typeof window.alert === 'function'
        ) {
          window.alert('Unable to save dragged shape. Position was restored.');
        }
      },
    });
  }

  consumeSuppressedLeftClick(): boolean {
    if (!this.suppressNextLeftClick) {
      return false;
    }

    this.suppressNextLeftClick = false;
    return true;
  }

  resetDragState(): void {
    this.dragSession = null;
    this.suppressNextLeftClick = false;
  }

  private syncFormForDraggedShapeIfMatched(shapeDto: ShapeDto): void {
    const formShapeId = this.editShapeFacadeService.shapeId;
    const draggedShapeId = this.dragSession?.shapeId ?? null;

    if (!formShapeId || !draggedShapeId || formShapeId !== draggedShapeId) {
      return;
    }

    this.editShapeFacadeService.clearPendingGeometryOverride();
    this.editShapeFacadeService.patchPointsFromMapLocations(
      shapePointsToMapLocations(shapeDto.points),
    );

    if (shapeDto.shapeType === 'DRAW_CIRCLE' && shapeDto.radius !== undefined) {
      this.editShapeFacadeService.updateRadius(shapeDto.radius);
    }
  }

  private pickSavedShapeTarget(viewer: Viewer | null, position: Cartesian2) {
    try {
      return viewer?.scene.pick(position);
    } catch {
      return undefined;
    }
  }

  private pickMapPosition(
    viewer: Viewer,
    position: Cartesian2,
  ): Cartesian3 | null {
    let cartesian = viewer.camera.pickEllipsoid(
      position,
      viewer.scene.globe.ellipsoid,
    );

    if (!cartesian) {
      const ray = viewer.scene.camera.getPickRay(position);
      if (!ray) {
        return null;
      }
      cartesian = viewer.scene.globe.pick(ray, viewer.scene);
    }

    return cartesian ?? null;
  }

  private translateShapeDtoByDelta(
    shape: ShapeDto,
    delta: Cartesian3,
  ): ShapeDto {
    const translatedPoints = shape.points.map((point) => {
      const originalCartesian = Cartesian3.fromDegrees(
        point.coordinates.longitude,
        point.coordinates.latitude,
        (point.altitude?.feet ?? 0) / FEET_PER_METER,
      );
      const translatedCartesian = Cartesian3.add(
        originalCartesian,
        delta,
        new Cartesian3(),
      );
      const translatedCartographic =
        Cartographic.fromCartesian(translatedCartesian);

      return {
        coordinates: {
          latitude: CesiumMath.toDegrees(translatedCartographic.latitude),
          longitude: CesiumMath.toDegrees(translatedCartographic.longitude),
        },
        altitude: {
          feet: translatedCartographic.height * FEET_PER_METER,
        },
      };
    });

    return {
      ...shape,
      points: translatedPoints,
    };
  }

  private cloneShapeDto(shape: ShapeDto): ShapeDto {
    return JSON.parse(JSON.stringify(shape)) as ShapeDto;
  }
}
