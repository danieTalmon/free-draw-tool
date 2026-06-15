import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import {
  Cartesian2,
  CallbackProperty,
  Cartesian3,
  Cartographic,
  Color,
  ColorMaterialProperty,
  CustomDataSource,
  Entity,
  PolylineDashMaterialProperty,
  Viewer,
} from 'cesium';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { ShapeDto } from '@models/shape.model';
import { OutlineType } from '@models/draw-event.model';
import { MapLocation } from '@models/location';
import { EntityLayers } from '@models/map-entities-layers';
import { SavedShapeEntity } from '@models/saved-shape-entity.model';
import { shapePointsToMapLocations } from '@adapters/shape.adapter';
import {
  INVISIBLE_HIT_ALPHA,
  MIN_HIT_POLYLINE_WIDTH,
  SAVED_SHAPE_SCREEN_HIT_TOLERANCE_PX,
  TEXT_HIT_PIXEL_SIZE,
} from '@consts/saved-shapes.consts';
import {
  mapLocationToCartesian3,
  sampleCircleBoundary,
} from '@helpers/cesium.helpers';

@Injectable({
  providedIn: 'root',
})
export class SavedShapesService implements OnDestroy {
  private readonly ngZone = inject(NgZone);

  private viewer: Viewer | null = null;
  private dataSource: CustomDataSource | null = null;
  private savedShapes: Map<string, SavedShapeEntity> = new Map();

  private readonly _shapes$ = new BehaviorSubject<SavedShapeEntity[]>([]);
  readonly shapes$ = this._shapes$.asObservable();

  private readonly _selectedShape$ =
    new BehaviorSubject<SavedShapeEntity | null>(null);
  readonly selectedShape$ = this._selectedShape$.asObservable();

  private readonly destroy$ = new Subject<void>();

  initialize(viewer: Viewer): void {
    this.viewer = viewer;
    this.initializeDataSource();
  }

  private initializeDataSource(): void {
    if (!this.viewer) return;

    // Check if datasource already exists
    const existing = this.viewer.dataSources.getByName(
      EntityLayers.FREE_DRAW_SHAPES,
    );
    if (existing.length > 0) {
      this.dataSource = existing[0] as CustomDataSource;
    } else {
      this.dataSource = new CustomDataSource(EntityLayers.FREE_DRAW_SHAPES);
      this.viewer.dataSources.add(this.dataSource);
    }
  }

  /**
   * Add a shape to the saved shapes datasource
   */
  addShape(shapeDto: ShapeDto): Entity | null {
    if (!this.dataSource || !shapeDto.id) {
      console.error('Cannot add shape: no dataSource or no shape id');
      return null;
    }

    // Remove existing entity with same ID if any
    const existing = this.savedShapes.get(shapeDto.id);
    if (existing) {
      this.dataSource.entities.remove(existing.entity);
      existing.vertexEntities?.forEach((vertexEntity) => {
        this.dataSource?.entities.remove(vertexEntity);
      });
      existing.hitEntities?.forEach((hitEntity) => {
        this.dataSource?.entities.remove(hitEntity);
      });
    }

    const entity = this.createEntityFromDto(shapeDto);
    if (!entity) return null;

    const vertexEntities = this.createVertexEntitiesFromDto(shapeDto);
    const hitEntities = this.createHitEntitiesFromDto(shapeDto);

    this.dataSource.entities.add(entity);
    vertexEntities.forEach((vertexEntity) => {
      this.dataSource?.entities.add(vertexEntity);
    });
    hitEntities.forEach((hitEntity) => {
      this.dataSource?.entities.add(hitEntity);
    });

    this.savedShapes.set(shapeDto.id, {
      entity,
      shapeDto,
      vertexEntities,
      hitEntities,
    });
    this.emitShapesUpdate();

    return entity;
  }

  /**
   * Update an existing shape
   */
  updateShape(shapeDto: ShapeDto): Entity | null {
    if (!shapeDto.id) return null;

    // Remove old and add new
    this.removeShape(shapeDto.id);
    return this.addShape(shapeDto);
  }

