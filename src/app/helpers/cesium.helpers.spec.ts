import { Cartesian3, Cartographic, Math as CesiumMath } from 'cesium';
import { sampleCircleBoundary } from '@helpers/cesium.helpers';

describe('sampleCircleBoundary', () => {
  const center = Cartesian3.fromDegrees(34.0, 32.0, 0);

  it('returns an empty ring for a non-positive radius', () => {
    expect(sampleCircleBoundary(center, 0)).toEqual([]);
    expect(sampleCircleBoundary(center, -50)).toEqual([]);
  });

  it('returns a closed ring (first point repeated at the end)', () => {
    const ring = sampleCircleBoundary(center, 500, 32);

    expect(ring.length).toBe(33);
    expect(
      Cartesian3.equalsEpsilon(ring[0], ring[ring.length - 1], CesiumMath.EPSILON6),
    ).toBe(true);
  });

  it('places every point at the requested radius from the center', () => {
    const radius = 1000;
    const ring = sampleCircleBoundary(center, radius, 64);

    for (const point of ring) {
      const distance = Cartesian3.distance(center, point);
      expect(distance).toBeCloseTo(radius, 0);
    }
  });

  it('clamps the segment count to the supported range', () => {
    expect(sampleCircleBoundary(center, 500, 1).length).toBe(24 + 1);
    expect(sampleCircleBoundary(center, 500, 10000).length).toBe(256 + 1);
  });

  it('keeps the ring centered on the requested center', () => {
    const ring = sampleCircleBoundary(center, 750, 48);
    const centerCarto = Cartographic.fromCartesian(center);

    const averageLon =
      ring.reduce(
        (sum, point) => sum + Cartographic.fromCartesian(point).longitude,
        0,
      ) / ring.length;
    const averageLat =
      ring.reduce(
        (sum, point) => sum + Cartographic.fromCartesian(point).latitude,
        0,
      ) / ring.length;

    expect(averageLon).toBeCloseTo(centerCarto.longitude, 5);
    expect(averageLat).toBeCloseTo(centerCarto.latitude, 5);
  });
});
