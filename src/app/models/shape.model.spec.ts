import { ShapeDto, ShapePoint, ShapeType } from '@models/shape.model';
import { MapOperationsEnum } from '@models/map-operations-enum';
import { MapLocation } from '@models/location';
import {
  mapLocationsToShapePoints,
  mapOperationToShapeType,
  shapePointsToMapLocations,
  shapeTypeToMapOperation,
} from '@adapters/shape.adapter';

describe('Shape Model Converters', () => {
  describe('mapLocationsToShapePoints', () => {
    it('should convert empty array', () => {
      const result = mapLocationsToShapePoints([]);
      expect(result).toEqual([]);
    });

    it('should convert single location', () => {
      const locations: MapLocation[] = [
        {
          latitude: { degrees: 32.0 },
          longitude: { degrees: 34.8 },
          altitude: { feet: 1000 },
        },
      ];

      const result = mapLocationsToShapePoints(locations);

      expect(result.length).toBe(1);
      expect(result[0].coordinates.latitude).toBe(32.0);
      expect(result[0].coordinates.longitude).toBe(34.8);
      expect(result[0].altitude?.feet).toBe(1000);
    });

    it('should convert multiple locations', () => {
      const locations: MapLocation[] = [
        {
          latitude: { degrees: 32.0 },
          longitude: { degrees: 34.0 },
          altitude: { feet: 100 },
        },
        {
          latitude: { degrees: 33.0 },
          longitude: { degrees: 35.0 },
          altitude: { feet: 200 },
        },
        {
          latitude: { degrees: 34.0 },
          longitude: { degrees: 36.0 },
          altitude: { feet: 300 },
        },
      ];

      const result = mapLocationsToShapePoints(locations);

      expect(result.length).toBe(3);
      expect(result[1].coordinates.latitude).toBe(33.0);
      expect(result[2].altitude?.feet).toBe(300);
    });

    it('should handle undefined altitude', () => {
      const locations: MapLocation[] = [
        {
          latitude: { degrees: 32.0 },
          longitude: { degrees: 34.0 },
          altitude: undefined as any,
        },
      ];

      const result = mapLocationsToShapePoints(locations);

      expect(result[0].altitude?.feet).toBe(0);
    });

    it('should handle missing altitude feet', () => {
      const locations: MapLocation[] = [
        {
          latitude: { degrees: 32.0 },
          longitude: { degrees: 34.0 },
          altitude: {} as any,
        },
      ];

      const result = mapLocationsToShapePoints(locations);

      expect(result[0].altitude?.feet).toBe(0);
    });
  });

  describe('shapePointsToMapLocations', () => {
    it('should convert empty array', () => {
      const result = shapePointsToMapLocations([]);
      expect(result).toEqual([]);
    });

    it('should convert single point', () => {
      const points: ShapePoint[] = [
        {
          coordinates: { latitude: 32.0, longitude: 34.8 },
          altitude: { feet: 1000 },
        },
      ];

      const result = shapePointsToMapLocations(points);

      expect(result.length).toBe(1);
      expect(result[0].latitude.degrees).toBe(32.0);
      expect(result[0].longitude.degrees).toBe(34.8);
      expect(result[0].altitude.feet).toBe(1000);
    });

    it('should convert multiple points', () => {
      const points: ShapePoint[] = [
        {
          coordinates: { latitude: 32.0, longitude: 34.0 },
          altitude: { feet: 100 },
        },
        {
          coordinates: { latitude: 33.0, longitude: 35.0 },
          altitude: { feet: 200 },
        },
      ];

      const result = shapePointsToMapLocations(points);

      expect(result.length).toBe(2);
      expect(result[0].latitude.degrees).toBe(32.0);
      expect(result[1].longitude.degrees).toBe(35.0);
    });

    it('should handle undefined altitude', () => {
      const points: ShapePoint[] = [
        { coordinates: { latitude: 32.0, longitude: 34.0 } },
      ];

      const result = shapePointsToMapLocations(points);

      expect(result[0].altitude.feet).toBe(0);
    });

    it('should handle missing altitude feet', () => {
      const points: ShapePoint[] = [
        {
          coordinates: { latitude: 32.0, longitude: 34.0 },
          altitude: {} as any,
        },
      ];

      const result = shapePointsToMapLocations(points);

      expect(result[0].altitude.feet).toBe(0);
    });
  });

  describe('mapOperationToShapeType', () => {
    it('should convert DRAW_CIRCLE', () => {
      const result = mapOperationToShapeType(MapOperationsEnum.DRAW_CIRCLE);
      expect(result).toBe('DRAW_CIRCLE');
    });

    it('should convert DRAW_TEXT', () => {
      const result = mapOperationToShapeType(MapOperationsEnum.DRAW_TEXT);
      expect(result).toBe('DRAW_TEXT');
    });

    it('should convert DRAW_POLYLINE', () => {
      const result = mapOperationToShapeType(MapOperationsEnum.DRAW_POLYLINE);
      expect(result).toBe('DRAW_POLYLINE');
    });

    it('should convert DRAW_POLYGON', () => {
      const result = mapOperationToShapeType(MapOperationsEnum.DRAW_POLYGON);
      expect(result).toBe('DRAW_POLYGON');
    });

    it('should return null for DRAW_NONE', () => {
      const result = mapOperationToShapeType(MapOperationsEnum.DRAW_NONE);
      expect(result).toBeNull();
    });
  });

  describe('shapeTypeToMapOperation', () => {
    it('should convert DRAW_CIRCLE', () => {
      const result = shapeTypeToMapOperation('DRAW_CIRCLE');
      expect(result).toBe(MapOperationsEnum.DRAW_CIRCLE);
    });

    it('should convert DRAW_TEXT', () => {
      const result = shapeTypeToMapOperation('DRAW_TEXT');
      expect(result).toBe(MapOperationsEnum.DRAW_TEXT);
    });

    it('should convert DRAW_POLYLINE', () => {
      const result = shapeTypeToMapOperation('DRAW_POLYLINE');
      expect(result).toBe(MapOperationsEnum.DRAW_POLYLINE);
    });

    it('should convert DRAW_POLYGON', () => {
      const result = shapeTypeToMapOperation('DRAW_POLYGON');
      expect(result).toBe(MapOperationsEnum.DRAW_POLYGON);
    });
  });

  describe('Round-trip conversion', () => {
    it('should preserve data through round-trip conversion', () => {
      const originalLocations: MapLocation[] = [
        {
          latitude: { degrees: 32.5 },
          longitude: { degrees: 34.8 },
          altitude: { feet: 500 },
        },
        {
          latitude: { degrees: 33.0 },
          longitude: { degrees: 35.2 },
          altitude: { feet: 600 },
        },
      ];

      const shapePoints = mapLocationsToShapePoints(originalLocations);
      const resultLocations = shapePointsToMapLocations(shapePoints);

      expect(resultLocations.length).toBe(originalLocations.length);
      expect(resultLocations[0].latitude.degrees).toBe(
        originalLocations[0].latitude.degrees,
      );
      expect(resultLocations[1].longitude.degrees).toBe(
        originalLocations[1].longitude.degrees,
      );
      expect(resultLocations[0].altitude.feet).toBe(
        originalLocations[0].altitude.feet,
      );
    });
  });
});

describe('ShapeDto interface', () => {
  it('should allow creating a valid ShapeDto', () => {
    const dto: ShapeDto = {
      id: 'test-id',
      name: 'Test Shape',
      shapeType: 'DRAW_CIRCLE',
      points: [
        {
          coordinates: { latitude: 32.0, longitude: 34.0 },
          altitude: { feet: 0 },
        },
      ],
      radius: 500,
      lineType: 'solid' as any,
      lineWidth: 2,
      lineColor: '#00ffff',
      source: 'AGS',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    expect(dto.id).toBe('test-id');
    expect(dto.shapeType).toBe('DRAW_CIRCLE');
  });

  it('should allow optional fields', () => {
    const dto: ShapeDto = {
      name: 'Minimal Shape',
      shapeType: 'DRAW_POLYLINE',
      points: [],
      lineType: 'solid' as any,
      lineWidth: 2,
      lineColor: '#ff0000',
    };

    expect(dto.id).toBeUndefined();
    expect(dto.radius).toBeUndefined();
    expect(dto.source).toBeUndefined();
  });
});