  /**
   * Remove a shape by ID
   */
  removeShape(shapeId: string): boolean {
    const savedShape = this.savedShapes.get(shapeId);
    if (!savedShape || !this.dataSource) return false;

    this.dataSource.entities.remove(savedShape.entity);
    savedShape.vertexEntities?.forEach((vertexEntity) => {
      this.dataSource?.entities.remove(vertexEntity);
    });
    savedShape.hitEntities?.forEach((hitEntity) => {
      this.dataSource?.entities.remove(hitEntity);
    });
    this.savedShapes.delete(shapeId);
    this.emitShapesUpdate();

    // Clear selection if this was selected
    if (this._selectedShape$.value?.shapeDto.id === shapeId) {
      this._selectedShape$.next(null);
    }

    return true;
  }

  /**
   * Get shape by entity
   */
  getShapeByEntity(entity: Entity): SavedShapeEntity | null {
    for (const [_, savedShape] of this.savedShapes) {
      if (
        savedShape.entity === entity ||
        savedShape.vertexEntities?.includes(entity) ||
        savedShape.hitEntities?.includes(entity)
      ) {
        return savedShape;
      }
    }
    return null;
  }

  /**
   * Get shape by ID
   */
  getShapeById(shapeId: string): SavedShapeEntity | null {
    return this.savedShapes.get(shapeId) || null;
  }

  findShapeNearScreenPosition(
    position: Cartesian2,
    tolerancePx = SAVED_SHAPE_SCREEN_HIT_TOLERANCE_PX,
  ): SavedShapeEntity | null {
    if (!this.viewer) {
      return null;
    }

    let bestMatch: SavedShapeEntity | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const savedShape of this.savedShapes.values()) {
      if (savedShape.entity.show === false) {
        continue;
      }

      const distance = this.getScreenDistanceToShape(savedShape, position);
      if (
        distance === null ||
        distance > tolerancePx ||
        distance >= bestDistance
      ) {
        continue;
      }

      bestDistance = distance;
      bestMatch = savedShape;
    }

