import { MapOperationsEnum } from '@models/map-operations-enum';
import { MapLocation } from '@models/location';
import { ShapePoint, ShapeType } from '@models/shape.model';

export function mapLocationsToShapePoints(
  locations: MapLocation[],
): ShapePoint[] {
  return locations.map((loc) => ({
    coordinates: {
      latitude: loc.latitude.degrees,
      longitude: loc.longitude.degrees,
    },
    altitude: {
      feet: loc.altitude?.feet ?? 0,
    },
  }));
}

export function shapePointsToMapLocations(points: ShapePoint[]): MapLocation[] {
  return points.map((point) => ({
    latitude: { degrees: point.coordinates.latitude },
    longitude: { degrees: point.coordinates.longitude },
    altitude: { feet: point.altitude?.feet ?? 0 },
  }));
}

export function mapOperationToShapeType(
  operation: MapOperationsEnum,
): ShapeType | null {
  switch (operation) {
    case MapOperationsEnum.DRAW_CIRCLE:
      return 'DRAW_CIRCLE';
    case MapOperationsEnum.DRAW_TEXT:
      return 'DRAW_TEXT';
    case MapOperationsEnum.DRAW_POLYLINE:
      return 'DRAW_POLYLINE';
    case MapOperationsEnum.DRAW_POLYGON:
      return 'DRAW_POLYGON';
    default:
      return null;
  }
}

export function shapeTypeToMapOperation(
  shapeType: ShapeType,
): MapOperationsEnum {
  switch (shapeType) {
    case 'DRAW_CIRCLE':
      return MapOperationsEnum.DRAW_CIRCLE;
    case 'DRAW_TEXT':
      return MapOperationsEnum.DRAW_TEXT;
    case 'DRAW_POLYLINE':
      return MapOperationsEnum.DRAW_POLYLINE;
    case 'DRAW_POLYGON':
      return MapOperationsEnum.DRAW_POLYGON;
  }
}
