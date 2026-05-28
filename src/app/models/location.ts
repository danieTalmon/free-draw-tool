export interface Coordinate {
  degrees: number;
}

export interface Altitude {
  feet: number;
}

export interface MapLocation {
  latitude: Coordinate;
  longitude: Coordinate;
  altitude: Altitude;
}
