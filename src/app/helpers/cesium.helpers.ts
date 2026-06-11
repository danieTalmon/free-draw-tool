import {
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  Matrix4,
  Transforms,
} from 'cesium';
import { MapLocation } from '@models/location';

const FEET_PER_METER = 3.28084;

/** Default number of straight segments used to approximate a circle outline. */
const DEFAULT_CIRCLE_SEGMENTS = 96;
const MIN_CIRCLE_SEGMENTS = 24;
const MAX_CIRCLE_SEGMENTS = 256;

/** Reused across iterations to avoid allocating a vector per boundary point. */
const scratchLocalOffset = new Cartesian3();

export function cartesian3ToMapLocation(cartesian: Cartesian3): MapLocation {
  const cartographic = Cartographic.fromCartesian(cartesian);
  return {
    latitude: { degrees: CesiumMath.toDegrees(cartographic.latitude) },
    longitude: { degrees: CesiumMath.toDegrees(cartographic.longitude) },
    altitude: { feet: cartographic.height * FEET_PER_METER },
  };
}

export function mapLocationToCartesian3(location: MapLocation): Cartesian3 {
  return Cartesian3.fromDegrees(
    location.longitude.degrees,
    location.latitude.degrees,
    (location.altitude?.feet ?? 0) / FEET_PER_METER,
  );
}

/**
 * Sample evenly spaced points around a circle so its outline can be drawn as a
 * polyline (which supports width and dash styles, unlike a Cesium ellipse
 * outline).
 *
 * The circle is built in a local East-North-Up frame at the center: a vector of
 * length `radius` is rotated around the up axis and projected back into world
 * (ECEF) coordinates. This is accurate for typical drawing radii and far cheaper
 * than constructing a full ellipse geometry on every frame.
 *
 * @param center   Circle center in world (ECEF) coordinates.
 * @param radius   Circle radius in meters. A non-positive radius returns `[]`.
 * @param segments Number of segments, clamped to a sane range. More segments
 *                 give a smoother ring at a small cost.
 * @returns A closed ring of positions (first point repeated at the end), or `[]`
 *          when the radius is not drawable.
 */
export function sampleCircleBoundary(
  center: Cartesian3,
  radius: number,
  segments: number = DEFAULT_CIRCLE_SEGMENTS,
): Cartesian3[] {
  if (!(radius > 0)) {
    return [];
  }

  const segmentCount = CesiumMath.clamp(
    Math.round(segments),
    MIN_CIRCLE_SEGMENTS,
    MAX_CIRCLE_SEGMENTS,
  );
  const enuToFixed = Transforms.eastNorthUpToFixedFrame(center);
  const ring: Cartesian3[] = new Array(segmentCount + 1);

  for (let i = 0; i <= segmentCount; i++) {
    const angle = (i / segmentCount) * CesiumMath.TWO_PI;
    scratchLocalOffset.x = Math.cos(angle) * radius;
    scratchLocalOffset.y = Math.sin(angle) * radius;
    scratchLocalOffset.z = 0;
    ring[i] = Matrix4.multiplyByPoint(
      enuToFixed,
      scratchLocalOffset,
      new Cartesian3(),
    );
  }

  return ring;
}