    return bestMatch;
  }

  /**
   * Select a shape
   */
  selectShape(shapeId: string | null): void {
    if (shapeId === null) {
      this._selectedShape$.next(null);
      return;
    }

    const shape = this.savedShapes.get(shapeId);
    this._selectedShape$.next(shape || null);
  }

  /**
   * Hide a shape entity (for editing with temp entity)
   */
  hideShape(shapeId: string): void {
    const savedShape = this.savedShapes.get(shapeId);
    if (savedShape?.entity) {
      savedShape.entity.show = false;
      savedShape.vertexEntities?.forEach((vertexEntity) => {
        vertexEntity.show = false;
      });
      savedShape.hitEntities?.forEach((hitEntity) => {
        hitEntity.show = false;
      });
    }
  }

  /**
   * Show a shape entity
   */
  showShape(shapeId: string): void {
    const savedShape = this.savedShapes.get(shapeId);
    if (savedShape?.entity) {
      savedShape.entity.show = true;
      savedShape.vertexEntities?.forEach((vertexEntity) => {
        vertexEntity.show = true;
      });
      savedShape.hitEntities?.forEach((hitEntity) => {
        hitEntity.show = true;
      });
    }
  }

  /**
   * Show all shapes
   */
  showAllShapes(): void {
    for (const [_, savedShape] of this.savedShapes) {
      savedShape.entity.show = true;
      savedShape.vertexEntities?.forEach((vertexEntity) => {
        vertexEntity.show = true;
      });
      savedShape.hitEntities?.forEach((hitEntity) => {
        hitEntity.show = true;
      });
    }
  }

  /**
   * Check if entity belongs to saved shapes
   */
  isEntitySavedShape(entity: Entity): boolean {
    return this.getShapeByEntity(entity) !== null;
  }

  private createEntityFromDto(dto: ShapeDto): Entity | null {
    const locations = shapePointsToMapLocations(dto.points);
    const positions = locations.map((loc) => this.mapLocationToCartesian3(loc));
    const color = Color.fromCssColorString(dto.lineColor || '#00ffff');
    const lineWidth = dto.lineWidth || 2;

    const entityOptions: Entity.ConstructorOptions = {
      id: dto.id,
      name: dto.name || `Shape ${dto.id}`,
      properties: {
        shapeType: dto.shapeType,
        shapeDto: dto,
      },
    };

    switch (dto.shapeType) {
      case 'DRAW_CIRCLE':
        return new Entity({
          ...entityOptions,
          position: positions[0],
          polyline: {
            positions: sampleCircleBoundary(positions[0], dto.radius || 100),
            width: lineWidth,
            material: this.getPolylineMaterial(dto.lineType, color),
            clampToGround: true,
          },
        });

      case 'DRAW_POLYLINE':
        return new Entity({
          ...entityOptions,
          polyline: {
            positions: positions,
            width: lineWidth,
            material: this.getPolylineMaterial(dto.lineType, color),
            clampToGround: true,
          },
        });

      case 'DRAW_POLYGON':
        // Close the polygon by adding first point at end
        const closedPositions = [...positions, positions[0]];
        return new Entity({
          ...entityOptions,
          polyline: {
            positions: closedPositions,
            width: lineWidth,
            material: this.getPolylineMaterial(dto.lineType, color),
            clampToGround: true,
          },
        });

      case 'DRAW_TEXT':
        return new Entity({
          ...entityOptions,
          position: positions[0],
          label: {
            text: dto.name || 'Text',
            font: '26px monospace',
            fillColor: color,
            outlineColor: Color.WHITE,
            outlineWidth: 2,
          },
        });

      default:
        return null;
    }
  }

  private createVertexEntitiesFromDto(dto: ShapeDto): Entity[] {
    if (dto.shapeType !== 'DRAW_POLYLINE' && dto.shapeType !== 'DRAW_POLYGON') {
      return [];
    }

    const locations = shapePointsToMapLocations(dto.points);
    const positions = locations.map((loc) => this.mapLocationToCartesian3(loc));
    const color = Color.fromCssColorString(dto.lineColor || '#00ffff');

    return positions.map(
      (position, index) =>
        new Entity({
          id: `${dto.id}-vertex-${index}`,
          name: `${dto.name || dto.id}-vertex-${index}`,
          position,
          point: {
            pixelSize: 11,
            color: Color.WHITE,
            outlineColor: color,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: {
            parentShapeId: dto.id,
            vertexIndex: index,
            shapeType: dto.shapeType,
          },
        }),
    );
  }

  private createHitEntitiesFromDto(dto: ShapeDto): Entity[] {
    const locations = shapePointsToMapLocations(dto.points);
    const positions = locations.map((loc) => this.mapLocationToCartesian3(loc));
    const invisibleColor = Color.WHITE.withAlpha(INVISIBLE_HIT_ALPHA);
    const lineWidth = Math.max(dto.lineWidth || 2, MIN_HIT_POLYLINE_WIDTH);

    switch (dto.shapeType) {
      case 'DRAW_CIRCLE':
        return [
          new Entity({
            id: `${dto.id}-hit-circle`,
            name: `${dto.name || dto.id}-hit-circle`,
            position: positions[0],
            ellipse: {
              semiMajorAxis: dto.radius || 100,
              semiMinorAxis: dto.radius || 100,
              material: new ColorMaterialProperty(invisibleColor),
              outline: true,
              outlineColor: invisibleColor,
              outlineWidth: lineWidth,
            },
          }),
        ];

      case 'DRAW_POLYLINE':
        return [
          new Entity({
            id: `${dto.id}-hit-line`,
            name: `${dto.name || dto.id}-hit-line`,
            polyline: {
              positions,
              width: lineWidth,
              material: new ColorMaterialProperty(invisibleColor),
              clampToGround: true,
            },
          }),
        ];

      case 'DRAW_POLYGON':
        return [
          new Entity({
            id: `${dto.id}-hit-polygon`,
            name: `${dto.name || dto.id}-hit-polygon`,
            polyline: {
              positions: [...positions, positions[0]],
              width: lineWidth,
              material: new ColorMaterialProperty(invisibleColor),
              clampToGround: true,
            },
          }),
        ];

      case 'DRAW_TEXT':
        return [
          new Entity({
            id: `${dto.id}-hit-text`,
            name: `${dto.name || dto.id}-hit-text`,
            position: positions[0],
            point: {
              pixelSize: TEXT_HIT_PIXEL_SIZE,
              color: invisibleColor,
              outlineColor: invisibleColor,
              outlineWidth: 1,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          }),
        ];

      default:
        return [];
    }
  }

  private getPolylineMaterial(lineType: OutlineType | undefined, color: Color) {
    switch (lineType) {
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

  private mapLocationToCartesian3(location: MapLocation): Cartesian3 {
    return mapLocationToCartesian3(location);
  }

  private getScreenDistanceToShape(
    savedShape: SavedShapeEntity,
    position: Cartesian2,
  ): number | null {
    const dto = savedShape.shapeDto;
    const locations = shapePointsToMapLocations(dto.points);
    const cartesianPositions = locations.map((loc) =>
      this.mapLocationToCartesian3(loc),
    );

    switch (dto.shapeType) {
      case 'DRAW_TEXT':
        return this.getScreenDistanceToPoint(cartesianPositions[0], position);
      case 'DRAW_CIRCLE':
        return this.getScreenDistanceToCircle(
          cartesianPositions[0],
          dto.radius || 0,
          position,
        );
      case 'DRAW_POLYLINE':
        return this.getScreenDistanceToPolyline(cartesianPositions, position);
      case 'DRAW_POLYGON':
        return this.getScreenDistanceToPolyline(
          [...cartesianPositions, cartesianPositions[0]],
          position,
        );
      default:
        return null;
    }
  }

  private getScreenDistanceToPoint(
    point: Cartesian3 | undefined,
    position: Cartesian2,
  ): number | null {
    if (!point || !this.viewer) {
      return null;
    }

    const screenPoint = this.viewer.scene.cartesianToCanvasCoordinates(point);
    if (!screenPoint) {
      return null;
    }

    return Math.hypot(screenPoint.x - position.x, screenPoint.y - position.y);
  }

  private getScreenDistanceToCircle(
    center: Cartesian3 | undefined,
    radiusMeters: number,
    position: Cartesian2,
  ): number | null {
    if (!center || !this.viewer) {
      return null;
    }

    const centerScreen = this.viewer.scene.cartesianToCanvasCoordinates(center);
    if (!centerScreen) {
      return null;
    }

    const distanceToCenter = Math.hypot(
      centerScreen.x - position.x,
      centerScreen.y - position.y,
    );

    if (radiusMeters <= 0) {
      return distanceToCenter;
    }

    const cartographic = Cartographic.fromCartesian(center);
    const deltaLongitude =
      radiusMeters / (6378137 * Math.max(Math.cos(cartographic.latitude), 0.1));
    const edge = Cartesian3.fromRadians(
      cartographic.longitude + deltaLongitude,
      cartographic.latitude,
      cartographic.height,
    );
    const edgeScreen = this.viewer.scene.cartesianToCanvasCoordinates(edge);
    if (!edgeScreen) {
      return distanceToCenter;
    }

    const projectedRadius = Math.hypot(
      edgeScreen.x - centerScreen.x,
      edgeScreen.y - centerScreen.y,
    );

    if (distanceToCenter <= projectedRadius) {
      return 0;
    }

    return distanceToCenter - projectedRadius;
  }

  private getScreenDistanceToPolyline(
    positions: Cartesian3[],
    position: Cartesian2,
  ): number | null {
    if (!this.viewer || positions.length < 2) {
      return null;
    }

    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < positions.length - 1; index += 1) {
      const start = this.viewer.scene.cartesianToCanvasCoordinates(
        positions[index],
      );
      const end = this.viewer.scene.cartesianToCanvasCoordinates(
        positions[index + 1],
      );
      if (!start || !end) {
        continue;
      }

      bestDistance = Math.min(
        bestDistance,
        this.getDistanceToSegment(position, start, end),
      );
    }

    return Number.isFinite(bestDistance) ? bestDistance : null;
  }

  private getDistanceToSegment(
    point: Cartesian2,
    start: Cartesian2,
    end: Cartesian2,
  ): number {
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    if (dx === 0 && dy === 0) {
      return Math.hypot(point.x - start.x, point.y - start.y);
    }

    const projection =
      ((point.x - start.x) * dx + (point.y - start.y) * dy) /
      (dx * dx + dy * dy);
    const clampedProjection = Math.max(0, Math.min(1, projection));
    const projectedX = start.x + clampedProjection * dx;
    const projectedY = start.y + clampedProjection * dy;

    return Math.hypot(point.x - projectedX, point.y - projectedY);
  }

  private emitShapesUpdate(): void {
    this._shapes$.next(Array.from(this.savedShapes.values()));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this._shapes$.complete();
    this._selectedShape$.complete();
  }
}
