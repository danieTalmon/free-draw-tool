import { OutlineType } from '@models/draw-event.model';

/**
 * Shape data model for API communication
 */
export interface ShapeDto {
  id?: string;
  name: string;
  shapeType: ShapeType;
  points: ShapePoint[];
  radius?: number;
  lineType: OutlineType;
  lineWidth: number;
  lineColor: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ShapeType =
  | 'DRAW_CIRCLE'
  | 'DRAW_TEXT'
  | 'DRAW_POLYLINE'
  | 'DRAW_POLYGON';

export interface ShapePoint {
  coordinates: {
    latitude: number;
    longitude: number;
  };
  altitude?: {
    feet: number;
  };
}
