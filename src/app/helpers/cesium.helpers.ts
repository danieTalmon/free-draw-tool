import { Cartesian3, Cartographic, Math as CesiumMath } from 'cesium';
import { MapLocation } from '@models/location';

const FEET_PER_METER = 3.28084;

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
