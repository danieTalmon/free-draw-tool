import { Entity } from 'cesium';
import { ShapeDto } from '@models/shape.model';

export interface SavedShapeEntity {
  entity: Entity;
  shapeDto: ShapeDto;
  vertexEntities?: Entity[];
  hitEntities?: Entity[];
}
